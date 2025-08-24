'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, User, Calendar, FileText, Tag, MessageSquare, 
  Paperclip, UserPlus, UserMinus, Edit, Trash, Plus, 
  Clock, Filter, Download
} from 'lucide-react';
import { api } from '@/lib/api';
import { format, formatDistanceToNow, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { InlineSpinner } from '@/components/loading/LoadingStates';
import toast from 'react-hot-toast';
import { useBoardStore } from '@/store/board-store';
import { useInfiniteQuery } from '@tanstack/react-query';

interface ActivityLog {
  id: string;
  type: string;
  description: string;
  metadata: any;
  userId: string;
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  boardId?: string;
  board?: {
    id: string;
    title: string;
  };
  createdAt: string;
}

interface ActivityLogsProps {
  boardId?: string;
  cardId?: string;
  userId?: string;
  limit?: number;
  showFilters?: boolean;
}

export function ActivityLogs({ 
  boardId, 
  cardId, 
  userId, 
  limit = 50,
  showFilters = true 
}: ActivityLogsProps) {
  // Client-side filters
  const [filter, setFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');

  // Real-time activities from Zustand store
  const realtimeRaw = useBoardStore((s) => s.activities);

  // Helpers
  const toDotType = (t: string): string => {
    const map: Record<string, string> = {
      BOARD_CREATED: 'board.created',
      BOARD_UPDATED: 'board.updated',
      BOARD_DELETED: 'board.deleted',
      LIST_CREATED: 'board.list_created',
      LIST_UPDATED: 'board.list_updated',
      LIST_DELETED: 'board.list_deleted',
      CARD_CREATED: 'card.created',
      CARD_UPDATED: 'card.updated',
      CARD_MOVED: 'card.moved',
      CARD_DELETED: 'card.deleted',
      MEMBER_ADDED: 'member.added',
      MEMBER_REMOVED: 'member.removed',
      COMMENT_ADDED: 'comment.added',
    };
    if (!t) return 'activity';
    return map[t as keyof typeof map] || (t.includes('.') ? t : t.toLowerCase());
  };

  const buildDescription = (type: string, data: any): string => {
    const t = toDotType(type);
    const title = data?.title || data?.name || '';
    if (t === 'board.created') return `created the board${title ? ` "${title}"` : ''}`;
    if (t === 'board.updated') return 'updated the board';
    if (t === 'board.deleted') return `deleted the board${title ? ` "${title}"` : ''}`;
    if (t === 'card.created') return `created a card${title ? ` "${title}"` : ''}`;
    if (t === 'card.updated') return 'updated a card';
    if (t === 'card.moved') return 'moved a card';
    if (t === 'card.deleted') return `deleted a card${title ? ` "${title}"` : ''}`;
    if (t === 'member.added') return 'added a member';
    if (t === 'member.removed') return 'removed a member';
    if (t === 'comment.added') return 'added a comment';
    // lists -> treat as board-level
    if (t.startsWith('board.list_')) return t.replace('board.', '').replace('_', ' ');
    return type?.toString() || 'activity';
  };

  const normalizeActivity = (a: any): ActivityLog => {
    if (!a) return a as any;
    // If already in UI shape
    const hasDescription = typeof (a as any)?.description === 'string';
    const hasMetadata = Object.prototype.hasOwnProperty.call(a, 'metadata');
    if (hasDescription && hasMetadata) {
      return a as ActivityLog;
    }
    const dotType = toDotType((a as any)?.type);
    const metadata = (a as any)?.metadata ?? (a as any)?.data ?? {};
    const desc = buildDescription((a as any)?.type, metadata);
    return {
      id: (a as any)?.id,
      type: dotType,
      description: desc,
      metadata,
      userId: (a as any)?.userId,
      user: (a as any)?.user || { id: '', username: 'Unknown' },
      boardId: (a as any)?.boardId,
      board: (a as any)?.board,
      createdAt: (a as any)?.createdAt,
    } as ActivityLog;
  };

  const getCategory = (dotType: string): string => {
    if (!dotType) return 'other';
    if (dotType.startsWith('board.')) return 'board';
    if (dotType.startsWith('card.')) return 'card';
    if (dotType.startsWith('comment.')) return 'comment';
    if (dotType.startsWith('attachment.')) return 'attachment';
    if (dotType.startsWith('label.')) return 'label';
    if (dotType.startsWith('member.')) return 'member';
    return 'other';
  };

  // React Query: Infinite activities query (cached)
  const {
    data,
    isPending,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['activities', { boardId, cardId, userId, limit }],
    enabled: !!boardId,
    initialPageParam: 1 as number,
    queryFn: async ({ pageParam }) => {
      const params: any = { page: pageParam, pageSize: limit };
      if (cardId) params.cardId = cardId;
      if (userId) params.userId = userId;
      const response = await api.get(`/boards/${boardId}/activities`, { params });
      const items = Array.isArray(response?.data?.items) ? response.data.items : [];
      const normalized = items.map(normalizeActivity);
      return {
        items: normalized as ActivityLog[],
        hasMore: !!response?.data?.hasMore,
      };
    },
    getNextPageParam: (lastPage, allPages) => (lastPage?.hasMore ? allPages.length + 1 : undefined),
  });

  useEffect(() => {
    if (isError) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch activities:', error);
      toast.error('Failed to load activities');
    }
  }, [isError, error]);

  const getActivityIcon = (type: string) => {
    const t = toDotType(type);
    const iconMap: Record<string, React.ReactNode> = {
      'board.created': <Plus className="h-4 w-4" />,
      'board.updated': <Edit className="h-4 w-4" />,
      'board.deleted': <Trash className="h-4 w-4" />,
      'card.created': <FileText className="h-4 w-4" />,
      'card.updated': <Edit className="h-4 w-4" />,
      'card.moved': <Activity className="h-4 w-4" />,
      'card.deleted': <Trash className="h-4 w-4" />,
      'comment.added': <MessageSquare className="h-4 w-4" />,
      'attachment.uploaded': <Paperclip className="h-4 w-4" />,
      'label.added': <Tag className="h-4 w-4" />,
      'member.added': <UserPlus className="h-4 w-4" />,
      'member.removed': <UserMinus className="h-4 w-4" />,
    };
    return iconMap[t] || <Activity className="h-4 w-4" />;
  };

  const getActivityColor = (type: string) => {
    const t = toDotType(type);
    if (t.includes('created') || t.includes('added')) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (t.includes('deleted') || t.includes('removed')) return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    if (t.includes('updated') || t.includes('moved')) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
  };

  // Build merged + filtered list for display
  const realtimeNormalized = useMemo(() => (Array.isArray(realtimeRaw) ? realtimeRaw.map(normalizeActivity) : []), [realtimeRaw]);
  const activitiesFromQuery = useMemo(
    () => (data?.pages ? data.pages.flatMap((p) => p.items) : [] as ActivityLog[]),
    [data]
  );
  const displayedActivities = useMemo(() => {
    const byId = new Map<string, ActivityLog>();
    // Merge with real-time first for immediacy
    [...realtimeNormalized, ...activitiesFromQuery].forEach((a) => {
      if (a?.id) byId.set(a.id, a);
    });
    let merged = Array.from(byId.values());

    // Scope filters
    if (boardId) merged = merged.filter((a) => !a.boardId || a.boardId === boardId);
    if (cardId) merged = merged.filter((a) => (a as any)?.cardId === cardId);
    if (userId) merged = merged.filter((a) => a.userId === userId);

    // Type filter
    if (filter !== 'all') {
      merged = merged.filter((a) => getCategory(a.type) === filter);
    }

    // Date range
    if (dateRange !== 'all') {
      merged = merged.filter((a) => {
        const d = new Date(a.createdAt);
        if (dateRange === 'today') return isToday(d);
        if (dateRange === 'week') return isThisWeek(d);
        if (dateRange === 'month') return isThisMonth(d);
        return true;
      });
    }

    // Sort newest first
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return merged;
  }, [realtimeNormalized, activitiesFromQuery, boardId, cardId, userId, filter, dateRange]);

  const exportActivities = async () => {
    try {
      if (!boardId) {
        toast.error('Select a board to export activities');
        return;
      }
      const params: any = { format: 'csv' };
      if (cardId) params.cardId = cardId;
      if (userId) params.userId = userId;

      const response = await api.get(`/boards/${boardId}/activities/export`, { 
        params,
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `activities-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Activities exported successfully');
    } catch (error) {
      console.error('Failed to export activities:', error);
      toast.error('Failed to export activities');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold">Activity Log</h2>
          </div>
          <button
            onClick={exportActivities}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Export activities"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
              }}
              className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter activities by type"
            >
              <option value="all">All Activities</option>
              <option value="board">Board</option>
              <option value="card">Cards</option>
              <option value="comment">Comments</option>
              <option value="attachment">Attachments</option>
              <option value="label">Labels</option>
              <option value="member">Members</option>
            </select>

            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value as any);
              }}
              className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter activities by date"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        )}
      </div>

      {/* Activity List */}
      <div className="max-h-[600px] overflow-y-auto">
        {isPending ? (
          <div className="flex items-center justify-center p-8">
            <InlineSpinner />
          </div>
        ) : displayedActivities.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No activities found
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {displayedActivities.map((activity) => (
              <div key={activity.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex gap-3">
                  {/* Icon */}
                  <div className={`p-2 rounded-full ${getActivityColor(activity.type)}`}>
                    {getActivityIcon(activity.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium">
                            {activity.user.firstName || activity.user.username}
                          </span>{' '}
                          <span className="text-gray-600 dark:text-gray-400">
                            {activity.description}
                          </span>
                        </p>
                        
                        {activity.board && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            in {activity.board.title}
                          </p>
                        )}

                        {/* Metadata */}
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {activity.metadata.oldValue && activity.metadata.newValue && (
                              <p>
                                Changed from "{activity.metadata.oldValue}" to "{activity.metadata.newValue}"
                              </p>
                            )}
                            {activity.metadata.fileName && (
                              <p>File: {activity.metadata.fileName}</p>
                            )}
                            {activity.metadata.comment && (
                              <p className="italic">"{activity.metadata.comment}"</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <time
                        dateTime={activity.createdAt}
                        className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
                        title={format(new Date(activity.createdAt), 'PPpp')}
                      >
                        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                      </time>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasNextPage && !isFetchingNextPage && (
          <div className="p-4 text-center">
            <button
              onClick={() => fetchNextPage()}
              className="px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
            >
              Load More
            </button>
          </div>
        )}

        {isFetchingNextPage && (
          <div className="p-4 text-center">
            <InlineSpinner />
          </div>
        )}
      </div>
    </div>
  );
}
