'use client'

import React from 'react'
import { PageSpinner } from '@/components/loading/LoadingStates'

export default function Loading() {
  return <PageSpinner message="Loading users..." />
}
