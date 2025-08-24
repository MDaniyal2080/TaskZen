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
  const { connect, disconnect, socket, connected } = useSocketStore();
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
  }, [user?.id]);

  // Join board room and subscribe to events when socket is ready
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('joinBoard', { boardId });

    const onJoined = (payload: any) => {
      console.debug('[BoardPage] joinedBoard', payload);
    };
    socket.on('joinedBoard', onJoined);
    const onAccessDenied = (payload: any) => {
      console.warn('[BoardPage] accessDenied', payload);
      try { toast.error(payload?.message || 'You do not have access to this board'); } catch {}
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
    socket.on('activityCreated', handleActivityCreated);
    socket.on('memberAdded', handleMemberAdded);
    const onBoardDeleted = (payload: any) => {
      const deletedBoardId = (payload as any)?.id ?? payload;
      if (!deletedBoardId || deletedBoardId !== boardId) return;
      try {
        socket.emit('leaveBoard', { boardId });
      } catch {}
      resetRealtimeState();
      try { toast.success('This board was deleted'); } catch {}
      router.replace('/boards');
    };
    socket.on('boardDeleted', onBoardDeleted);
    const onMemberRemoved = (payload: any) => {
      try {
        handleMemberRemoved(payload);
      } catch (e) {
        // no-op
      }
      const removedUserId = (payload as any)?.userId;
      const payloadBoardId = (payload as any)?.boardId;
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
      socket.off('activityCreated', handleActivityCreated);
      socket.off('memberAdded', handleMemberAdded);
      socket.off('boardDeleted', onBoardDeleted);
      socket.off('memberRemoved', onMemberRemoved);
      socket.off('joinedBoard', onJoined);
      socket.off('accessDenied', onAccessDenied);
      resetRealtimeState();
    };
  }, [socket, connected, boardId, user?.id, router, handleBoardUpdate, handleListCreated, handleListUpdated, handleListDeleted, handleCardCreated, handleCardUpdated, handleCardMoved, handleCardDeleted, handleCommentCreated, handleCommentUpdated, handleCommentDeleted, handleActivityCreated, handleMemberAdded, handleMemberRemoved, resetRealtimeState]);

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <Board boardId={boardId} />
    </div>
  );
}
