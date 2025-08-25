'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Edit2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useSocketStore } from '@/store/socket-store';
import { useBoardStore } from '@/store/board-store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useSettings } from '@/contexts/SettingsContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// HTTP error helpers
const getHttpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;
const getErrorMessage = (error: unknown): string | undefined =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
}

interface CommentsProps {
  cardId: string;
  onCountChange?: (count: number) => void;
}

type CommentCreatedPayload = { cardId: string; comment: Comment };
type CommentUpdatedPayload = { cardId: string; comment: Comment };
type CommentDeletedPayload = { cardId: string; id: string };

export function Comments({ cardId, onCountChange }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const { board } = useBoardStore();
  const typingStopTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { settings } = useSettings();
  const commentsEnabled = settings?.features?.enableComments !== false;

  // Notify parent about count changes in an effect to avoid parent state updates during render
  useEffect(() => {
    if (!onCountChange) return;
    if (commentsEnabled) {
      onCountChange(comments.length);
    } else {
      onCountChange(0);
    }
  }, [comments.length, commentsEnabled, onCountChange]);

  const emitTypingStart = useCallback(() => {
    if (!commentsEnabled || !socket || !board?.id || !cardId) return;
    try {
      socket.emit('typingStart', { boardId: board.id, cardId });
    } catch {}
  }, [commentsEnabled, socket, board?.id, cardId]);
  const emitTypingStop = useCallback(() => {
    if (!commentsEnabled || !socket || !board?.id || !cardId) return;
    try {
      socket.emit('typingStop', { boardId: board.id, cardId });
    } catch {}
  }, [commentsEnabled, socket, board?.id, cardId]);
  const scheduleTypingStop = (delay = 1500) => {
    if (typingStopTimeout.current) clearTimeout(typingStopTimeout.current);
    typingStopTimeout.current = setTimeout(() => {
      emitTypingStop();
    }, delay);
  };

  const fetchComments = useCallback(async () => {
    try {
      const response = await api.get(`/comments/card/${cardId}`);
      setComments(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch comments:', error);
    }
  }, [cardId]);

  useEffect(() => {
    if (!commentsEnabled) {
      setComments([]);
      return () => {
        if (typingStopTimeout.current) clearTimeout(typingStopTimeout.current);
      };
    }
    fetchComments();
    return () => {
      if (typingStopTimeout.current) clearTimeout(typingStopTimeout.current);
      emitTypingStop();
    };
  }, [cardId, commentsEnabled, fetchComments, emitTypingStop]);

  // Realtime comment events
  useEffect(() => {
    if (!commentsEnabled || !socket) return;
    const onCreated = (data: CommentCreatedPayload) => {
      if (!data || data.cardId !== cardId) return;
      setComments((prev) => {
        if (!data?.comment) return prev;
        if (prev.some((c) => c.id === data.comment.id)) return prev;
        const next = [data.comment, ...prev];
        return next;
      });
    };
    const onUpdated = (data: CommentUpdatedPayload) => {
      if (!data || data.cardId !== cardId) return;
      if (!data?.comment) return;
      setComments((prev) => prev.map((c) => (c.id === data.comment.id ? data.comment : c)));
    };
    const onDeleted = (data: CommentDeletedPayload) => {
      if (!data || data.cardId !== cardId) return;
      if (!data?.id) return;
      setComments((prev) => {
        const next = prev.filter((c) => c.id !== data.id);
        return next;
      });
    };
    socket.on('commentCreated', onCreated);
    socket.on('commentUpdated', onUpdated);
    socket.on('commentDeleted', onDeleted);
    return () => {
      socket.off('commentCreated', onCreated);
      socket.off('commentUpdated', onUpdated);
      socket.off('commentDeleted', onDeleted);
    };
  }, [commentsEnabled, socket, cardId, onCountChange]);

  

  const handleAddComment = async () => {
    if (!commentsEnabled) {
      toast.error('Comments are disabled by the administrator.');
      return;
    }
    if (!newComment.trim()) return;

    setLoading(true);
    try {
      const response = await api.post('/comments', {
        cardId,
        content: newComment,
      });
      const next = [response.data, ...comments];
      setComments(next);
      setNewComment('');
      toast.success('Comment added');
      emitTypingStop();
    } catch (error: unknown) {
      if (getHttpStatus(error) === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to add comment');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateComment = async (id: string) => {
    if (!commentsEnabled) {
      toast.error('Comments are disabled by the administrator.');
      return;
    }
    if (!editContent.trim()) return;

    try {
      const response = await api.patch(`/comments/${id}`, {
        content: editContent,
      });
      setComments(comments.map(c => c.id === id ? response.data : c));
      setEditingId(null);
      setEditContent('');
      toast.success('Comment updated');
      emitTypingStop();
    } catch (error: unknown) {
      if (getHttpStatus(error) === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to update comment');
      }
    }
  };

  const handleDeleteComment = async (id: string) => {
    if (!commentsEnabled) {
      toast.error('Comments are disabled by the administrator.');
      return;
    }
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      await api.delete(`/comments/${id}`);
      const next = comments.filter(c => c.id !== id);
      setComments(next);
      toast.success('Comment deleted');
    } catch (error: unknown) {
      if (getHttpStatus(error) === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to delete comment');
      }
    }
  };

  const getAuthorName = (author: Comment['author']) => {
    if (author.firstName || author.lastName) {
      return `${author.firstName || ''} ${author.lastName || ''}`.trim();
    }
    return author.username;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <MessageSquare className="h-4 w-4" />
        <span>Comments {commentsEnabled ? `(${comments.length})` : '(disabled)'}</span>
      </div>

      {/* Add Comment */}
      {commentsEnabled ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => { setNewComment(e.target.value); emitTypingStart(); scheduleTypingStop(); }}
            onFocus={() => { emitTypingStart(); scheduleTypingStop(); }}
            onBlur={() => emitTypingStop()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddComment();
            }}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={loading}
          />
          <button
            onClick={handleAddComment}
            disabled={loading || !newComment.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Comments are disabled by the administrator.
        </div>
      )}

      {/* Comments List */}
      {commentsEnabled && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <Avatar className="w-8 h-8">
                <AvatarImage src={comment.author.avatar} alt={getAuthorName(comment.author)} />
                <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                  {(comment.author.firstName?.[0] || comment.author.username?.[0] || '?').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {getAuthorName(comment.author)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(comment.createdAt), 'MMM d, h:mm a')}
                  </span>
                </div>
                
                {user?.id === comment.author.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditContent(comment.content);
                      }}
                      className="p-1 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {editingId === comment.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => { setEditContent(e.target.value); emitTypingStart(); scheduleTypingStop(); }}
                    onFocus={() => { emitTypingStart(); scheduleTypingStop(); }}
                    onBlur={() => emitTypingStop()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateComment(comment.id);
                      if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditContent('');
                        emitTypingStop();
                      }
                    }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdateComment(comment.id)}
                    className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditContent('');
                    }}
                    className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 break-words">
                  {comment.content}
                </p>
              )}

              {comment.updatedAt !== comment.createdAt && !editingId && (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  (edited)
                </span>
              )}
            </div>
          </div>
          ))}

          {comments.length === 0 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
              No comments yet. Be the first to comment!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
