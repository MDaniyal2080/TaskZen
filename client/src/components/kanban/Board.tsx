'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
// Removed unused imports from '@dnd-kit/sortable'
import { Plus, MoreHorizontal, Filter, Calendar, LayoutGrid, SortAsc, SortDesc, Users, X, Activity } from 'lucide-react';
import { List } from './List';
import { Card } from './Card';
import { useBoardStore, extractMessage } from '@/store/board-store';
import type { BoardPayload, ListPayload, CardPayload } from '@/store/board-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { saveAsTemplate, BOARD_THEMES, BOARD_BACKGROUNDS } from '@/lib/boards';
import { CalendarView } from '@/components/calendar/CalendarView';
import type { CalendarSortBy } from '@/components/calendar/CalendarView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPortal } from 'react-dom';
import { BoardMembers } from '@/components/board/BoardMembers';
import { ActivityLogs } from '@/components/activity/ActivityLogs';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { List as ListType, Card as CardType, Label, User, Priority } from '@/shared/types';

// Local view types and mappers to satisfy strict component props
type LabelOrRelation = Label | { label: Label };
type CardView = CardType & {
  _count?: { comments?: number; attachments?: number } | null;
  labels?: LabelOrRelation[];
  assignee?: User;
};

const toDate = (v: unknown): string | undefined => {
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
    const d = new Date(v as string | number | Date);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
};

const toPriority = (p: unknown): Priority => {
  const s = typeof p === 'string' ? p.toUpperCase() : '';
  switch (s) {
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
    case 'URGENT':
      return s as Priority;
    default:
      return 'MEDIUM' as Priority;
  }
};

const toCardView = (p: CardPayload): CardView | null => {
  const listId =
    typeof p.listId === 'string'
      ? p.listId
      : (p.list && typeof p.list.id === 'string' ? (p.list.id as string) : null);
  if (!listId) return null;
  const createdAt = toDate((p as Record<string, unknown>).createdAt) ?? new Date().toISOString();
  const updatedAt = toDate((p as Record<string, unknown>).updatedAt) ?? new Date().toISOString();
  return {
    id: p.id,
    title: typeof p.title === 'string' && p.title.length > 0 ? p.title : 'Untitled',
    description: typeof p.description === 'string' ? p.description : undefined,
    position: typeof p.position === 'number' ? p.position : 0,
    dueDate: toDate(p.dueDate ?? (p as Record<string, unknown>).dueDate),
    isCompleted:
      typeof p.isCompleted === 'boolean'
        ? p.isCompleted
        : (typeof (p as Record<string, unknown>).completed === 'boolean'
            ? ((p as Record<string, unknown>).completed as boolean)
            : false),
    isArchived:
      typeof (p as Record<string, unknown>).isArchived === 'boolean'
        ? ((p as Record<string, unknown>).isArchived as boolean)
        : false,
    priority: toPriority(p.priority),
    color: typeof p.color === 'string' ? p.color : undefined,
    listId,
    assigneeId: typeof p.assigneeId === 'string' ? p.assigneeId : undefined,
    createdAt,
    updatedAt,
    _count: p._count,
  };
};

const toListType = (p: ListPayload, fallbackBoardId: string): ListType => {
  const createdAt = toDate((p as Record<string, unknown>).createdAt) ?? new Date().toISOString();
  const updatedAt = toDate((p as Record<string, unknown>).updatedAt) ?? new Date().toISOString();
  return {
    id: p.id,
    title: typeof p.title === 'string' && p.title.length > 0 ? p.title : 'Untitled List',
    position: typeof p.position === 'number' ? p.position : 0,
    isArchived: typeof p.isArchived === 'boolean' ? p.isArchived : false,
    boardId: typeof p.boardId === 'string' ? p.boardId : fallbackBoardId,
    createdAt,
    updatedAt,
  };
};

interface BoardProps {
  boardId: string;
}

