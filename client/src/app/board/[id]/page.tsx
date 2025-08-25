'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Board } from '@/components/kanban/Board';
import { useAuthStore } from '@/store/auth';
import { useSocketStore } from '@/store/socket-store';
import { useBoardStore } from '@/store/board-store';
import toast from 'react-hot-toast';

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;
  const { user } = useAuthStore();
  const { connect, disconnect, socket, connected, realtimeDisabled } = useSocketStore();
  const {
    handleBoardUpdate,
    handleListCreated,
    handleListUpdated,
    handleListDeleted,
    handleCardCreated,
    handleCardUpdated,
    handleCardMoved,
    handleCardDeleted,
    handleCommentCreated,
    handleCommentUpdated,
    handleCommentDeleted,
    handlePresenceUpdated,
    handleTypingStarted,
    handleTypingStopped,
    handleActivityCreated,
    handleMemberAdded,
    handleMemberRemoved,
    resetRealtimeState,
  } = useBoardStore();

  // Handle auth redirect and socket connect/disconnect
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    connect(user.id);
    return () => {
      disconnect();
    };
  }, [user, connect, disconnect, router]);

  // Join board room and subscribe to events when socket is ready
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('joinBoard', { boardId });

    const onJoined = (payload: unknown) => {
      console.debug('[BoardPage] joinedBoard', payload);
    };
    socket.on('joinedBoard', onJoined);
    const onAccessDenied = (payload: unknown) => {
      console.warn('[BoardPage] accessDenied', payload);
      const msg = (payload && typeof payload === 'object' && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string')
        ? (payload as { message?: string }).message
        : undefined;
      try { toast.error(msg || 'You do not have access to this board'); } catch {}
    };
    socket.on('accessDenied', onAccessDenied);

    socket.on('boardUpdated', handleBoardUpdate);
    socket.on('listCreated', handleListCreated);
    socket.on('listUpdated', handleListUpdated);
    socket.on('listDeleted', handleListDeleted);
    socket.on('cardCreated', handleCardCreated);
    socket.on('cardUpdated', handleCardUpdated);
    socket.on('cardMoved', handleCardMoved);
    socket.on('cardDeleted', handleCardDeleted);
    socket.on('commentCreated', handleCommentCreated);
    socket.on('commentUpdated', handleCommentUpdated);
    socket.on('commentDeleted', handleCommentDeleted);
    socket.on('presenceUpdated', handlePresenceUpdated);
    socket.on('typingStarted', handleTypingStarted);
    socket.on('typingStopped', handleTypingStopped);
    socket.on('activityCreated', handleActivityCreated);
    socket.on('memberAdded', handleMemberAdded);
    // Fallback event names for compatibility
    socket.on('presenceUpdate', handlePresenceUpdated);
    socket.on('typingStart', handleTypingStarted);
    socket.on('typingStop', handleTypingStopped);
    const onBoardDeleted = (payload: unknown) => {
      let deletedBoardId: string | undefined;
      if (typeof payload === 'string') {
        deletedBoardId = payload;
      } else if (payload && typeof payload === 'object' && 'id' in payload && typeof (payload as { id?: unknown }).id === 'string') {
        deletedBoardId = (payload as { id?: string }).id;
      }
      if (!deletedBoardId || deletedBoardId !== boardId) return;
      try {
        socket.emit('leaveBoard', { boardId });
      } catch {}
      resetRealtimeState();
      try { toast.success('This board was deleted'); } catch {}
      router.replace('/boards');
    };
    socket.on('boardDeleted', onBoardDeleted);
    const onMemberRemoved = (payload: { userId?: string; boardId?: string }) => {
      try {
        handleMemberRemoved(payload);
      } catch {
        // no-op
      }
      const removedUserId = payload?.userId;
      const payloadBoardId = payload?.boardId;
      if (
        removedUserId &&
        user?.id &&
        removedUserId === user.id &&
        (payloadBoardId === boardId || !payloadBoardId)
      ) {
        console.debug('[BoardPage] Current user removed from board. Redirecting to /boards', {
          boardId,
          removedUserId,
        });
        try {
          socket.emit('leaveBoard', { boardId });
        } catch {}
        resetRealtimeState();
        try { toast.error('You have been removed from this board'); } catch {}
        router.replace('/boards');
      }
    };
    socket.on('memberRemoved', onMemberRemoved);

    return () => {
      try { socket.emit('leaveBoard', { boardId }); } catch {}
      socket.off('boardUpdated', handleBoardUpdate);
      socket.off('listCreated', handleListCreated);
      socket.off('listUpdated', handleListUpdated);
      socket.off('listDeleted', handleListDeleted);
      socket.off('cardCreated', handleCardCreated);
      socket.off('cardUpdated', handleCardUpdated);
      socket.off('cardMoved', handleCardMoved);
      socket.off('cardDeleted', handleCardDeleted);
      socket.off('commentCreated', handleCommentCreated);
      socket.off('commentUpdated', handleCommentUpdated);
      socket.off('commentDeleted', handleCommentDeleted);
      socket.off('presenceUpdated', handlePresenceUpdated);
      socket.off('typingStarted', handleTypingStarted);
      socket.off('typingStopped', handleTypingStopped);
      socket.off('activityCreated', handleActivityCreated);
      socket.off('memberAdded', handleMemberAdded);
      socket.off('presenceUpdate', handlePresenceUpdated);
      socket.off('typingStart', handleTypingStarted);
      socket.off('typingStop', handleTypingStopped);
      socket.off('boardDeleted', onBoardDeleted);
      socket.off('memberRemoved', onMemberRemoved);
      socket.off('joinedBoard', onJoined);
      socket.off('accessDenied', onAccessDenied);
      resetRealtimeState();
    };
  }, [socket, connected, boardId, user?.id, router, handleBoardUpdate, handleListCreated, handleListUpdated, handleListDeleted, handleCardCreated, handleCardUpdated, handleCardMoved, handleCardDeleted, handleCommentCreated, handleCommentUpdated, handleCommentDeleted, handlePresenceUpdated, handleTypingStarted, handleTypingStopped, handleActivityCreated, handleMemberAdded, handleMemberRemoved, resetRealtimeState]);

  // When server disables realtime dynamically, notify and reset state
  useEffect(() => {
    if (!realtimeDisabled) return;
    try { toast.error('Real-time updates have been disabled by the administrator.'); } catch {}
    resetRealtimeState();
  }, [realtimeDisabled, resetRealtimeState]);

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <Board boardId={boardId} />
    </div>
  );
}
