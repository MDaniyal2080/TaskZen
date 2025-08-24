'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen grid place-items-center bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-md p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shadow-sm">
          <div className="mb-4 text-5xl">🚨</div>
          <h2 className="text-2xl font-semibold">Unexpected application error</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            We hit a snag loading the app. You can try again.
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
      </body>
    </html>
  )
}