export function Board({ boardId }: BoardProps) {
  const { board, lists, cards, setBoardFromData, createList, moveCard, moveList, presentUserIds } = useBoardStore();
  const { user } = useAuthStore();
  const boardPrefs = user?.uiPreferences?.board || {};
  const compact = !!boardPrefs.compactCardView;
  const anims = boardPrefs.enableAnimations ?? true;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddList, setShowAddList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setDeleting] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editBackground, setEditBackground] = useState('');
  const [editTheme, setEditTheme] = useState('default');
  const [editPrivate, setEditPrivate] = useState(false);
  const boardMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const boardMenuRef = useRef<HTMLDivElement | null>(null);
  const [boardMenuPos, setBoardMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [showActivity, setShowActivity] = useState(searchParams.get('activity') === 'true' || searchParams.has('activity'));
  
  // Mobile controls (filters/activity) menu
  const mobileControlsBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileControlsRef = useRef<HTMLDivElement | null>(null);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [mobileControlsTop, setMobileControlsTop] = useState<number | null>(null);
  
  // View mode and filters
  const [viewMode, setViewMode] = useState<'kanban' | 'calendar'>(searchParams.get('view') === 'calendar' ? 'calendar' : 'kanban');
  const [showFilters, setShowFilters] = useState(searchParams.has('filters'));
  const [filters, setFilters] = useState({
    priority: searchParams.get('priority') || 'all',
    assignee: searchParams.get('assignee') || 'all',
    labels: searchParams.get('labels') || 'all',
    dueDate: searchParams.get('dueDate') || 'all',
    completed: searchParams.get('completed') || 'all'
  });
  const isCalendarSortBy = (v: string | null): v is CalendarSortBy =>
    v === 'position' || v === 'title' || v === 'dueDate' || v === 'priority' || v === 'createdAt';
  const toSortBy = (v: string | null): CalendarSortBy => (isCalendarSortBy(v) ? v : 'position');
  const [sortBy, setSortBy] = useState<CalendarSortBy>(toSortBy(searchParams.get('sortBy')));
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc');

  const getStatus = (err: unknown): number | undefined => {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const resp = (err as { response?: unknown }).response;
      if (typeof resp === 'object' && resp !== null && 'status' in resp) {
        const status = (resp as { status?: unknown }).status;
        if (typeof status === 'number') return status;
      }
    }
    return undefined;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // React Query: fetch board data and hydrate Zustand store
  const queryClient = useQueryClient();
  const { data: boardData, error: boardError, isError: isBoardError, refetch: refetchBoard } = useQuery({
    queryKey: ['board', boardId],
    enabled: !!boardId,
    queryFn: async () => {
      const res = await api.get(`/boards/${boardId}`);
      return res.data;
    },
  });

  // Hydrate Zustand when query data changes
  useEffect(() => {
    if (boardData) {
      setBoardFromData(boardData);
    }
  }, [boardData, setBoardFromData]);

  // Handle query errors with toast
  useEffect(() => {
    if (isBoardError) {
      const status = getStatus(boardError);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractMessage(boardError) ?? 'Failed to fetch board');
      }
    }
  }, [isBoardError, boardError]);

  // Keep activity panel state in sync with URL query changes
  useEffect(() => {
    const isOpen = searchParams.get('activity') === 'true' || searchParams.has('activity');
    setShowActivity(isOpen);
  }, [searchParams]);

  // Socket connection is initiated in app/board/[id]/page.tsx
  // Avoid connecting here to prevent duplicate connections.

  // Sync edit fields when board data loads
  useEffect(() => {
    if (board) {
      setEditTitle(board.title || '');
      setEditDescription(board.description || '');
      setEditColor(board.color || '#6366f1');
      setEditBackground(board.background || '');
      setEditTheme(board.theme || 'default');
      setEditPrivate(!!board.isPrivate);
    }
  }, [board]);

  // Position and close Board header menu when open
  useEffect(() => {
    if (!showMenu) return;

    const calc = () => {
      const btn = boardMenuBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setBoardMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (boardMenuBtnRef.current?.contains(target)) return;
      if (boardMenuRef.current?.contains(target)) return;
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

  // Position and close mobile controls menu when open (small screens)
  useEffect(() => {
    if (!showMobileControls) return;

    const calc = () => {
      const btn = mobileControlsBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setMobileControlsTop(rect.bottom + 8);
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mobileControlsBtnRef.current?.contains(target)) return;
      if (mobileControlsRef.current?.contains(target)) return;
      setShowMobileControls(false);
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
  }, [showMobileControls]);

  // Presence/typing socket listeners are now registered in app/boards/[id]/page.tsx
  // to avoid duplicate handlers and ensure centralized cleanup.

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    let overId = over.id as string;
    // Support droppable container ids like 'list-droppable-<id>' coming from List.tsx
    if (typeof overId === 'string' && overId.startsWith('list-droppable-')) {
      overId = overId.replace('list-droppable-', '');
    }

    if (activeId === overId) return;

    const activeCard = cards.find(c => c.id === activeId);
    const overCard = cards.find(c => c.id === overId);

    if (!activeCard) return;

    // If dropping over a card
    if (overCard) {
      const targetListId = overCard.listId;
      const targetIndex = overCard.position;
      // Narrow types: require a definite listId and numeric position
      if (!targetListId || typeof targetIndex !== 'number') return;
      // Guard to avoid redundant updates
      if (activeCard.listId === targetListId && activeCard.position === targetIndex) return;
      moveCard(activeId, targetListId, targetIndex);
    } else {
      // Check if dropping over a list
      const overList = lists.find(l => l.id === overId);
      if (overList) {
        // Append to end when hovering over a list container
        const targetLenExcludingActive = cards.filter(c => c.listId === overList.id && c.id !== activeId).length;
        // If already last in this list, skip redundant update
        if (activeCard.listId === overList.id && activeCard.position === targetLenExcludingActive) return;
        moveCard(activeId, overList.id, targetLenExcludingActive);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    let overId = over.id as string;
    if (typeof overId === 'string' && overId.startsWith('list-droppable-')) {
      overId = overId.replace('list-droppable-', '');
    }
    // Handle list reordering first
    const activeListIndex = lists.findIndex(l => l.id === activeId);
    if (activeListIndex !== -1) {
      // Determine target index from the droppable we are over (could be list or a card within a list)
      let overIndex = lists.findIndex(l => l.id === overId);
      if (overIndex === -1) {
        const overCardForList = cards.find(c => c.id === overId);
        if (overCardForList) {
          overIndex = lists.findIndex(l => l.id === overCardForList.listId);
        }
      }

      if (overIndex === -1 || overIndex === activeListIndex) return;

      // Adjust index when moving forward to account for removal before insertion
      const newIndex = activeListIndex < overIndex ? overIndex - 1 : overIndex;

      // Optimistic update
      moveList(activeId, newIndex);

      try {
        await api.patch(`/lists/${activeId}/position`, { position: newIndex });
      } catch (error: unknown) {
        console.error('Failed to update list position:', error);
        const status = getStatus(error);
        if (status === 403) {
          toast.error('You have read-only access on this board');
        } else {
          toast.error(extractMessage(error) ?? 'Failed to move list');
        }
        // Revert changes
        await refetchBoard();
      }
      return;
    }

    // Otherwise, handle card movement
    const activeCard = cards.find(c => c.id === activeId);
    if (!activeCard) return;

    // Determine final target location
    const overCard = cards.find(c => c.id === overId);
    let targetListId: string | null = null;
    let targetIndex: number | null = null;

    if (overCard) {
      targetListId = overCard.listId ?? null;
      targetIndex = typeof overCard.position === 'number' ? overCard.position : null;
    } else {
      const overList = lists.find(l => l.id === overId);
      if (overList) {
        const lenExcludingActive = cards.filter(c => c.listId === overList.id && c.id !== activeId).length;
        targetListId = overList.id;
        targetIndex = lenExcludingActive; // append to end
      }
    }

    if (targetListId == null || targetIndex == null) return;

    // Optimistically ensure local state reflects the final drop
    if (activeCard.listId !== targetListId || activeCard.position !== targetIndex) {
      moveCard(activeId, targetListId, targetIndex);
    }

    try {
      await api.patch(`/cards/${activeId}/move`, {
        listId: targetListId,
        position: targetIndex,
      });
    } catch (error: unknown) {
      console.error('Failed to update card position:', error);
      const status = getStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractMessage(error) ?? 'Failed to move card');
      }
      // Revert changes
      await refetchBoard();
    }
  };

  const handleAddList = async () => {
    if (!newListTitle.trim()) return;

    try {
      await createList(boardId, newListTitle);
      setNewListTitle('');
      setShowAddList(false);
      toast.success('List created successfully');
    } catch (error: unknown) {
      console.error('Failed to create list:', error);
      const status = getStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractMessage(error) ?? 'Failed to create list');
      }
    }
  };
  
  const members = board?.members ?? [];
  const canEdit = !!user && (board?.ownerId === user.id || members.some((m) => m.userId === user.id && (m.role === 'OWNER' || m.role === 'ADMIN')));
  const canDelete = !!user && board?.ownerId === user.id;

  const handleUpdateBoard = async () => {
    if (!canEdit) return;
    if (!editTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    try {
      setSaving(true);
      await api.patch(`/boards/${boardId}`, {
        title: editTitle,
        description: editDescription?.trim() ? editDescription.trim() : undefined,
        color: editColor,
        background: editBackground || undefined,
        theme: editTheme || 'default',
        isPrivate: editPrivate,
      });
      toast.success('Board updated successfully');
      setShowEdit(false);
      // Invalidate to refresh board data in background
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    } catch (error: unknown) {
      console.error('Failed to update board:', error);
      const status = getStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractMessage(error) ?? 'Failed to update board');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!window.confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      await api.delete(`/boards/${boardId}`);
      toast.success('Board deleted successfully');
      router.push('/boards');
    } catch (error: unknown) {
      console.error('Failed to delete board:', error);
      const status = getStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractMessage(error) ?? 'Failed to delete board');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    try {
      setSavingTemplate(true);
      const template = await saveAsTemplate(boardId);
      toast.success(`Board saved as template: ${template.name}`);
      setShowMenu(false);
    } catch (error: unknown) {
      console.error('Failed to save as template:', error);
      const status = getStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractMessage(error) ?? 'Failed to save board as template');
      }
    } finally {
      setSavingTemplate(false);
    }
  };

  // Filter and sort cards
  const getFilteredAndSortedCards = (listId: string): CardView[] => {
    let filteredCards = cards.filter(c => c.listId === listId);
    
    // Apply filters
    if (filters.priority !== 'all') {
      filteredCards = filteredCards.filter(c => c.priority === filters.priority);
    }
    
    if (filters.completed !== 'all') {
      if (filters.completed === 'completed') {
        filteredCards = filteredCards.filter(c => c.isCompleted);
      } else {
        filteredCards = filteredCards.filter(c => !c.isCompleted);
      }
    }
    
    if (filters.dueDate !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      filteredCards = filteredCards.filter(c => {
        if (filters.dueDate === 'none') return !c.dueDate;
        if (!c.dueDate) return false;
        
        const dueDate = new Date(c.dueDate);
        switch (filters.dueDate) {
          case 'overdue':
            return dueDate < today;
          case 'today':
            return dueDate >= today && dueDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
          case 'week':
            return dueDate >= today && dueDate <= weekFromNow;
          default:
            return true;
        }
      });
    }
    
    // Apply sorting
    filteredCards.sort((a, b) => {
      switch (sortBy) {
        case 'title': {
          const aTitle = (typeof a.title === 'string' ? a.title : '').toLowerCase();
          const bTitle = (typeof b.title === 'string' ? b.title : '').toLowerCase();
          const cmp = aTitle.localeCompare(bTitle);
          return sortOrder === 'asc' ? cmp : -cmp;
        }
        case 'dueDate': {
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          if (aTime < bTime) return sortOrder === 'asc' ? -1 : 1;
          if (aTime > bTime) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        }
        case 'priority': {
          const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
          const aNum = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 0;
          const bNum = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 0;
          if (aNum < bNum) return sortOrder === 'asc' ? -1 : 1;
          if (aNum > bNum) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        }
        case 'createdAt': {
          const toTime = (v: unknown): number =>
            (typeof v === 'string' || typeof v === 'number' || v instanceof Date)
              ? new Date(v as string | number | Date).getTime()
              : 0;
          const aTime = toTime((a as Record<string, unknown>).createdAt);
          const bTime = toTime((b as Record<string, unknown>).createdAt);
          if (aTime < bTime) return sortOrder === 'asc' ? -1 : 1;
          if (aTime > bTime) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        }
        case 'position':
        default: {
          const aPos = typeof a.position === 'number' ? a.position : 0;
          const bPos = typeof b.position === 'number' ? b.position : 0;
          if (aPos < bPos) return sortOrder === 'asc' ? -1 : 1;
          if (aPos > bPos) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        }
      }
    });
    
    return filteredCards
      .map(toCardView)
      .filter((c): c is CardView => !!c);
  };
  
  const activeCardPayload = activeId ? cards.find(c => c.id === activeId) : null;
  const activeCard = activeCardPayload ? toCardView(activeCardPayload) : null;

  if (!board) {
    return (
      <>
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
      {/* Mobile Controls Menu (portal) */}
      {showMobileControls && createPortal(
        <div
          ref={mobileControlsRef}
          className="sm:hidden fixed left-2 right-2 z-[2147483646]"
          style={{ top: mobileControlsTop ?? 64 }}
          role="menu"
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg p-2">
            {viewMode === 'kanban' && (
              <button
                onClick={() => {
                  const newShowFilters = !showFilters;
                  setShowFilters(newShowFilters);
                  const params = new URLSearchParams(searchParams.toString());
                  if (newShowFilters) params.set('filters', 'true'); else params.delete('filters');
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                  setShowMobileControls(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm rounded-md transition-colors flex items-center justify-between ${
                  showFilters
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                aria-pressed={showFilters}
              >
                <span className="inline-flex items-center gap-2"><Filter className="w-4 h-4" /> Filters</span>
                <span className="text-xs opacity-70">{showFilters ? 'On' : 'Off'}</span>
              </button>
            )}
            <button
              onClick={() => {
                const newOpen = !showActivity;
                setShowActivity(newOpen);
                const params = new URLSearchParams(searchParams.toString());
                if (newOpen) params.set('activity', 'true'); else params.delete('activity');
                const qs = params.toString();
                router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                setShowMobileControls(false);
              }}
              className={`mt-1 w-full px-3 py-2 text-left text-sm rounded-md transition-colors flex items-center justify-between ${
                showActivity
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
              aria-pressed={showActivity}
            >
              <span className="inline-flex items-center gap-2"><Activity className="w-4 h-4" /> Activity</span>
              <span className="text-xs opacity-70">{showActivity ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}
      </>
    );
  }

  // Apply theme and background styling
  const selectedTheme = BOARD_THEMES.find(t => t.id === board.theme) || BOARD_THEMES[0];
  const selectedBackground = BOARD_BACKGROUNDS.find(bg => bg.id === board.background) || BOARD_BACKGROUNDS[0];
  
  const isPatternBg = !!board.background && board.background.includes('pattern');
  const boardStyle: React.CSSProperties = {
    backgroundImage:
      selectedBackground.url ||
      `linear-gradient(135deg, ${selectedTheme.colors.primary}15, ${selectedTheme.colors.secondary}15)`,
    backgroundSize: isPatternBg ? '20px 20px' : 'cover',
    backgroundRepeat: isPatternBg ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
  };

  return (
    <div className="h-full overflow-x-hidden" style={boardStyle}>
      {/* Board Header */}
      <div className={cn(
        "border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm",
        compact ? 'mt-2 px-4 py-2' : 'mt-3 sm:mt-4 md:mt-5 px-6 py-3 md:py-4'
      )}>
        <div className="flex items-center justify-between relative">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {board.title}
            </h1>
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: board.color }}
            />
            {/* Presence Avatars */}
            {presentUserIds?.length > 0 && (
              <div className="ml-1 flex -space-x-2 items-center">
                {presentUserIds.slice(0, 5).map((uid: string) => {
                  const getUserById = (id: string): BoardPayload['owner'] => {
                    if (!board) return null;
                    if (board.owner && board.owner.id === id) return board.owner;
                    const members = Array.isArray(board.members) ? board.members : [];
                    const member = members.find((m) => m.userId === id || m.user?.id === id);
                    if (!member) return null;
                    // Prefer full user object when it contains a definite id
                    if (member.user && typeof member.user.id === 'string') {
                      return { ...member.user, id: member.user.id } as BoardPayload['owner'];
                    }
                    // Fallback: construct a minimal user with the known id
                    if (typeof member.userId === 'string') {
                      return { id: member.userId } as BoardPayload['owner'];
                    }
                    return null;
                  };
                  const u = getUserById(uid);
                  const label = (u?.firstName && u?.lastName) ? `${u.firstName} ${u.lastName}` : (u?.firstName || u?.username || 'User');
                  const initials = ((u?.firstName?.[0] || u?.username?.[0] || '?') as string).toUpperCase();
                  const avatar = u?.avatar as string | undefined;
                  return (
                    <div key={uid} title={label}>
                      <Avatar className="h-7 w-7 ring-2 ring-white dark:ring-slate-900 bg-slate-200 text-slate-700 text-xs overflow-hidden">
                        <AvatarImage src={avatar} alt={label} />
                        <AvatarFallback className="bg-slate-200 text-slate-700 text-[10px]">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  );
                })}
                {presentUserIds.length > 5 && (
                  <div className="inline-flex items-center justify-center h-7 w-7 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-300 text-slate-700 text-xs">
                    +{presentUserIds.length - 5}
                  </div>
                )}
              </div>
            )}
            
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => {
                  setViewMode('kanban');
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('view');
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}
                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                  viewMode === 'kanban'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Kanban
              </button>
              <button
                onClick={() => {
                  setViewMode('calendar');
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('view', 'calendar');
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}
                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                  viewMode === 'calendar'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Calendar
              </button>
            </div>
            
            {/* Filters Toggle (only in Kanban view) - hidden on small screens */}
            {viewMode === 'kanban' && (
              <button
                onClick={() => {
                  const newShowFilters = !showFilters;
                  setShowFilters(newShowFilters);
                  const params = new URLSearchParams(searchParams.toString());
                  if (newShowFilters) params.set('filters', 'true'); else params.delete('filters');
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}
                className={`hidden sm:flex p-2 rounded-lg transition-colors items-center gap-1 ${
                  showFilters
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="text-sm">Filters</span>
              </button>
            )}

            {/* Mobile Controls Menu Button (sm) */}
            <button
              ref={mobileControlsBtnRef}
              onClick={() => setShowMobileControls(v => !v)}
              className="sm:hidden p-2 rounded-lg transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
              aria-expanded={showMobileControls}
              aria-label="Open board controls"
            >
              <Filter className="w-4 h-4" />
            </button>
            {/* Activity Panel Toggle */}
            <button
              onClick={() => {
                const newOpen = !showActivity;
                setShowActivity(newOpen);
                const params = new URLSearchParams(searchParams.toString());
                if (newOpen) params.set('activity', 'true'); else params.delete('activity');
                const qs = params.toString();
                router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
              }}
              className={`hidden sm:flex p-2 rounded-lg transition-colors items-center gap-1 ${
                showActivity
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                  : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              aria-pressed={showActivity}
              aria-label="Toggle activity panel"
            >
              <Activity className="w-4 h-4" />
              <span className="text-sm">Activity</span>
            </button>
          </div>
          {(canEdit || canDelete) && (
            <div className="relative">
              <button
                ref={boardMenuBtnRef}
                onClick={() => setShowMenu((v) => !v)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <MoreHorizontal className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          )}
        </div>
        {board.description && (
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {board.description}
          </p>
        )}
        
        {/* Filters Bar (only in Kanban view) */}
        {viewMode === 'kanban' && showFilters && (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Priority:</label>
                <Select value={filters.priority} onValueChange={(value) => {
                  setFilters(prev => ({ ...prev, priority: value }));
                  const params = new URLSearchParams(searchParams.toString());
                  if (value === 'all') params.delete('priority'); else params.set('priority', value);
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status:</label>
                <Select value={filters.completed} onValueChange={(value) => {
                  setFilters(prev => ({ ...prev, completed: value }));
                  const params = new URLSearchParams(searchParams.toString());
                  if (value === 'all') params.delete('completed'); else params.set('completed', value);
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Due Date:</label>
                <Select value={filters.dueDate} onValueChange={(value) => {
                  setFilters(prev => ({ ...prev, dueDate: value }));
                  const params = new URLSearchParams(searchParams.toString());
                  if (value === 'all') params.delete('dueDate'); else params.set('dueDate', value);
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="today">Due Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="none">No Due Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Sort:</label>
                <Select value={sortBy} onValueChange={(value) => {
                  const next = isCalendarSortBy(value) ? value : 'position';
                  setSortBy(next);
                  const params = new URLSearchParams(searchParams.toString());
                  if (next === 'position') params.delete('sortBy'); else params.set('sortBy', next);
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="position">Position</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="dueDate">Due Date</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="createdAt">Created</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => {
                    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortOrder(newOrder);
                    const params = new URLSearchParams(searchParams.toString());
                    if (newOrder === 'asc') params.delete('sortOrder'); else params.set('sortOrder', newOrder);
                    const qs = params.toString();
                    router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                  }}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                >
                  {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                </button>
              </div>
              
              <button
                onClick={() => {
                  setFilters({ priority: 'all', assignee: 'all', labels: 'all', dueDate: 'all', completed: 'all' });
                  setSortBy('position');
                  setSortOrder('asc');
                  const params = new URLSearchParams(searchParams.toString());
                  ['priority', 'assignee', 'labels', 'dueDate', 'completed', 'sortBy', 'sortOrder', 'filters'].forEach(key => params.delete(key));
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}
                className="px-3 py-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content Container */}
      <div className={cn("h-[calc(100%-120px)] overflow-x-auto overflow-y-auto custom-scrollbar pr-2 snap-x snap-mandatory md:snap-none", compact ? 'p-3' : 'p-6')}>
        {viewMode === 'calendar' ? (
          <CalendarView
            boardId={boardId}
            filters={{
              priority: filters.priority,
              assignee: filters.assignee,
              labels: filters.labels,
              completed: filters.completed,
              dueDate: filters.dueDate,
            }}
            sortBy={sortBy}
            sortOrder={sortOrder}
          />
        ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className={cn(
            "h-full flex md:grid",
            compact ? 'gap-3 md:gap-4' : 'gap-6 md:gap-7',
            "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          )}>
            <SortableContext items={lists.map(l => l.id)} strategy={horizontalListSortingStrategy}>
              {lists.map((list) => (
                <List
                  key={list.id}
                  list={toListType(list, boardId)}
                  cards={getFilteredAndSortedCards(list.id)}
                />
              ))}
            </SortableContext>

            {/* Add List Button */}
            <div className="w-full min-w-[86vw] sm:min-w-[20rem] md:min-w-0 shrink-0 md:shrink snap-start">
              {showAddList ? (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                  <input
                    type="text"
                    placeholder="Enter list title..."
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddList()}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleAddList}
                      className="px-3 py-1 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
                    >
                      Add List
                    </button>
                    <button
                      onClick={() => {
                        setShowAddList(false);
                        setNewListTitle('');
                      }}
                      className="px-3 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddList(true)}
                  className="w-full flex items-center gap-2 p-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all border-2 border-dashed border-slate-300 dark:border-slate-600"
                >
                  <Plus className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                    Add another list
                  </span>
                </button>
              )}
            </div>
          </div>

          <DragOverlay dropAnimation={anims ? undefined : null}>
            {activeCard && <Card card={activeCard} isDragging />}
          </DragOverlay>
        </DndContext>
        )}
      </div>

      {/* Right-side Activity Panel */}
      {showActivity && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowActivity(false);
              const params = new URLSearchParams(searchParams.toString());
              params.delete('activity');
              const qs = params.toString();
              router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
            }}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                <h3 className="text-base font-semibold">Activity</h3>
              </div>
              <button
                onClick={() => {
                  setShowActivity(false);
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('activity');
                  const qs = params.toString();
                  router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
                }}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                aria-label="Close activity panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <ActivityLogs boardId={boardId} />
            </div>
          </div>
        </div>
      )}

      {showMenu && boardMenuPos && createPortal(
        <div
          ref={boardMenuRef}
          className="w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-[2147483647]"
          style={{ position: 'fixed', top: boardMenuPos!.top, right: boardMenuPos!.right }}
          role="menu"
        >
          {canEdit && (
            <button
              onClick={() => { setShowEdit(true); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Edit Board
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { setShowMembers(true); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Manage Members
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleSaveAsTemplate}
              disabled={savingTemplate}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {savingTemplate ? 'Saving...' : 'Save as Template'}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => { setShowMenu(false); handleDeleteBoard(); }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete Board
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Members Modal */}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowMembers(false)}>
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Board Members</h2>
              <button
                onClick={() => setShowMembers(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <BoardMembers
              boardId={boardId}
              board={board}
              currentUserId={user?.id || ''}
            />
          </div>
        </div>
      )}

      {/* Edit Board Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowEdit(false)}>
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Edit Board</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Title</label>
                <input
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded bg-transparent"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Board title"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Description</label>
                <input
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded bg-transparent"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Color</label>
                  <input
                    type="color"
                    className="h-10 w-full border border-slate-200 dark:border-slate-600 rounded"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Theme</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded bg-transparent"
                    value={editTheme}
                    onChange={(e) => setEditTheme(e.target.value)}
                  >
                    {BOARD_THEMES.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Background</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded bg-transparent"
                  value={editBackground}
                  onChange={(e) => setEditBackground(e.target.value)}
                >
                  {BOARD_BACKGROUNDS.map((bg) => (
                    <option key={bg.id} value={bg.id}>
                      {bg.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editPrivate} onChange={(e) => setEditPrivate(e.target.checked)} />
                  <span className="text-sm">Private board</span>
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowEdit(false)}
                className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateBoard}
                className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Edit Board Modal
// Rendered at end to avoid layout issues
export function EditBoardModal() { return null }
