"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Clock, 
  MessageSquare, 
  Paperclip, 
  CheckCircle2, 
  Plus, 
  Upload,
  Download,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useSocketStore } from "@/store/socket-store";
import { useBoardStore } from "@/store/board-store";
import { useAuthStore } from "@/store/auth";
import type { AxiosError } from "axios";
import type { Attachment } from "@/shared/types";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { Labels } from "@/components/card/Labels";
import { Comments } from "@/components/card/Comments";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Pluggable, PluggableList } from "unified";
import { useSettings } from "@/contexts/SettingsContext";
import type { BoardMemberPayload } from "@/store/board-store";

// Lightweight local types to avoid any
type UserLike = {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatar?: string;
};

type ChecklistItem = {
  id: string;
  text: string;
  isCompleted: boolean;
};

const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
type PriorityKey = typeof PRIORITY_VALUES[number];

type CardLike = {
  id: string;
  boardId?: string;
  title?: string;
  description?: string | null;
  dueDate?: string | Date | null;
  isCompleted?: boolean;
  priority?: PriorityKey;
  attachments?: Attachment[];
  checklistItems?: ChecklistItem[];
  comments?: unknown[];
  _count?: { comments?: number; attachments?: number } | null;
};

// Type-safe plugin list for react-markdown to avoid vfile type mismatches
const gfmPlugins: PluggableList = [remarkGfm as unknown as Pluggable];

interface CardDetailModalProps {
  open: boolean;
  onClose: () => void;
  card: CardLike;
  onSaved?: () => void;
}

const priorityConfig = {
  LOW: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Low' },
  MEDIUM: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Medium' },
  HIGH: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: 'High' },
  URGENT: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Urgent' },
};

