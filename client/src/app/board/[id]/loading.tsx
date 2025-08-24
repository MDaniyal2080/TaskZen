'use client'

import React from 'react'
import { BoardSkeleton } from '@/components/loading/LoadingStates'

export default function Loading() {
  return (
    <div className="min-h-screen">
      <BoardSkeleton />
    </div>
  )
}
