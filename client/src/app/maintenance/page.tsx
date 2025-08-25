"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface MaintenanceInfo {
  enabled: boolean
  message?: string | null
  scheduledAt?: string | null
  estimatedDuration?: string | number | null
}

export default function MaintenancePage() {
  const [info, setInfo] = useState<MaintenanceInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    // Read any previously stored info from the interceptor
    try {
      const stored = sessionStorage.getItem('maintenance_info')
      if (stored) setInfo(JSON.parse(stored))
    } catch {}

    const fetchStatus = async () => {
      try {
        const { data } = await api.get('/status')
        const m: MaintenanceInfo = data?.maintenance || null
        if (m) {
          setInfo(m)
          try { sessionStorage.setItem('maintenance_info', JSON.stringify(m)) } catch {}
        }
      } catch {
        // ignore; we'll show whatever we have
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  const onRetry = () => {
    window.location.href = '/'
  }

  const msg = info?.message || 'We are currently performing scheduled maintenance. Please check back soon.'

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-xl w-full bg-white shadow-md rounded-lg p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 text-2xl">🛠️</div>
        <h1 className="text-2xl font-semibold mb-2">Service Under Maintenance</h1>
        <p className="text-gray-600 whitespace-pre-wrap mb-4">{msg}</p>
        {info?.scheduledAt && (
          <p className="text-gray-500 text-sm mb-1">Scheduled at: {new Date(info.scheduledAt).toLocaleString()}</p>
        )}
        {info?.estimatedDuration && (
          <p className="text-gray-500 text-sm mb-4">Estimated duration: {String(info.estimatedDuration)}</p>
        )}
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-md bg-black text-white px-4 py-2 text-sm font-medium hover:bg-black/85"
        >
          Try again
        </button>
        {!loading && (
          <p className="text-xs text-gray-400 mt-4">This page will not auto-refresh. Please try again in a few minutes.</p>
        )}
      </div>
    </div>
  )
}
