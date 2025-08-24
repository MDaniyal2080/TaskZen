'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console or an error reporting service
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl p-8 text-center">
      <div className="mb-4 text-5xl">😵‍💫</div>
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        An unexpected error occurred while rendering this page.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Try again
        </button>
        <a
          href="/"
          className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Go home
        </a>
      </div>

      {error?.digest && (
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">Error code: {error.digest}</p>
      )}
    </div>
  )
}
