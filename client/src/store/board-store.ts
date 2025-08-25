import { create } from 'zustand';
import { api } from '@/lib/api';

// Lightweight payload types used by the board store to avoid `any` while
// remaining flexible about backend response shapes.
export type CardPayload = {
  id: string;
  title?: string;
  description?: string;
  position?: number | null;
  dueDate?: string | Date | null;
  isCompleted?: boolean;
  completed?: boolean;
  priority?: string;
  color?: string | null;
  assigneeId?: string | null;
  listId?: string;
  list?: { id?: string | null } | null;
  boardId?: string;
  board?: { id?: string | null } | null;
  comments?: Array<Record<string, unknown>>;
  _count?: { comments?: number; attachments?: number };
} & Record<string, unknown>;

export type ListPayload = {
  id: string;
  title?: string;
  position?: number | null;
  isArchived?: boolean;
  boardId?: string;
  cards?: CardPayload[] | null;
} & Record<string, unknown>;

// Lightweight member payload to improve type-safety without over-constraining
export type BoardMemberPayload = {
  id?: string;
  userId?: string;
  role?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | string;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  } | null;
} & Record<string, unknown>;

export type BoardPayload = {
  id: string;
  // Explicit fields used throughout the UI
  title: string;
  description?: string | null;
  color: string;
  background?: string | null;
  theme?: string;
  isPrivate?: boolean;
  isArchived?: boolean;
  ownerId?: string;
  owner?: {
    id: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  } | null;
  members?: BoardMemberPayload[];
  lists?: ListPayload[] | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
} & Record<string, unknown>;

type ActivityEntity = { id?: string } & Record<string, unknown>;
type CommentEntity = { id?: string } & Record<string, unknown>;
type CreateCardInput = {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  assigneeId?: string;
  color?: string;
};

// Safe helpers for unknown-shaped payloads
const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

export const extractMessage = (err: unknown): string | undefined => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data)) {
    const msg = err.response.data.message;
    if (typeof msg === 'string') return msg;
  }
  return undefined;
};

interface BoardState {
  board: BoardPayload | null;
  lists: ListPayload[];
  cards: CardPayload[];
  loading: boolean;
  error: string | null;
  
  // Presence and typing state
  presentUserIds: string[];
  typingByCard: Record<string, string[]>;
  
  // Realtime activities buffer (most recent first)
  activities: ActivityEntity[];
  
  // Actions
  setBoardFromData: (board: BoardPayload) => void;
  fetchBoard: (boardId: string) => Promise<void>;
  createList: (boardId: string, title: string) => Promise<void>;
  updateList: (listId: string, data: Partial<ListPayload>) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  createCard: (listId: string, data: CreateCardInput) => Promise<void>;
  updateCard: (cardId: string, data: Partial<CardPayload> & Record<string, unknown>) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  moveCard: (cardId: string, newListId: string, newPosition: number) => void;
  moveList: (listId: string, newIndex: number) => void;
  updateCardPosition: (cardId: string, listId: string, position: number) => void;
  
  // Real-time updates
  handleBoardUpdate: (data: Partial<BoardPayload>) => void;
  handleListCreated: (data: ListPayload) => void;
  handleListUpdated: (data: ListPayload) => void;
  handleListDeleted: (data: { id: string }) => void;
  handleCardCreated: (data: CardPayload) => void;
  handleCardUpdated: (data: Partial<CardPayload> & Record<string, unknown>) => void;
  handleCardMoved: (data: { id: string; listId: string; position: number }) => void;
  handleCardDeleted: (data: { id: string }) => void;
  handleCommentCreated: (data: { cardId?: string; comment?: CommentEntity }) => void;
  handleCommentUpdated: (data: { cardId?: string; comment?: CommentEntity }) => void;
  handleCommentDeleted: (data: { cardId?: string; id?: string }) => void;
  handleActivityCreated: (data: ActivityEntity) => void;
  handleMemberAdded: (data: { userId?: string; user?: { id?: string } }) => void;
  handleMemberRemoved: (data: { userId?: string }) => void;

  // Presence/Typing updates
  handlePresenceUpdated: (data: { boardId: string; userIds: string[] }) => void;
  handleTypingStarted: (data: { userId: string; boardId: string; cardId?: string }) => void;
  handleTypingStopped: (data: { userId: string; boardId: string; cardId?: string }) => void;
  resetRealtimeState: () => void;
}

