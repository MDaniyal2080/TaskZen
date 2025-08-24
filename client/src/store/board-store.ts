import { create } from 'zustand';
import { api } from '@/lib/api';

// Lightweight payload types used by the board store to avoid `any` while
// remaining flexible about backend response shapes.
type CardPayload = {
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

type ListPayload = {
  id: string;
  title?: string;
  position?: number | null;
  isArchived?: boolean;
  boardId?: string;
  cards?: CardPayload[] | null;
} & Record<string, unknown>;

type BoardPayload = {
  id: string;
  lists?: ListPayload[] | null;
  members?: Array<Record<string, unknown>>;
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

const extractMessage = (err: unknown): string | undefined => {
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
  updateCardPosition: (cardId: string, listId: string, position: number) => void;
  
  // Real-time updates
  handleBoardUpdate: (data: Partial<BoardPayload>) => void;
  handleListCreated: (data: ListPayload) => void;
  handleListUpdated: (data: ListPayload) => void;
  handleListDeleted: (data: { id: string }) => void;
  handleCardCreated: (data: CardPayload) => void;
  handleCardUpdated: (data: CardPayload) => void;
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
    const boardWithoutLists = { ...board } as BoardPayload;
    delete (boardWithoutLists as any).lists;

    const listsWithoutCards = lists.map((l) => {
      const { cards: _cards, ...rest } = (l as unknown) as Record<string, unknown>;
      return rest as ListPayload;
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
        const { cards: _ignore, ...rest } = (newList as unknown) as Record<string, unknown>;
        const normalized: ListPayload = rest as ListPayload;
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
      const { cards: _ignore, ...rest } = (updatedList as unknown) as Record<string, unknown>;
      const sanitized = rest as Partial<ListPayload>;
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
          title: payload.title || 'New Card',
          description: payload.description || '',
          priority: payload.priority || 'MEDIUM',
          dueDate: payload.dueDate || null,
          assigneeId: payload.assigneeId || null,
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
        cards: state.cards.map((card) => {
          if (card.id !== cardId) return card;
          const nextIsCompleted =
            typeof updatedCard?.isCompleted === 'boolean'
              ? updatedCard.isCompleted
              : (typeof updatedCard?.completed === 'boolean'
                  ? (updatedCard.completed as boolean)
                  : card.isCompleted);
          return {
            ...card,
            ...(updatedCard as Partial<CardPayload>),
            listId: (typeof updatedCard?.listId === 'string' ? updatedCard.listId : (isRecord(updatedCard?.list) && typeof (updatedCard.list as Record<string, unknown>).id === 'string' ? (updatedCard.list as Record<string, unknown>).id as string : card.listId)),
            boardId: (typeof updatedCard?.boardId === 'string' ? updatedCard.boardId : (isRecord(updatedCard?.board) && typeof (updatedCard.board as Record<string, unknown>).id === 'string' ? (updatedCard.board as Record<string, unknown>).id as string : (card.boardId ?? state.board?.id))),
            isCompleted: nextIsCompleted,
          };
        }),
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

  deleteCard: async (cardId: string) => {
    try {
      await api.delete(`/cards/${cardId}`);
      set((state) => ({
        cards: state.cards.filter((card) => card.id !== cardId),
      }));
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
      const { lists: _ignore, ...rest } = (data as unknown) as Record<string, unknown>;
      return {
        board: { ...(state.board as BoardPayload), ...(rest as Partial<BoardPayload>) },
      };
    });
  },

  handleListCreated: (data: ListPayload) => {
    set((state) => {
      const incomingId = data?.id;
      if (state.lists.some((l) => l.id === incomingId)) return state;

      const { cards: _ignore, ...rest } = (data as unknown) as Record<string, unknown>;
      const normalized: ListPayload = rest as ListPayload;

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
      const { cards: _ignore, ...rest } = (data as unknown) as Record<string, unknown>;
      const sanitized = rest as Partial<ListPayload>;
      if (sanitized?.isArchived === true) {
        return {
          lists: state.lists.filter((list) => list.id !== data.id),
          cards: state.cards.filter((card) => card.listId !== data.id),
        };
      }
      const next = state.lists.map((list) =>
        list.id === data?.id ? { ...list, ...sanitized } : list
      );
      next.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
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

  handleCardUpdated: (data: CardPayload) => {
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === data.id
          ? {
              ...card,
              ...(data as Partial<CardPayload> & Record<string, unknown>),
              listId: data?.listId ?? data?.list?.id ?? card.listId,
              boardId: data?.boardId ?? data?.board?.id ?? card.boardId ?? state.board?.id,
              isCompleted:
                typeof data?.isCompleted === 'boolean'
                  ? data.isCompleted
                  : (typeof data?.completed === 'boolean' ? (data.completed as boolean) : card.isCompleted),
            }
          : card
      ),
    }));
  },

  handleCardMoved: (data: { id: string; listId: string; position: number }) => {
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === data.id
          ? { ...card, listId: data.listId, position: data.position }
          : card
      ),
    }));
  },

  handleCardDeleted: (data: { id: string }) => {
    set((state) => ({
      cards: state.cards.filter((card) => card.id !== data.id),
    }));
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
