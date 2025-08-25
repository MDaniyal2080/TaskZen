'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, User, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useSocketStore } from '@/store/socket-store';

interface CalendarCard {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  list: {
    id: string;
    title: string;
    board: {
      id: string;
      title: string;
    };
  };
  assignee?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  };
  labels: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

type LabelObj = { id: string; name: string; color: string };

function normalizeLabel(lr: unknown): LabelObj | null {
  if (lr && typeof lr === 'object') {
    // relation form: { label: { id, name, color } }
    if (
      'label' in lr &&
      (lr as { label?: unknown }).label &&
      typeof (lr as { label?: unknown }).label === 'object'
    ) {
      const inner = (lr as { label?: Record<string, unknown> }).label as Record<string, unknown>;
      const id = typeof inner.id === 'string' ? inner.id : undefined;
      const name = typeof inner.name === 'string' ? inner.name : undefined;
      const color = typeof inner.color === 'string' ? inner.color : undefined;
      if (id && name && color) return { id, name, color };
    }
    // plain form: { id, name, color }
    const obj = lr as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : undefined;
    const name = typeof obj.name === 'string' ? obj.name : undefined;
    const color = typeof obj.color === 'string' ? obj.color : undefined;
    if (id && name && color) return { id, name, color };
  }
  return null;
}

interface CalendarViewFiltersProps {
  priority?: string; // 'all' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assignee?: string; // 'all' | userId
  labels?: string;   // 'all' | comma-separated label IDs
  completed?: string; // 'all' | 'completed' | 'pending'
  dueDate?: string; // 'all' | 'overdue' | 'today' | 'week' | 'none'
}

export type CalendarSortBy = 'position' | 'title' | 'dueDate' | 'priority' | 'createdAt';

interface CalendarViewProps {
  boardId?: string;
  filters?: CalendarViewFiltersProps;
  sortBy?: CalendarSortBy;
  sortOrder?: 'asc' | 'desc';
}