// Shared helper to remove a card locally, clean typing state, and reindex positions in its list
const removeCardLocal = (state: BoardState, cardId: string, source?: string): Partial<BoardState> | BoardState => {
  const cardToRemove = state.cards.find((c) => c.id === cardId);
  if (!cardToRemove) {
    console.debug('[BoardStore] delete no-op (card not found)', { source: source ?? 'unknown', cardId, totalCards: state.cards.length });
    return state;
  }

  const listId = cardToRemove.listId;
  const remaining = state.cards.filter((c) => c.id !== cardId);

  // Clean typing state for this card
  const typingByCard: Record<string, string[]> = { ...state.typingByCard };
  if (typingByCard[cardId]) delete typingByCard[cardId];

  // If we don't know the list, just apply the removal
  if (!listId) {
    return { cards: remaining, typingByCard } as Partial<BoardState>;
  }

  // Reindex positions within the affected list
  const targetListCards = remaining
    .filter((c) => c.listId === listId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c, index) => ({ ...c, position: index }));

  const otherCards = remaining.filter((c) => c.listId !== listId);

  return { cards: [...otherCards, ...targetListCards], typingByCard } as Partial<BoardState>;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  board: null,
  lists: [],
  cards: [],
  loading: false,
  error: null,
  presentUserIds: [],
  typingByCard: {},
  activities: [],

  setBoardFromData: (board: BoardPayload) => {
    // Extract lists and cards from the API payload and normalize for store
    const lists = Array.isArray(board?.lists) ? board.lists! : [];
    const cards = lists.flatMap((list: ListPayload) => {
      const listCards = Array.isArray(list?.cards) ? list.cards! : [];
      return listCards.map((card: CardPayload) => ({
        ...card,
        listId: list.id,
        boardId: board.id,
        isCompleted:
          typeof card?.isCompleted === 'boolean'
            ? card.isCompleted
            : (typeof card?.completed === 'boolean' ? card.completed : false),
      }));
    });

    // Remove nested collections we keep separately in the store to satisfy types
    const boardWithoutLists: BoardPayload = { ...board, lists: undefined };

    const listsWithoutCards = lists.map((l) => {
      const copy = { ...(l as Record<string, unknown>) };
      delete (copy as Record<string, unknown>).cards;
      return copy as ListPayload;
    });

    set({
      board: boardWithoutLists,
      lists: listsWithoutCards,
      cards,
    });
  },

  fetchBoard: async (boardId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/boards/${boardId}`);
      const board = response.data;
      // Reuse normalization to keep logic consistent
      get().setBoardFromData(board);
      set({ loading: false });
    } catch (err: unknown) {
      const message = extractMessage(err) ?? 'Failed to fetch board';
      set({ error: message, loading: false });
    }
  },

  createList: async (boardId: string, title: string) => {
    let tempId: string | null = null;
    try {
      // Optimistic placeholder so UI updates instantly
      tempId = `temp-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      set((state) => {
        const maxPos = state.lists.length > 0
          ? Math.max(...state.lists.map((l) => (typeof l.position === 'number' ? l.position : 0)))
          : 0;
        const optimisticPosition = (maxPos || 0) + 1000;
        const optimistic: ListPayload = {
          id: tempId!,
          title: title?.trim() || 'New List',
          position: optimisticPosition,
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          boardId: state.board?.id ?? boardId,
        };
        return { lists: [...state.lists, optimistic] };
      });

      const response = await api.post('/lists', { boardId, title });
      const newList = response.data;
      set((state) => {
        const restObj = { ...(newList as Record<string, unknown>) };
        delete (restObj as Record<string, unknown>).cards;
        const normalized: ListPayload = restObj as ListPayload;

        const hasPlaceholder = state.lists.some((l) => l.id === tempId);
        const newListId = isRecord(newList) && typeof newList.id === 'string' ? (newList.id as string) : undefined;
        const hasRealAlready = newListId ? state.lists.some((l) => l.id === newListId) : false;

        if (hasPlaceholder && hasRealAlready) {
          // Event already added the real list; just remove placeholder
          return { lists: state.lists.filter((l) => l.id !== tempId) };
        }

        if (hasPlaceholder) {
          // Replace placeholder with real list
          const next = state.lists.map((l) => (l.id === tempId ? normalized : l));
          next.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
          return { lists: next };
        }

        if (hasRealAlready) {
          // Already present (likely via socket); nothing to do
          return state;
        }

        // Neither placeholder nor real present (edge); append
        const next = [...state.lists, normalized].sort(
          (a, b) => (a?.position ?? 0) - (b?.position ?? 0)
        );
        return { lists: next };
      });
    } catch (error: unknown) {
      console.error('Failed to create list:', error);
      // Remove only this optimistic placeholder on error
      if (tempId) {
        const idToRemove = tempId;
        set((state) => ({
          lists: state.lists.filter((l) => l.id !== idToRemove),
        }));
      }
      // Rethrow so UI can handle permission-specific messaging (e.g., 403)
      throw error;
    }
  },

  updateList: async (listId: string, data: Partial<ListPayload>) => {
    try {
      const response = await api.patch(`/lists/${listId}`, data);
      const updatedList = response.data as Partial<ListPayload> & Record<string, unknown>;
      const updatedCopy = { ...(updatedList as Record<string, unknown>) };
      delete (updatedCopy as Record<string, unknown>).cards;
      const sanitized = updatedCopy as Partial<ListPayload>;
      set((state) => {
        if (sanitized?.isArchived === true) {
          return {
            lists: state.lists.filter((l) => l.id !== listId),
            cards: state.cards.filter((c) => c.listId !== listId),
          };
        }
        return {
          lists: state.lists.map((list) =>
            list.id === listId ? { ...list, ...sanitized } : list
          ),
        };
      });
    } catch (error: unknown) {
      console.error('Failed to update list:', error);
      // Rethrow so UI can handle permission-specific messaging (e.g., 403)
      throw error;
    }
  },

  deleteList: async (listId: string) => {
    try {
      await api.delete(`/lists/${listId}`);
      set((state) => ({
        lists: state.lists.filter((list) => list.id !== listId),
        cards: state.cards.filter((card) => card.listId !== listId),
      }));
    } catch (error: unknown) {
      console.error('Failed to delete list:', error);
      // Rethrow so UI can handle permission-specific messaging (e.g., 403)
      throw error;
    }
  },

  createCard: async (listId: string, data: CreateCardInput) => {
    let tempId: string | null = null;
    try {
      const payload: Record<string, unknown> = { listId };
      if (typeof data?.title === 'string' && data.title.trim()) payload.title = data.title.trim();
      if (typeof data?.description === 'string' && data.description.trim()) payload.description = data.description.trim();
      if (typeof data?.dueDate === 'string') payload.dueDate = data.dueDate;
      if (typeof data?.priority === 'string') payload.priority = data.priority;
      if (typeof data?.assigneeId === 'string') payload.assigneeId = data.assigneeId;
      if (typeof data?.color === 'string') payload.color = data.color;

      // Derive typed optimistic fields from input (not from generic payload)
      const optimisticTitle: string =
        typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : 'New Card';
      const optimisticDescription: string =
        typeof data?.description === 'string' && data.description.trim() ? data.description.trim() : '';
      const optimisticPriority: string =
        typeof data?.priority === 'string' ? data.priority : 'MEDIUM';
      const optimisticDueDate: string | Date | null =
        typeof data?.dueDate === 'string' ? data.dueDate : null;
      const optimisticAssigneeId: string | null =
        typeof data?.assigneeId === 'string' ? data.assigneeId : null;

      // Optimistic placeholder so UI updates instantly
      tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      set((state) => {
        const listCards = state.cards.filter((c) => c.listId === listId);
        const maxPos = listCards.length > 0
          ? Math.max(...listCards.map((c) => (typeof c.position === 'number' ? c.position : 0)))
          : 0;
        const optimisticPosition = (maxPos || 0) + 1000;
        const optimistic: CardPayload = {
          id: tempId!,
          title: optimisticTitle,
          description: optimisticDescription,
          priority: optimisticPriority,
          dueDate: optimisticDueDate,
          assigneeId: optimisticAssigneeId,
          comments: [],
          _count: { comments: 0, attachments: 0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          listId,
          boardId: state.board?.id,
          position: optimisticPosition,
          isCompleted: false,
        };
        return { cards: [...state.cards, optimistic] };
      });

      const response = await api.post('/cards', payload);
      const newCard = response.data as unknown;
      set((state) => {
        let normalized: CardPayload;
        if (isRecord(newCard)) {
          const listIdResolved = typeof newCard.listId === 'string' ? newCard.listId as string : (isRecord(newCard.list) && typeof newCard.list.id === 'string' ? newCard.list.id as string : listId);
          const boardIdResolved = state.board?.id ?? (typeof newCard.boardId === 'string' ? newCard.boardId as string : (isRecord(newCard.board) && typeof newCard.board.id === 'string' ? newCard.board.id as string : undefined));
          const done = typeof newCard.isCompleted === 'boolean'
            ? (newCard.isCompleted as boolean)
            : (typeof newCard.completed === 'boolean' ? (newCard.completed as boolean) : false);
          normalized = {
            ...(newCard as Partial<CardPayload> & Record<string, unknown>),
            listId: listIdResolved,
            boardId: boardIdResolved,
            isCompleted: done,
          } as CardPayload;
        } else {
          normalized = {
            id: tempId || `card-${Date.now()}`,
            listId,
            boardId: state.board?.id,
            isCompleted: false,
          } as CardPayload;
        }

        const hasPlaceholder = state.cards.some((c) => c.id === tempId);
        const newCardId = isRecord(newCard) && typeof newCard.id === 'string' ? (newCard.id as string) : undefined;
        const hasRealAlready = newCardId ? state.cards.some((c) => c.id === newCardId) : false;

        if (hasPlaceholder && hasRealAlready) {
          // Event already added the real card; just remove placeholder
          return { cards: state.cards.filter((c) => c.id !== tempId) };
        }

        if (hasPlaceholder) {
          // Replace placeholder with real card
          return {
            cards: state.cards.map((c) => (c.id === tempId ? normalized : c)),
          };
        }

        if (hasRealAlready) {
          // Already present (likely via socket); nothing to do
          return state;
        }

        // Neither placeholder nor real present (edge); append
        return { cards: [...state.cards, normalized] };
      });
    } catch (error: unknown) {
      console.error('Failed to create card:', error);
      // Remove only this optimistic placeholder on error
      if (tempId) {
        const idToRemove = tempId;
        set((state) => ({
          cards: state.cards.filter((c) => c.id !== idToRemove),
        }));
      }
      // Rethrow so UI can handle permission-specific messaging (e.g., 403)
      throw error;
    }
  },

  updateCard: async (cardId: string, data: Partial<CardPayload> & Record<string, unknown>) => {
    try {
      const response = await api.patch(`/cards/${cardId}`, data);
      const updatedCard = response.data as Partial<CardPayload> & Record<string, unknown>;
      set((state) => ({
        cards: state.cards.map((card) =>
          card.id === cardId ? { ...card, ...updatedCard } : card
        ),
      }));
    } catch (error: unknown) {
      console.error('Failed to update card:', error);
      // Important: rethrow so UI can handle (e.g., show a permission-specific toast on 403)
      throw error;
    }
  },

  moveCard: (cardId: string, newListId: string, newPosition: number) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;

      // Guard: no state change needed
      if (card.listId === newListId && card.position === newPosition) {
        return state;
      }

      // Cards in target list excluding the moving card
      const targetListCards = state.cards
        .filter((c) => c.listId === newListId && c.id !== cardId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      // Clamp desired position to a valid index
      const clamped = Math.max(0, Math.min(newPosition, targetListCards.length));

      // Insert the card at the target index and reindex positions
      const updatedTargetCards = [
        ...targetListCards.slice(0, clamped),
        { ...card, listId: newListId },
        ...targetListCards.slice(clamped),
      ].map((c, index) => ({ ...c, position: index }));

      // If moving across lists, reindex the source list after removal
      let updatedSourceCards: CardPayload[] = [];
      if (card.listId !== newListId) {
        updatedSourceCards = state.cards
          .filter((c) => c.listId === card.listId && c.id !== cardId)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((c, index) => ({ ...c, position: index }));
      }

      // Keep all other cards as-is
      const otherCards = state.cards.filter(
        (c) => c.listId !== newListId && c.listId !== card.listId
      );

      return {
        cards: [...otherCards, ...updatedTargetCards, ...updatedSourceCards],
      };
    });
  },

  moveList: (listId: string, newIndex: number) => {
    set((state) => {
      const currentIndex = state.lists.findIndex((l) => l.id === listId);
      if (currentIndex === -1) return state;
      const clampedIndex = Math.max(0, Math.min(newIndex, state.lists.length - 1));
      if (currentIndex === clampedIndex) return state;

      const next = state.lists.slice();
      const [moved] = next.splice(currentIndex, 1);
      next.splice(clampedIndex, 0, moved);

      // Reindex positions to keep a consistent local order
      const reindexed = next.map((l, idx) => ({ ...l, position: idx }));
      return { lists: reindexed };
    });
  },

  deleteCard: async (cardId: string) => {
    try {
      await api.delete(`/cards/${cardId}`);
      set((state) => removeCardLocal(state, cardId, 'deleteCard'));
    } catch (error: unknown) {
      console.error('Failed to delete card:', error);
      throw error;
    }
  },

  updateCardPosition: (cardId: string, listId: string, position: number) => {
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === cardId ? { ...card, listId, position } : card
      ),
    }));
  },

  // Real-time update handlers
  handleBoardUpdate: (data: Partial<BoardPayload>) => {
    set((state) => {
      if (!state.board) return state;
      const copy = { ...(data as Record<string, unknown>) };
      delete (copy as Record<string, unknown>).lists;
      return {
        board: { ...(state.board as BoardPayload), ...(copy as Partial<BoardPayload>) },
      };
    });
  },

  handleListCreated: (data: ListPayload) => {
    set((state) => {
      const incomingId = data?.id;
      if (state.lists.some((l) => l.id === incomingId)) return state;

      const copy = { ...(data as Record<string, unknown>) };
      delete (copy as Record<string, unknown>).cards;
      const normalized: ListPayload = copy as ListPayload;

      // If an optimistic placeholder exists with same title, replace it
      const placeholderIdx = state.lists.findIndex(
        (l) =>
          typeof l.id === 'string' &&
          l.id.startsWith('temp-list-') &&
          l.title === normalized?.title,
      );

      if (placeholderIdx !== -1) {
        const next = state.lists.slice();
        next[placeholderIdx] = { ...next[placeholderIdx], ...normalized };
        next.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
        return { lists: next };
      }

      const next = [...state.lists, normalized].sort(
        (a, b) => (a?.position ?? 0) - (b?.position ?? 0)
      );
      return { lists: next };
    });
  },

  handleListUpdated: (data: ListPayload) => {
    set((state) => {
      const copy = { ...(data as Record<string, unknown>) };
      delete (copy as Record<string, unknown>).cards;
      const sanitized = copy as Partial<ListPayload>;
      const incomingId = data?.id;
      if (!incomingId) return state;

      const currentBoardId = state.board?.id;
      const incomingBoardId = typeof sanitized?.boardId === 'string' ? sanitized.boardId : undefined;

      // If the list was moved to a different board, remove it (and its cards) locally
      if (incomingBoardId && currentBoardId && incomingBoardId !== currentBoardId) {
        const existed = state.lists.some((l) => l.id === incomingId);
        if (!existed) return state;
        return {
          lists: state.lists.filter((l) => l.id !== incomingId),
          cards: state.cards.filter((c) => c.listId !== incomingId),
        };
      }

      // Archiving removes the list and its cards
      if (sanitized?.isArchived === true) {
        return {
          lists: state.lists.filter((list) => list.id !== incomingId),
          cards: state.cards.filter((card) => card.listId !== incomingId),
        };
      }

      // If we have an optimistic placeholder (created locally) that matches by title, replace it
      const placeholderIdx = state.lists.findIndex(
        (l) =>
          typeof l.id === 'string' &&
          l.id.startsWith('temp-list-') &&
          (typeof sanitized?.title === 'string' ? l.title === sanitized.title : false)
      );
      if (placeholderIdx !== -1) {
        const nextFromPlaceholder = state.lists.slice();
        nextFromPlaceholder[placeholderIdx] = {
          ...nextFromPlaceholder[placeholderIdx],
          ...(sanitized as Partial<ListPayload>),
          id: incomingId,
        } as ListPayload;
        nextFromPlaceholder.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
        return { lists: nextFromPlaceholder };
      }

      // Update existing list or add it if it's missing (in case we missed a create event)
      const existsIdx = state.lists.findIndex((l) => l.id === incomingId);
      if (existsIdx === -1) {
        // Only add if it belongs to this board (or board is unknown)
        if (incomingBoardId && currentBoardId && incomingBoardId !== currentBoardId) return state;
        const toAdd = ({ id: incomingId, ...(sanitized as Partial<ListPayload>) } as unknown) as ListPayload;
        const appended = [...state.lists, toAdd].sort(
          (a, b) => (a?.position ?? 0) - (b?.position ?? 0)
        );
        return { lists: appended };
      }

      // If an explicit position is provided, interpret it as target index and reorder locally.
      // This ensures remote clients maintain a consistent ordering even if the server
      // only updates a single list's numeric position.
      if (typeof sanitized?.position === 'number') {
        const pos = sanitized.position as number;
        const isInt = Number.isInteger(pos);
        const withinRange = isInt && pos >= 0 && pos < state.lists.length;
        if (withinRange) {
          const currentIndex = existsIdx;
          const targetIndex = pos;
          if (currentIndex !== targetIndex) {
            const nextOrder = state.lists.slice();
            const [moved] = nextOrder.splice(currentIndex, 1);
            nextOrder.splice(targetIndex, 0, { ...moved, ...(sanitized as Partial<ListPayload>) } as ListPayload);
            // Reindex positions to keep local order consistent
            const reindexed = nextOrder.map((l, idx) => ({ ...l, position: idx }));
            return { lists: reindexed };
          }
        }
      }

      const next = state.lists.map((list) =>
        list.id === incomingId ? { ...list, ...sanitized } : list
      );
      // Do not resort here; keep existing local order to avoid unintended jumps
      return { lists: next };
    });
  },

  handleListDeleted: (data: { id: string }) => {
    set((state) => ({
      lists: state.lists.filter((list) => list.id !== data.id),
      cards: state.cards.filter((card) => card.listId !== data.id),
    }));
  },

  handleCardCreated: (data: CardPayload) => {
    set((state) => {
      const existsById = state.cards.some((c) => c.id === data?.id);
      if (existsById) return state;

      const resolvedListId = data?.listId ?? data?.list?.id;
      const incomingTitle = data?.title;

      const normalized: CardPayload = {
        ...(data as Partial<CardPayload> & Record<string, unknown>),
        listId: resolvedListId,
        boardId: state.board?.id ?? data?.boardId ?? data?.board?.id,
        isCompleted:
          typeof data?.isCompleted === 'boolean'
            ? data.isCompleted
            : (typeof data?.completed === 'boolean' ? (data.completed as boolean) : false),
      } as CardPayload;

      // If an optimistic placeholder exists for same list/title, replace it
      const placeholderIdx = state.cards.findIndex(
        (c) => typeof c.id === 'string'
          && c.id.startsWith('temp-')
          && c.listId === resolvedListId
          && c.title === incomingTitle,
      );

      if (placeholderIdx !== -1) {
        const next = state.cards.slice();
        next[placeholderIdx] = { ...next[placeholderIdx], ...normalized };
        return { cards: next } as Partial<BoardState>;
      }

      return { cards: [...state.cards, normalized] };
    });
  },

  handleCardUpdated: (data: Partial<CardPayload> & Record<string, unknown>) => {
    set((state) => {
      const next = state.cards.map((card) => {
        if (card.id !== data.id) return card;

        const merged = {
          ...card,
          ...(data as Partial<CardPayload> & Record<string, unknown>),
          listId: data?.listId ?? data?.list?.id ?? card.listId,
          boardId: data?.boardId ?? data?.board?.id ?? card.boardId ?? state.board?.id,
          isCompleted:
            typeof data?.isCompleted === 'boolean'
              ? data.isCompleted
              : (typeof data?.completed === 'boolean' ? (data.completed as boolean) : card.isCompleted),
        } as Record<string, unknown>;

        // Explicitly handle attachments array if present on the payload
        const incomingAttachments = (data as Record<string, unknown>)?.attachments;
        if (Array.isArray(incomingAttachments)) {
          (merged as Record<string, unknown>).attachments = incomingAttachments;

          const incomingCount =
            isRecord((data as Record<string, unknown>)?._count) &&
            typeof ((data as { _count?: { attachments?: unknown } })?._count?.attachments) === 'number'
              ? ((data as { _count?: { attachments?: number } })._count!.attachments as number)
              : undefined;

          const prevCount =
            isRecord((card as Record<string, unknown>)?._count) &&
            typeof ((card as { _count?: { attachments?: unknown } })?._count?.attachments) === 'number'
              ? ((card as { _count?: { attachments?: number } })._count!.attachments as number)
              : undefined;

          const nextCount = typeof incomingCount === 'number' ? incomingCount : incomingAttachments.length;
          const existingCountObj = isRecord((merged as Record<string, unknown>)?._count)
            ? ((merged as { _count?: Record<string, unknown> })._count as Record<string, unknown>)
            : (isRecord((card as Record<string, unknown>)?._count)
                ? ((card as { _count?: Record<string, unknown> })._count as Record<string, unknown>)
                : {});

          (merged as { _count?: Record<string, unknown> })._count = {
            ...existingCountObj,
            attachments: typeof nextCount === 'number' ? nextCount : (prevCount ?? 0),
          } as Record<string, unknown>;
        }

        return merged as CardPayload;
      });
      return { cards: next };
    });
  },

  handleCardMoved: (data: { id: string; listId: string; position: number }) => {
    // Read defensively without using 'any'
    const rec = (data as unknown) as Record<string, unknown>;
    const idVal = typeof rec.id === 'string' ? (rec.id as string) : undefined;
    const listIdVal = typeof rec.listId === 'string' ? (rec.listId as string) : undefined;
    const posVal = typeof rec.position === 'number' ? (rec.position as number) : undefined;
    if (!idVal || !listIdVal || typeof posVal !== 'number') return;
    // Reuse local move logic to reindex both source and target lists consistently on remote events
    get().moveCard(idVal, listIdVal, posVal);
  },

  handleCardDeleted: (data: { id: string }) => {
    const deletedId = data?.id;
    if (!deletedId) return;
    set((state) => removeCardLocal(state, deletedId, 'handleCardDeleted'));
  },

  // Comment events
  handleCommentCreated: (data: { cardId?: string; comment?: CommentEntity }) => {
    set((state) => {
      const cardId = data?.cardId;
      const comment = data?.comment;
      if (!cardId || !comment) return state;
      return {
        cards: state.cards.map((c) => {
          if (c.id !== cardId) return c;
          const hasCommentsArray = Array.isArray(c.comments);
          const existing = hasCommentsArray ? (c.comments as Array<Record<string, unknown>>) : [];
          const already = existing.some((cm) => isRecord(cm) && cm.id === (comment as CommentEntity).id);
          const nextComments = already ? existing : [comment, ...existing];
          const nextCount = typeof c?._count?.comments === 'number'
            ? ((c?._count!.comments as number) + (already ? 0 : 1))
            : (hasCommentsArray ? nextComments.length : 1);
          return {
            ...c,
            comments: hasCommentsArray ? nextComments : c.comments,
            _count: { ...(c?._count as { comments?: number; attachments?: number } | undefined), comments: nextCount },
          };
        }),
      } as Partial<BoardState>;
    });
  },
  handleCommentUpdated: (data: { cardId?: string; comment?: CommentEntity }) => {
    set((state) => {
      const cardId = data?.cardId;
      const comment = data?.comment;
      if (!cardId || !comment) return state;
      return {
        cards: state.cards.map((c) => {
          if (c.id !== cardId) return c;
          const hasCommentsArray = Array.isArray(c.comments);
          const existing = hasCommentsArray ? (c.comments as Array<Record<string, unknown>>) : [];
          const nextComments = existing.map((cm) => (isRecord(cm) && isRecord(comment) && cm.id === comment.id ? comment : cm));
          return {
            ...c,
            comments: hasCommentsArray ? nextComments : c.comments,
          };
        }),
      } as Partial<BoardState>;
    });
  },
  handleCommentDeleted: (data: { cardId?: string; id?: string }) => {
    set((state) => {
      const cardId = data?.cardId;
      const id = data?.id;
      if (!cardId || !id) return state;
      return {
        cards: state.cards.map((c) => {
          if (c.id !== cardId) return c;
          const hasCommentsArray = Array.isArray(c.comments);
          const existing = hasCommentsArray ? (c.comments as Array<Record<string, unknown>>) : [];
          const nextComments = existing.filter((cm) => !(isRecord(cm) && cm.id === id));
          const nextCount = Math.max(0, typeof c?._count?.comments === 'number' ? ((c?._count!.comments as number) - 1) : (hasCommentsArray ? nextComments.length : 0));
          return {
            ...c,
            comments: hasCommentsArray ? nextComments : c.comments,
            _count: { ...(c?._count as { comments?: number; attachments?: number } | undefined), comments: nextCount },
          };
        }),
      } as Partial<BoardState>;
    });
  },

  // Activity events
  handleActivityCreated: (data: ActivityEntity) => {
    set((state) => {
      const id = data?.id;
      if (!id) return state;
      const exists = state.activities.some((a) => a?.id === id);
      if (exists) return state;
      const normalized = { ...data };
      const next = [normalized, ...state.activities];
      // Keep a bounded buffer
      return { activities: next.slice(0, 200) };
    });
  },

  // Member events
  handleMemberAdded: (data: { userId?: string; user?: { id?: string } }) => {
    set((state) => {
      if (!state.board) return state;
      const currentMembers = Array.isArray(state.board.members)
        ? (state.board.members as Array<Record<string, unknown>>)
        : [];
      const incomingUserId = data?.userId ?? data?.user?.id;
      const boardId = state.board?.id;
      if (!incomingUserId) {
        console.debug('[BoardStore] memberAdded missing userId', { boardId, data });
        return state;
      }
      const alreadyExists = currentMembers.some((m) =>
        (isRecord(m) && (m.userId === incomingUserId || (isRecord(m.user) && m.user.id === incomingUserId)))
      );
      const beforeCount = currentMembers.length;
      if (alreadyExists) {
        console.debug('[BoardStore] memberAdded ignored (duplicate)', { boardId, incomingUserId, beforeCount });
        return state;
      }
      const nextMembers = [...currentMembers, data];
      console.debug('[BoardStore] memberAdded applied', { boardId, incomingUserId, beforeCount, afterCount: nextMembers.length, data });
      return {
        board: { ...(state.board as BoardPayload), members: nextMembers },
      };
    });
  },

  handleMemberRemoved: (data: { userId?: string }) => {
    set((state) => {
      if (!state.board) return state;
      const currentMembers = Array.isArray(state.board.members)
        ? (state.board.members as Array<Record<string, unknown>>)
        : [];
      const removedUserId = data?.userId;
      const boardId = state.board?.id;
      if (!removedUserId) {
        console.debug('[BoardStore] memberRemoved missing userId', { boardId, data });
        return state;
      }
      const beforeCount = currentMembers.length;
      const nextMembers = currentMembers.filter(
        (m) => !(isRecord(m) && (m.userId === removedUserId || (isRecord(m.user) && m.user.id === removedUserId)))
      );
      if (nextMembers.length === currentMembers.length) {
        console.debug('[BoardStore] memberRemoved no-op (not found)', { boardId, removedUserId, beforeCount });
        return state;
      }
      console.debug('[BoardStore] memberRemoved applied', { boardId, removedUserId, beforeCount, afterCount: nextMembers.length });
      return {
        board: { ...(state.board as BoardPayload), members: nextMembers },
      };
    });
  },

  // Presence/Typing updates
  handlePresenceUpdated: (data: { boardId: string; userIds: string[] }) => {
    set(() => ({ presentUserIds: Array.isArray(data.userIds) ? data.userIds : [] }));
  },

  handleTypingStarted: (data: { userId: string; boardId: string; cardId?: string }) => {
    const { userId, cardId } = data || {};
    if (!userId || !cardId) return;
    set((state) => {
      const current = state.typingByCard[cardId] || [];
      if (current.includes(userId)) return state;
      return {
        typingByCard: {
          ...state.typingByCard,
          [cardId]: [...current, userId],
        },
      } as Partial<BoardState>;
    });
  },

  handleTypingStopped: (data: { userId: string; boardId: string; cardId?: string }) => {
    const { userId, cardId } = data || {};
    if (!userId || !cardId) return;
    set((state) => {
      const current = state.typingByCard[cardId] || [];
      const next = current.filter((id) => id !== userId);
      const typingByCard: Record<string, string[]> = { ...state.typingByCard };
      if (next.length > 0) typingByCard[cardId] = next; else delete typingByCard[cardId];
      return { typingByCard } as Partial<BoardState>;
    });
  },

  resetRealtimeState: () => {
    set({ presentUserIds: [], typingByCard: {}, activities: [] });
  },
}))
