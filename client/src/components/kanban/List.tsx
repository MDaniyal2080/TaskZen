'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, MoreHorizontal, X, Edit2 } from 'lucide-react';
import { Card } from './Card';
import toast from 'react-hot-toast';
import { useBoardStore } from '@/store/board-store';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { Card as CardType, List as ListType, Label, User } from '@/shared/types';

type CardView = CardType & {
  _count?: { comments?: number; attachments?: number } | null;
  labels?: Array<Label | { label: Label }>;
  assignee?: User;
};

const getHttpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

const getErrorMessage = (error: unknown): string | undefined =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

interface ListProps {
  list: ListType;
  cards: CardView[];
}

export function List({ list, cards }: ListProps) {
  const { createCard, updateList, deleteList } = useBoardStore();
  const { user } = useAuthStore();
  const compact = !!user?.uiPreferences?.board?.compactCardView;
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);
  const [showMenu, setShowMenu] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id });
  const { setNodeRef: setDroppableNodeRef } = useDroppable({ id: `list-droppable-${list.id}` });

  // Position and close List header menu when open
  useEffect(() => {
    if (!showMenu) return;

    const calc = () => {
      const btn = menuBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuBtnRef.current?.contains(target)) return;
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

  // No refetch needed; we rely on store updates and socket events

  const handleAddCard = async () => {
    if (!newCardTitle.trim()) return;

    try {
      await createCard(list.id, { title: newCardTitle });
      setNewCardTitle('');
      setShowAddCard(false);
      toast.success('Card created successfully');
    } catch (error: unknown) {
      console.error('Failed to create card:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to create card');
      }
    }
  };

  const handleUpdateTitle = async () => {
    if (!listTitle.trim() || listTitle === list.title) {
      setListTitle(list.title);
      setIsEditingTitle(false);
      return;
    }

    try {
      await updateList(list.id, { title: listTitle });
      setIsEditingTitle(false);
      toast.success('List title updated');
    } catch (error: unknown) {
      console.error('Failed to update list title:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to update list title');
      }
      setListTitle(list.title);
    }
  };

  const handleDeleteList = async () => {
    if (!confirm(`Are you sure you want to delete "${list.title}"?`)) return;

    try {
      await deleteList(list.id);
      toast.success('List deleted successfully');
    } catch (error: unknown) {
      console.error('Failed to delete list:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to delete list');
      }
    }
  };

  const handleArchiveList = async () => {
    try {
      await updateList(list.id, { isArchived: true });
      toast.success('List archived successfully');
    } catch (error: unknown) {
      console.error('Failed to archive list:', error);
      const status = getHttpStatus(error);
      if (status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(getErrorMessage(error) || 'Failed to archive list');
      }
    }
  };

  const sortedCards = [...cards].sort((a, b) => a.position - b.position);
  const cardIds = sortedCards.map(card => card.id);

  return (
    <div
      ref={setNodeRef}
      className="md:w-full w-auto shrink-0 md:shrink min-w-[86vw] sm:min-w-[22rem] md:min-w-0 snap-start bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-md border border-slate-200 dark:border-slate-600 h-fit max-h-full flex flex-col"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : undefined,
      }}
    >
      {/* List Header */}
      <div
        className={cn("border-b border-slate-200 dark:border-slate-600 cursor-grab active:cursor-grabbing", compact ? 'p-2' : 'p-3')}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between">
          {isEditingTitle ? (
            <input
              type="text"
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              onBlur={handleUpdateTitle}
              onKeyPress={(e) => e.key === 'Enter' && handleUpdateTitle()}
              className="flex-1 px-2 py-1 bg-transparent border border-indigo-500 rounded text-slate-900 dark:text-white font-semibold focus:outline-none"
              autoFocus
            />
          ) : (
            <h3
              onClick={() => setIsEditingTitle(true)}
              className="font-semibold text-slate-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1"
            >
              {list.title}
              <span className="text-slate-500 dark:text-slate-400 text-sm ml-1">
                ({cards.length})
              </span>
            </h3>
          )}
          <div className="relative">
            <button
              ref={menuBtnRef}
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div ref={setDroppableNodeRef} className={cn("flex-1 overflow-y-auto min-h-[100px] custom-scrollbar pr-1", compact ? 'p-1.5 space-y-1' : 'p-2 space-y-2')}>
        <SortableContext id={list.id} items={cardIds} strategy={verticalListSortingStrategy}>
          {sortedCards.map((card) => (
            <Card key={card.id} card={card} />
          ))}
        </SortableContext>

        {/* Add Card Form */}
        {showAddCard ? (
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2">
            <textarea
              placeholder="Enter a title for this card..."
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddCard}
                className="px-3 py-1 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 transition-colors"
              >
                Add Card
              </button>
              <button
                onClick={() => {
                  setShowAddCard(false);
                  setNewCardTitle('');
                }}
                className="px-3 py-1 text-slate-600 dark:text-slate-400 text-sm hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddCard(true)}
            className="w-full flex items-center gap-2 p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add a card</span>
          </button>
        )}
      </div>

      {showMenu && menuPos && createPortal(
        <div
          ref={menuRef}
          className="w-48 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 z-[2147483647]"
          style={{ position: 'fixed', top: menuPos!.top, right: menuPos!.right }}
          role="menu"
        >
          <button
            onClick={() => {
              setIsEditingTitle(true);
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Edit Title
          </button>
          <button
            onClick={() => {
              handleArchiveList();
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Archive List
          </button>
          <button
            onClick={() => {
              handleDeleteList();
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Delete List
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
