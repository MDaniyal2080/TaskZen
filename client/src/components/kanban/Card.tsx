'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Calendar,
  Clock,
  MessageSquare,
  Paperclip,
  Tag,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Edit2,
  Trash2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useBoardStore } from '@/store/board-store';
import { createPortal } from 'react-dom';
import { CardDetailModal } from './CardDetailModal';
import { useAuthStore } from '@/store/auth';
import { useQueryClient } from '@tanstack/react-query';
import type { Card as CardType, Label, User } from '@/shared/types';

type LabelOrRelation = Label | { label: Label };
type CardView = CardType & {
  _count?: { comments?: number; attachments?: number } | null;
  labels?: LabelOrRelation[];
  assignee?: User;
};

const getHttpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

const getErrorMessage = (error: unknown): string | undefined =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

interface CardProps {
  card: CardView;
  isDragging?: boolean;
}

const priorityConfig = {
  LOW: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: null },
  MEDIUM: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: null },
  HIGH: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertCircle },
  URGENT: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
};

export function Card({ card, isDragging = false }: CardProps) {
  const { updateCard: updateCardInStore, deleteCard: deleteCardInStore } = useBoardStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const boardPrefs = user?.uiPreferences?.board || {};
  const compact = !!boardPrefs.compactCardView;
  const showLabelChips = boardPrefs.alwaysShowLabels ?? true;
  const anims = boardPrefs.enableAnimations ?? true;
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [editPriority, setEditPriority] = useState(card.priority || 'MEDIUM');
  const [editDueDate, setEditDueDate] = useState(
    card.dueDate ? new Date(card.dueDate).toISOString().slice(0, 10) : ''
  );
  const [showDetail, setShowDetail] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!showMenu) return;

    const calc = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setShowMenu(false);
    };

    calc();
    window.addEventListener('scroll', calc, true);
    window.addEventListener('resize', calc);
    document.addEventListener('mousedown', handleGlobalClick);
    return () => {
      window.removeEventListener('scroll', calc, true);
      window.removeEventListener('resize', calc);
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, [showMenu]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: anims ? transition : undefined,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const handleUpdate = async () => {
    if (!title.trim()) {
      setTitle(card.title);
      setIsEditing(false);
      return;
    }

    try {
      await updateCardInStore(card.id, {
        title,
        description,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      });
      setIsEditing(false);
      toast.success('Card updated successfully');
    } catch (error: unknown) {
      console.error('Failed to update card:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to update card');
      }
      setTitle(card.title);
      setDescription(card.description || '');
    }
  };

  const handleToggleComplete = async () => {
    try {
      await updateCardInStore(card.id, { isCompleted: !card.isCompleted });
      toast.success(card.isCompleted ? 'Card marked as incomplete' : 'Card marked as complete');
    } catch (error: unknown) {
      console.error('Failed to toggle card completion:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to update card');
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${card.title}"?`)) return;

    try {
      await deleteCardInStore(card.id);
      toast.success('Card deleted successfully');
    } catch (error: unknown) {
      console.error('Failed to delete card:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to delete card');
      }
    }
  };

  const priorityInfo = priorityConfig[card.priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;

  // Compute due status for chip styling
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const due = card.dueDate ? new Date(card.dueDate) : null;
  const dueStatus = card.isCompleted
    ? 'completed'
    : !due
      ? 'none'
      : due < startOfToday
        ? 'overdue'
        : due < endOfToday
          ? 'today'
          : 'future';
  const duePillClass =
    dueStatus === 'overdue'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : dueStatus === 'today'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : dueStatus === 'completed'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300';

  // Helper to format a Date to yyyy-MM-dd for input[type=date]
  const formatInputDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  // Precompute tooltip content for due pill
  const dueTooltip = due
    ? (() => {
        if (dueStatus === 'completed') return `${format(due, 'PPP')} • Completed`;
        if (dueStatus === 'overdue') {
          const dist = formatDistanceToNow(due, { addSuffix: false });
          return `${format(due, 'PPP')} • Overdue by ${dist}`;
        }
        if (dueStatus === 'today') return `${format(due, 'PPP')} • Due today`;
        const dist = formatDistanceToNow(due, { addSuffix: true });
        return `${format(due, 'PPP')} • Due ${dist}`;
      })()
    : undefined;

  if (isDragging) {
    return (
      <div className="w-full bg-white dark:bg-slate-800 rounded-lg p-3 shadow-lg border-2 border-indigo-500 opacity-90">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{card.title}</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="w-full bg-white dark:bg-slate-700 rounded-lg p-3 shadow-sm border border-indigo-500">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-2 py-1 bg-transparent border-b border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 mb-2"
          placeholder="Card title..."
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          placeholder="Add a description..."
          rows={3}
        />
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Due date</label>
            {editDueDate && (
              <button
                type="button"
                onClick={() => setEditDueDate('')}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate((e.target as HTMLInputElement).value)}
            className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setEditDueDate(formatInputDate(new Date()))}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                setEditDueDate(formatInputDate(d));
              }}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                const delta = ((8 - d.getDay()) % 7) || 7; // next Monday
                d.setDate(d.getDate() + delta);
                setEditDueDate(formatInputDate(d));
              }}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Next Monday
            </button>
          </div>
        </div>
        <div className="mt-2">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">Priority</label>
          <select
            value={editPriority}
            onChange={(e) => setEditPriority((e.target as HTMLSelectElement).value)}
            className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleUpdate}
            className="px-3 py-1 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setTitle(card.title);
              setDescription(card.description || '');
              setEditPriority(card.priority || 'MEDIUM');
              setEditDueDate(card.dueDate ? new Date(card.dueDate).toISOString().slice(0, 10) : '');
            }}
            className="px-3 py-1 text-slate-600 dark:text-slate-300 text-sm hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={() => setShowDetail(true)}
      className={cn(
        "w-full bg-white dark:bg-slate-700 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-600 group",
        compact ? 'p-2' : 'p-3',
        anims ? 'hover:shadow-md transition-all' : 'transition-none',
        card.isCompleted && "opacity-60"
      )}
    >
      {/* Card Labels (moved above title) */}
      {card.labels && card.labels.length > 0 && (
        showLabelChips ? (
          <div className="flex flex-wrap gap-1 mb-2">
            {card.labels.map((labelRelation: LabelOrRelation) => {
              const label = 'label' in labelRelation ? labelRelation.label : labelRelation;
              return (
                <span
                  key={label.id}
                  className={cn("px-2 py-0.5 text-xs font-medium rounded-full", compact && 'text-[10px] px-1.5 py-0.5')}
                  style={{ backgroundColor: label.color + '20', color: label.color }}
                >
                  {label.name}
                </span>
              );
            })}
          </div>
        ) : (
          <div className={cn("flex flex-wrap gap-1 mb-2", compact && 'mb-1')}>
            {card.labels.map((labelRelation: LabelOrRelation) => {
              const label = 'label' in labelRelation ? labelRelation.label : labelRelation;
              return (
                <span
                  key={label.id}
                  className="inline-block rounded"
                  style={{ backgroundColor: label.color, height: 6, width: 20, opacity: 0.9 }}
                />
              );
            })}
          </div>
        )
      )}

      {/* Card Header */}
      <div className="flex items-start justify-between mb-2">
        <h4 className={cn(
          "text-sm font-medium text-slate-900 dark:text-white flex-1",
          card.isCompleted && "line-through text-slate-500 dark:text-slate-400"
        )}>
          {card.title}
        </h4>
        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            ref={buttonRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          >
            <MoreHorizontal className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {/* Card Description */}
      {!compact && card.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-2 line-clamp-2">
          {card.description}
        </p>
      )}

      {/* Labels moved above title */}

      {/* Card Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className={cn("flex items-center", compact ? 'gap-2' : 'gap-3')}>
          {/* Due Date */}
          {card.dueDate && (
            <span
              title={dueTooltip}
              aria-label={dueTooltip}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
                duePillClass
              )}
            >
              <Clock className="w-3 h-3" />
              {format(new Date(card.dueDate), 'MMM d')}
            </span>
          )}

          {/* Priority (always shown) */}
          <span className={cn(
            "px-1.5 py-0.5 text-xs font-medium rounded",
            priorityInfo.color
          )}>
            {card.priority || 'MEDIUM'}
          </span>

          {/* Attachments */}
          {(card.attachments?.length > 0 || card._count?.attachments > 0) && (
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <Paperclip className="w-3 h-3" />
              <span className="text-xs">{card.attachments?.length || card._count?.attachments || 0}</span>
            </div>
          )}

          {/* Comments */}
          {(card.comments?.length > 0 || card._count?.comments > 0) && (
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <MessageSquare className="w-3 h-3" />
              <span className="text-xs">{card.comments?.length || card._count?.comments || 0}</span>
            </div>
          )}
        </div>

        {/* Assignee */}
        {card.assignee && (
          <div className="flex items-center gap-1">
            {card.assignee.avatar ? (
              <img 
                src={card.assignee.avatar} 
                alt={card.assignee.username}
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-medium">
                {(card.assignee.firstName?.[0] || card.assignee.username?.[0] || '?').toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Completion Status */}
        {card.isCompleted && (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
        )}
      </div>

      {/* Card Color Strip */}
      {card.color && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
          style={{ backgroundColor: card.color }}
        />
      )}

      {showMenu && menuPos && createPortal(
        <div
          ref={menuRef}
          className="w-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-[2147483647] min-w-max"
          style={{ position: 'fixed', top: menuPos!.top, right: menuPos!.right }}
          role="menu"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
              setShowMenu(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleComplete();
              setShowMenu(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <CheckCircle2 className="w-3 h-3" />
            {card.isCompleted ? 'Mark Incomplete' : 'Mark Complete'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
              setShowMenu(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>,
        document.body
      )}

      {/* Detail Modal */}
      <CardDetailModal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        card={card}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['board', card.boardId] })}
      />
    </div>
  );
}
