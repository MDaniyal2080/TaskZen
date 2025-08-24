'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Board } from '@/components/kanban/Board'
import { useSocketStore } from '@/store/socket-store'
import { useBoardStore } from '@/store/board-store'
import toast from 'react-hot-toast'
import { useSettings } from '@/contexts/SettingsContext'

export default function BoardPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { token, user, fetchMe } = useAuthStore()
  const [ready, setReady] = useState(false)
  const { connect, disconnect, socket, realtimeDisabled, connected } = useSocketStore()
  const { settings } = useSettings()
  const realtimeEnabled = settings?.features?.enableRealTimeUpdates !== false
  const {
    handleBoardUpdate,
    handleListCreated,
    handleListUpdated,
    handleListDeleted,
    handleCardCreated,
    handleCardUpdated,
    handleCardMoved,
    handleCardDeleted,
    handlePresenceUpdated,
    handleTypingStarted,
    handleTypingStopped,
    resetRealtimeState,
    handleActivityCreated,
    handleMemberAdded,
    handleMemberRemoved,
  } = useBoardStore()

  useEffect(() => {
    const init = async () => {
      if (!token) await fetchMe()
      if (!useAuthStore.getState().token) {
        router.replace('/login')
        return
      }
      setReady(true)
    }
    init()
  }, [token, fetchMe, router])

  // Establish socket connection when authenticated
  useEffect(() => {
    if (!ready || !user) return
    if (realtimeEnabled) {
      connect(user.id)
    } else {
      disconnect()
    }
    return () => {
      disconnect()
    }
  }, [ready, user, connect, disconnect, realtimeEnabled])

  // Join board room and subscribe to real-time events
  useEffect(() => {
    if (!ready) return
    if (!realtimeEnabled) return
    const id = (params?.id as string) || ''
    if (!id || !socket) return
    if (!connected) return

    socket.emit('joinBoard', { boardId: id })
    const onJoined = (payload: any) => {
      console.debug('[BoardPage] joinedBoard', payload)
    }
    socket.on('joinedBoard', onJoined)
    const onAccessDenied = (payload: any) => {
      console.warn('[BoardPage] accessDenied', payload)
      try { toast.error(payload?.message || 'You do not have access to this board') } catch {}
    }
    socket.on('accessDenied', onAccessDenied)
    socket.on('boardUpdated', handleBoardUpdate)
    socket.on('listCreated', handleListCreated)
    socket.on('listUpdated', handleListUpdated)
    socket.on('listDeleted', handleListDeleted)
    socket.on('cardCreated', handleCardCreated)
    socket.on('cardUpdated', handleCardUpdated)
    socket.on('cardMoved', handleCardMoved)
    socket.on('cardDeleted', handleCardDeleted)
    socket.on('presenceUpdated', handlePresenceUpdated)
    socket.on('typingStarted', handleTypingStarted)
    socket.on('typingStopped', handleTypingStopped)
    socket.on('activityCreated', handleActivityCreated)
    socket.on('memberAdded', handleMemberAdded)
    // Fallback event names for compatibility
    socket.on('presenceUpdate', handlePresenceUpdated)
    socket.on('typingStart', handleTypingStarted)
    socket.on('typingStop', handleTypingStopped)
    const onBoardDeleted = (payload: any) => {
      const deletedBoardId = (payload as any)?.id ?? payload
      if (!deletedBoardId || deletedBoardId !== id) return
      try { socket.emit('leaveBoard', { boardId: id }) } catch {}
      resetRealtimeState()
      try { toast.success('This board was deleted') } catch {}
      router.replace('/boards')
    }
    socket.on('boardDeleted', onBoardDeleted)
    const onMemberRemoved = (payload: any) => {
      try {
        handleMemberRemoved(payload)
      } catch {}
      const removedUserId = (payload as any)?.userId
      const payloadBoardId = (payload as any)?.boardId
      if (
        removedUserId &&
        user?.id &&
        removedUserId === user.id &&
        (payloadBoardId === id || !payloadBoardId)
      ) {
        try { socket.emit('leaveBoard', { boardId: id }) } catch {}
        resetRealtimeState()
        try { toast.error('You have been removed from this board') } catch {}
        router.replace('/boards')
      }
    }
    socket.on('memberRemoved', onMemberRemoved)

    return () => {
      try { socket.emit('leaveBoard', { boardId: id }) } catch {}
      socket.off('boardUpdated')
      socket.off('listCreated')
      socket.off('listUpdated')
      socket.off('listDeleted')
      socket.off('cardCreated')
      socket.off('cardUpdated')
      socket.off('cardMoved')
      socket.off('cardDeleted')
      socket.off('presenceUpdated')
      socket.off('typingStarted')
      socket.off('typingStopped')
      socket.off('activityCreated')
      socket.off('memberAdded')
      socket.off('presenceUpdate')
      socket.off('typingStart')
      socket.off('typingStop')
      socket.off('boardDeleted', onBoardDeleted)
      socket.off('memberRemoved', onMemberRemoved)
      socket.off('joinedBoard', onJoined)
      socket.off('accessDenied', onAccessDenied)
      resetRealtimeState()
    }
  }, [ready, realtimeEnabled, params?.id, socket, connected, user?.id, router, handleBoardUpdate, handleListCreated, handleListUpdated, handleListDeleted, handleCardCreated, handleCardUpdated, handleCardMoved, handleCardDeleted, handlePresenceUpdated, handleTypingStarted, handleTypingStopped, handleActivityCreated, handleMemberAdded, handleMemberRemoved, resetRealtimeState])

  // When server disables realtime dynamically, notify and reset state
  useEffect(() => {
    if (!realtimeDisabled) return
    try { toast.error('Real-time updates have been disabled by the administrator.') } catch {}
    resetRealtimeState()
  }, [realtimeDisabled, resetRealtimeState])

  if (!ready) return null

  const id = (params?.id as string) || ''
  if (!id) return null

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <Board boardId={id} />
    </div>
  )
}

