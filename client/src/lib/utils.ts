import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize avatar/media URLs for client rendering.
 *
 * Rules:
 * - data: and blob: URLs are passed through
 * - Absolute http(s):
 *   - if path starts with /api/v1/uploads -> strip /api/v1
 *   - if path starts with /uploads and the origin is not the backend origin, rewrite to backend origin
 * - Relative URLs:
 *   - 'uploads/...': ensure leading slash '/uploads/...'
 *   - '/uploads/...': if BACKEND_ORIGIN is known, return absolute `${BACKEND_ORIGIN}/uploads/...`, else keep relative
 *
 * BACKEND_ORIGIN is derived from NEXT_PUBLIC_API_URL (or NEXT_PUBLIC_WS_URL).
 */
export function normalizeAvatarUrl(input?: string | null): string | undefined {
  const src = (input ?? '').trim()
  if (!src) return undefined
  const lower = src.toLowerCase()
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return src

  // Determine backend origin from env
  const getBackendOrigin = (): string | undefined => {
    const api = process.env.NEXT_PUBLIC_API_URL
    if (api) {
      try {
        const u = new URL(api)
        return `${u.protocol}//${u.host}`
      } catch {}
    }
    const ws = process.env.NEXT_PUBLIC_WS_URL
    if (ws) {
      try {
        const u = new URL(ws)
        return `${u.protocol}//${u.host}`
      } catch {}
    }
    return undefined
  }
  const backendOrigin = getBackendOrigin()

  // Absolute URL
  if (/^https?:\/\//i.test(src)) {
    try {
      const u = new URL(src)
      let path = u.pathname || '/'
      if (path.startsWith('/api/v1/uploads/')) {
        path = path.replace(/^\/api\/v1/i, '')
      }
      if (path.startsWith('/uploads/')) {
        const currentOrigin = `${u.protocol}//${u.host}`
        if (backendOrigin && currentOrigin !== backendOrigin) {
          return `${backendOrigin}${path}`
        }
      }
    } catch {
      // Ignore URL parse errors and return the original src
    }
    return src
  }

  // Relative URL
  let rel = src
  if (rel.startsWith('/api/v1/uploads/')) {
    rel = rel.replace(/^\/api\/v1/i, '')
  } else if (rel.startsWith('api/v1/uploads/')) {
    rel = '/' + rel.replace(/^api\/v1/i, '')
  } else if (rel.startsWith('uploads/')) {
    rel = '/' + rel
  }

  if (rel.startsWith('/uploads/') && backendOrigin) {
    return `${backendOrigin}${rel}`
  }
  return rel
}