export function CalendarView({ boardId, filters, sortBy, sortOrder = 'asc' }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [cards, setCards] = useState<CalendarCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const router = useRouter();
  const { socket, connected } = useSocketStore();
  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const start = viewMode === 'month' 
        ? startOfMonth(currentDate)
        : startOfWeek(currentDate);
      const end = viewMode === 'month'
        ? endOfMonth(currentDate)
        : endOfWeek(currentDate);

      const params: Record<string, string> = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };

      if (boardId) {
        params.boardId = boardId;
      }

      // Apply filters
      if (filters) {
        if (filters.priority && filters.priority !== 'all') {
          params.priority = String(filters.priority);
        }
        if (filters.assignee && filters.assignee !== 'all') {
          params.assigneeId = String(filters.assignee);
        }
        if (filters.labels && filters.labels !== 'all') {
          params.labels = String(filters.labels); // already comma-separated
        }
        if (filters.completed && filters.completed !== 'all') {
          params.completed = filters.completed === 'completed' ? 'true' : 'false';
        }
      }

      // Apply sorting (position is meaningless for calendar; default to dueDate)
      if (sortBy && sortBy !== 'position') {
        params.sortBy = String(sortBy);
      } else {
        params.sortBy = 'dueDate';
      }
      if (sortOrder) params.sortOrder = String(sortOrder);

      const response = await api.get('/cards/calendar', { params });
      const raw = Array.isArray(response.data) ? (response.data as unknown[]) : [];
      const normalized: CalendarCard[] = raw.map((cRaw) => {
        const c = cRaw as Partial<CalendarCard> & { labels?: unknown[] };
        const labels = Array.isArray(c.labels)
          ? c.labels
              .map(normalizeLabel)
              .filter((l): l is LabelObj => Boolean(l))
          : [];
        return { ...(c as CalendarCard), labels };
      });
      setCards(normalized);
    } catch (error: unknown) {
      console.error('Failed to fetch calendar cards:', error);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [boardId, currentDate, viewMode, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // Client-side due date category filtering within the visible dataset
  const visibleCards = useMemo(() => {
    const category = filters?.dueDate || 'all';
    if (category === 'all') return cards;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);
    return cards.filter((c) => {
      if (!c.dueDate) return false;
      const d = new Date(c.dueDate);
      switch (category) {
        case 'overdue':
          return d < today;
        case 'today':
          return d >= today && d < tomorrow;
        case 'week':
          return d >= today && d <= weekEnd;
        case 'none':
          return false; // Not applicable for calendar view
        default:
          return true;
      }
    });
  }, [cards, filters?.dueDate]);

  // Real-time refresh using socket events (works when joined to relevant board rooms)
  useEffect(() => {
    if (!socket || !connected) return;
    const handler = () => {
      // Refresh on any relevant card change
      fetchCards();
    };
    socket.on('cardCreated', handler);
    socket.on('cardUpdated', handler);
    socket.on('cardDeleted', handler);
    socket.on('cardMoved', handler);
    return () => {
      socket.off('cardCreated', handler);
      socket.off('cardUpdated', handler);
      socket.off('cardDeleted', handler);
      socket.off('cardMoved', handler);
    };
  }, [socket, connected, fetchCards]);

  const getDaysInView = () => {
    const start = viewMode === 'month'
      ? startOfWeek(startOfMonth(currentDate))
      : startOfWeek(currentDate);
    const end = viewMode === 'month'
      ? endOfWeek(endOfMonth(currentDate))
      : endOfWeek(currentDate);

    const days = [];
    let day = start;
    while (day <= end) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  };

  const getCardsForDate = (date: Date) => {
    return visibleCards.filter(card => {
      if (!card.dueDate) return false;
      return isSameDay(new Date(card.dueDate), date);
    });
  };

  const handlePrevious = () => {
    setCurrentDate(prev => subMonths(prev, viewMode === 'month' ? 1 : 0.25));
  };

  const handleNext = () => {
    setCurrentDate(prev => addMonths(prev, viewMode === 'month' ? 1 : 0.25));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleCardClick = (card: CalendarCard) => {
    router.push(`/boards/${card.list.board.id}?card=${card.id}`);
  };

  const getPriorityColor = (priority: CalendarCard['priority']) => {
    switch (priority) {
      case 'URGENT': return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'HIGH': return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      case 'LOW': return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const days = getDaysInView();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <h2 className="text-lg font-semibold">
            {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'week'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'month'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading calendar...</div>
          </div>
        ) : (
          <div className="h-full">
            {/* Week Days Header */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
              {weekDays.map(day => (
                <div
                  key={day}
                  className="px-2 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-center"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className={`grid grid-cols-7 ${viewMode === 'month' ? 'auto-rows-fr' : ''}`}>
              {days.map((day, index) => {
                const dayCards = getCardsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);

                return (
                  <div
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      min-h-[100px] p-2 border-r border-b border-gray-200 dark:border-gray-700
                      ${!isCurrentMonth ? 'bg-gray-50 dark:bg-gray-800/50' : ''}
                      ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}
                      ${isTodayDate ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                      hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`
                          text-sm font-medium
                          ${!isCurrentMonth ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}
                          ${isTodayDate ? 'text-blue-600 dark:text-blue-400' : ''}
                        `}
                      >
                        {format(day, 'd')}
                      </span>
                      {dayCards.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {dayCards.length}
                        </span>
                      )}
                    </div>

                    {/* Cards for this day */}
                    <div className="space-y-1">
                      {dayCards.slice(0, viewMode === 'month' ? 3 : 5).map(card => (
                        <div
                          key={card.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick(card);
                          }}
                          className={`
                            p-1 rounded text-xs cursor-pointer
                            ${getPriorityColor(card.priority)}
                            hover:opacity-80 transition-opacity
                          `}
                        >
                          <div className="flex items-center gap-1">
                            {card.priority === 'URGENT' && (
                              <span className="text-red-600">!</span>
                            )}
                            <span className="truncate font-medium">{card.title}</span>
                          </div>
                          {card.assignee && (
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-75">
                              <User className="h-2 w-2" />
                              <span className="truncate">
                                {card.assignee.firstName || card.assignee.username}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {dayCards.length > (viewMode === 'month' ? 3 : 5) && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                          +{dayCards.length - (viewMode === 'month' ? 3 : 5)} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected Date Details */}
      {selectedDate && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </h3>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {getCardsForDate(selectedDate).length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No tasks due on this date</p>
            ) : (
              getCardsForDate(selectedDate).map(card => (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">{card.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {card.list.board.title} → {card.list.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${getPriorityColor(card.priority)}`}>
                          {card.priority}
                        </span>
                        {card.labels.map(label => (
                          <span
                            key={label.id}
                            className="text-xs px-2 py-0.5 rounded text-white"
                            style={{ backgroundColor: label.color }}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    {card.assignee && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <User className="h-3 w-3" />
                        <span>{card.assignee.firstName || card.assignee.username}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
