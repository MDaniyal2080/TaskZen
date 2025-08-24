'use client'

import React from 'react'
import { PageSpinner } from '@/components/loading/LoadingStates'

export default function Loading() {
  return (
    <div className="min-h-screen">
      <PageSpinner message="Loading boards..." />
    </div>
  )
}
