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
import { cn } from '@/lib/utils';
import type { List as ListType } from '@/shared/types';
import type { CardView } from '@/types/kanban';

// Uses CardView shape from shared Kanban types

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setDroppableNodeRef(node);
      }}
      style={style}
      className={cn(
        "bg-slate-50 dark:bg-slate-800 rounded-lg p-2 sm:p-3 w-64 sm:w-72 flex-shrink-0",
        isDragging && "opacity-50"
      )}
    >
      {/* List Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-3" {...attributes} {...listeners}>
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
            className="font-medium text-sm sm:text-base text-slate-900 dark:text-white"
          >
            {list.title}
            <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
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

      {/* Cards Container */}
      <div className="space-y-1.5 sm:space-y-2 mb-2 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
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