export function CardDetailModal({ open, onClose, card, onSaved }: CardDetailModalProps) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(!!card?.isCompleted);
  const [dueDateStr, setDueDateStr] = useState<string>(
    card?.dueDate ? new Date(card.dueDate).toISOString().slice(0, 10) : ""
  );
  const [priority, setPriority] = useState<PriorityKey>(
    PRIORITY_VALUES.includes(card?.priority as PriorityKey)
      ? (card?.priority as PriorityKey)
      : 'MEDIUM'
  );
  const [attachments, setAttachments] = useState<Attachment[]>(
    Array.isArray(card?.attachments) ? (card.attachments as Attachment[]) : []
  );
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
    Array.isArray(card?.checklistItems) ? (card.checklistItems as ChecklistItem[]) : []
  );
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingStopTimeout = useRef<number | null>(null);
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const [commentCount, setCommentCount] = useState<number>((card?.comments?.length ?? card?._count?.comments ?? 0) as number);

  const { socket } = useSocketStore();
  const { typingByCard, board, updateCard: updateCardInStore, handleCardUpdated } = useBoardStore();
  const { user } = useAuthStore();
  const { settings } = useSettings();
  const commentsEnabled = settings?.features?.enableComments !== false;
  const fileUploadsEnabled = settings?.features?.enableFileUploads !== false;

  // Helpers to get user display data
  const getUserById = (id: string): UserLike | null => {
    if (!board) return null;
    // Owner check
    if (board.owner?.id === id) {
      const o = board.owner;
      return {
        id: o.id,
        firstName: o.firstName,
        lastName: o.lastName,
        username: o.username,
        avatar: o.avatar,
      };
    }
    // Member lookup aligned to BoardMemberPayload typing
    const members: BoardMemberPayload[] = Array.isArray(board.members) ? board.members : [];
    const member = members.find((m) => m.userId === id || m.user?.id === id);
    if (member?.user && typeof member.user.id === 'string') {
      const u = member.user;
      return {
        id: id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        avatar: u.avatar,
      };
    }
    if (member?.userId === id) {
      // Minimal user shape when only userId is known
      return { id };
    }
    return null;
  };
  const displayName = (u: UserLike | null | undefined) => (u?.firstName && u?.lastName) ? `${u.firstName} ${u.lastName}` : (u?.firstName || u?.username || 'User');

  const typingIds: string[] = (typingByCard?.[card?.id] || []).filter((id: string) => id !== user?.id);
  const typingUsers = typingIds.map((id) => getUserById(id)).filter((u): u is UserLike => Boolean(u));
  const typingSummary = typingUsers.length === 0
    ? ''
    : typingUsers.length === 1
    ? `${displayName(typingUsers[0])} is typing...`
    : typingUsers.length === 2
    ? `${displayName(typingUsers[0])} and ${displayName(typingUsers[1])} are typing...`
    : `${displayName(typingUsers[0])} and ${typingUsers.length - 1} others are typing...`;

  const emitTypingStart = () => {
    if (!socket || !board?.id || !card?.id) return;
    try {
      socket.emit('typingStart', { boardId: board.id, cardId: card.id });
    } catch {}
  };
  const emitTypingStop = () => {
    if (!socket || !board?.id || !card?.id) return;
    try {
      socket.emit('typingStop', { boardId: board.id, cardId: card.id });
    } catch {}
  };
  const scheduleTypingStop = (delay = 1500) => {
    if (typingStopTimeout.current) window.clearTimeout(typingStopTimeout.current);
    typingStopTimeout.current = window.setTimeout(() => {
      emitTypingStop();
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (typingStopTimeout.current) window.clearTimeout(typingStopTimeout.current);
      emitTypingStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prevent background scroll when modal is open (mobile friendly)
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const style = document.body.style;
    const prevTouch = style.getPropertyValue('touch-action') || undefined;
    document.body.style.overflow = 'hidden';
    style.setProperty('touch-action', 'none');
    return () => {
      document.body.style.overflow = prevOverflow;
      if (prevTouch !== undefined) {
        style.setProperty('touch-action', prevTouch);
      } else {
        style.removeProperty('touch-action');
      }
    };
  }, [open]);

  // Listen for cardUpdated events to sync attachments and checklist items
  useEffect(() => {
    if (!socket || !open || !card?.id) return;
    const onCardUpdated = (data: Partial<CardLike>) => {
      if (!data?.id || data.id !== card.id) return;
      if (Array.isArray(data.attachments)) {
        setAttachments(data.attachments as Attachment[]);
      }
      if (Array.isArray(data.checklistItems)) {
        setChecklistItems(data.checklistItems as ChecklistItem[]);
      }
    };
    socket.on('cardUpdated', onCardUpdated);
    return () => {
      socket.off('cardUpdated', onCardUpdated);
    };
  }, [socket, open, card?.id]);

  // Close modal if the currently viewed card is deleted elsewhere
  useEffect(() => {
    if (!socket || !open || !card?.id) return;
    const onCardDeleted = (payload: unknown) => {
      let deletedId: string | undefined;
      if (typeof payload === 'string') {
        deletedId = payload;
      } else if (
        payload &&
        typeof payload === 'object' &&
        'id' in (payload as Record<string, unknown>) &&
        typeof (payload as { id?: unknown }).id === 'string'
      ) {
        deletedId = (payload as { id: string }).id;
      }
      if (deletedId && deletedId === card.id) {
        try { toast.success('This card was deleted'); } catch {}
        onClose();
      }
    };
    socket.on('cardDeleted', onCardDeleted);
    return () => {
      socket.off('cardDeleted', onCardDeleted);
    };
  }, [socket, open, card?.id, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    if (!card) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      setSaving(true);
      await updateCardInStore(card.id, {
        title,
        description,
        isCompleted,
        priority,
        dueDate: dueDateStr ? new Date(dueDateStr).toISOString() : null,
      });
      toast.success("Card updated");
      try {
        onSaved?.();
      } catch (cbErr) {
        console.warn('onSaved callback failed:', cbErr);
      }
      onClose();
    } catch (error: unknown) {
      console.error("Failed to update card:", error);
      const err = error as AxiosError<{ message?: string }>;
      const status = err?.response?.status;
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to update card');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!fileUploadsEnabled) {
      toast.error('File uploads are disabled by the administrator.');
      return;
    }
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await api.post<Attachment[]>(`/cards/${card.id}/attachments`, formData);
      const next = [...attachments, ...response.data];
      setAttachments(next);
      try { handleCardUpdated({ id: card.id, attachments: next, _count: { attachments: next.length } }); } catch {}
      toast.success('Files uploaded successfully');
    } catch (error: unknown) {
      console.error('Failed to upload files:', error);
      const err = error as AxiosError<{ message?: string }>;
      if (err?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to upload files');
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!fileUploadsEnabled) {
      toast.error('Attachment deletion is disabled by the administrator.');
      return;
    }
    try {
      await api.delete(`/cards/attachments/${attachmentId}`);
      const next = attachments.filter((a: Attachment) => a.id !== attachmentId);
      setAttachments(next);
      try { handleCardUpdated({ id: card.id, attachments: next, _count: { attachments: next.length } }); } catch {}
      toast.success('Attachment deleted');
    } catch (error: unknown) {
      console.error('Failed to delete attachment:', error);
      const err = error as AxiosError<{ message?: string }>;
      if (err?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to delete attachment');
      }
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistItem.trim()) return;
    try {
      const res = await api.post<ChecklistItem>(`/cards/${card.id}/checklist`, { text: newChecklistItem });
      setChecklistItems([...
        checklistItems,
        res.data,
      ]);
      setNewChecklistItem('');
      toast.success('Checklist item added');
    } catch (error: unknown) {
      console.error('Failed to add checklist item:', error);
      const err = error as AxiosError<{ message?: string }>;
      if (err?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to add checklist item');
      }
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    const current = checklistItems.find((i) => i.id === itemId);
    if (!current) return;
    try {
      const res = await api.patch<ChecklistItem>(`/cards/checklist/${itemId}`, { isCompleted: !current.isCompleted });
      setChecklistItems(checklistItems.map((i) => i.id === itemId ? res.data : i));
    } catch (error: unknown) {
      console.error('Failed to update checklist item:', error);
      const err = error as AxiosError<{ message?: string }>;
      if (err?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to update checklist item');
      }
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    try {
      await api.delete(`/cards/checklist/${itemId}`);
      setChecklistItems(checklistItems.filter((item) => item.id !== itemId));
      toast.success('Checklist item deleted');
    } catch (error: unknown) {
      console.error('Failed to delete checklist item:', error);
      const err = error as AxiosError<{ message?: string }>;
      if (err?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to delete checklist item');
      }
    }
  };

  const body = (
    <div className="fixed inset-0 z-[2147483647]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-2xl mt-10 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <input
              className="w-full px-2 py-1 bg-transparent text-lg font-semibold text-slate-900 dark:text-white focus:outline-none"
              value={title}
              onChange={(e) => { setTitle(e.target.value); emitTypingStart(); scheduleTypingStop(); }}
              onFocus={() => { emitTypingStart(); scheduleTypingStop(); }}
              onBlur={() => emitTypingStop()}
            />
          </div>

          {/* Typing indicator for this card */}
          {typingUsers.length > 0 && (
            <div className="px-5 pt-2 -mt-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="flex -space-x-2">
                  {typingUsers.slice(0, 3).map((u: UserLike) => {
                    const initials = ((u?.firstName?.[0] || u?.username?.[0] || '?') as string).toUpperCase();
                    const avatar = u?.avatar as string | undefined;
                    const label = displayName(u);
                    return (
                      <div key={u.id} title={label}>
                        <Avatar className="h-6 w-6 ring-2 ring-white dark:ring-slate-900 bg-slate-200 text-slate-700 text-[10px] overflow-hidden">
                          <AvatarImage src={avatar ?? ''} alt={label} />
                          <AvatarFallback className="bg-slate-200 text-slate-700 text-[10px]">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    );
                  })}
                  {typingUsers.length > 3 && (
                    <div className="inline-flex items-center justify-center h-6 w-6 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-300 text-slate-700 text-[10px]">
                      +{typingUsers.length - 3}
                    </div>
                  )}
                </div>
                <span>{typingSummary}</span>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-5 py-4 space-y-6 flex-1 overflow-y-auto min-h-0">
            {/* Labels */}
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Labels</label>
              <div className="mt-2">
                {(board?.id || card.boardId) && (
                  <Labels cardId={card.id} boardId={(board?.id ?? card.boardId)!} />
                )}
              </div>
            </div>

            {/* Due Date and Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none"
                  value={dueDateStr}
                  onChange={(e) => setDueDateStr(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityKey)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none"
                >
                  {Object.entries(priorityConfig).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Completion Status */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="completed"
                checked={isCompleted}
                onChange={(e) => setIsCompleted(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="completed" className="text-sm text-slate-700 dark:text-slate-300">
                Mark as completed
              </label>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setDescTab('write')}
                  className={cn(
                    "px-2 py-1 text-xs rounded border",
                    descTab === 'write'
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                  )}
                >
                  Write
                </button>
                <button
                  onClick={() => setDescTab('preview')}
                  className={cn(
                    "px-2 py-1 text-xs rounded border",
                    descTab === 'preview'
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                  )}
                >
                  Preview
                </button>
              </div>
              {descTab === 'write' ? (
                <textarea
                  className="w-full min-h-[120px] px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Add a more detailed description... Markdown supported"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); emitTypingStart(); scheduleTypingStop(); }}
                  onFocus={() => { emitTypingStart(); scheduleTypingStop(); }}
                  onBlur={() => emitTypingStop()}
                />
              ) : (
                <div className="w-full min-h-[120px] px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white">
                  <ReactMarkdown remarkPlugins={gfmPlugins}>
                    {description || '*No description yet.*'}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Attachments</label>
                {fileUploadsEnabled ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    Upload Files
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Uploads disabled</span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={!fileUploadsEnabled}
              />
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((attachment: Attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-sm text-slate-700 dark:text-slate-300 break-all max-w-full">
                          {attachment.originalName || attachment.filename}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0">({Math.round(attachment.size / 1024)}KB)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const base = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
                            const url = attachment.url?.startsWith('/') ? `${base}${attachment.url}` : attachment.url;
                            if (url) window.open(url, '_blank');
                          }}
                          className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!fileUploadsEnabled}
                          title={!fileUploadsEnabled ? 'Uploads are disabled' : undefined}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Checklist</label>
              </div>
              <div className="space-y-2">
                {checklistItems.map((item: ChecklistItem) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => handleToggleChecklistItem(item.id)}
                      className="rounded"
                    />
                    <span className={cn(
                      "flex-1 text-sm",
                      item.isCompleted ? "line-through text-slate-500" : "text-slate-700 dark:text-slate-300"
                    )}>
                      {item.text}
                    </span>
                    <button
                      onClick={() => handleDeleteChecklistItem(item.id)}
                      className="p-1 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add checklist item..."
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                    className="flex-1 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded"
                  />
                  <button
                    onClick={handleAddChecklistItem}
                    className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div>
              {commentsEnabled ? (
                <Comments cardId={card.id} onCountChange={setCommentCount} />
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">Comments are disabled by the administrator.</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300">
              {(dueDateStr || card?.dueDate) && (
                <div className="inline-flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">
                    {dueDateStr
                      ? format(new Date(dueDateStr), "MMM d, yyyy")
                      : card?.dueDate
                      ? format(new Date(card.dueDate), "MMM d, yyyy")
                      : null}
                  </span>
                </div>
              )}
              {(((attachments?.length ?? 0) > 0) || ((card?._count?.attachments ?? 0) > 0)) && (
                <div className="inline-flex items-center gap-1">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-sm">{attachments?.length ?? (card?._count?.attachments ?? 0)} attachments</span>
                </div>
              )}
              {commentsEnabled && commentCount > 0 && (
                <div className="inline-flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm">{commentCount} comments</span>
                </div>
              )}
              {isCompleted && (
                <div className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Completed</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
