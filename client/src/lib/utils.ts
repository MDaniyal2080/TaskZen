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
 * - absolute http(s): if path starts with /api/v1/uploads -> strip /api/v1
 * - absolute http(s) pointing to localhost/127.0.0.1 with /uploads ->
 *   return same-origin /uploads path so Next.js rewrites can proxy correctly
 * - relative 'uploads/...': ensure leading slash '/uploads/...'
 * - relative '/uploads/...': returned as-is
 */
export function normalizeAvatarUrl(input?: string | null): string | undefined {
  const src = (input ?? '').trim()
  if (!src) return undefined
  const lower = src.toLowerCase()
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return src

  // Absolute URL
  if (/^https?:\/\//i.test(src)) {
    try {
      const u = new URL(src)
      const path = u.pathname || '/'
      if (path.startsWith('/api/v1/uploads/')) {
        return path.replace(/^\/api\/v1/i, '')
      }
      if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && path.startsWith('/uploads/')) {
        // Use same-origin path so Next.js rewrite proxies correctly and works across LAN
        return path
      }
    } catch {
      // Ignore URL parse errors and return the original src
    }
    return src
  }

  // Relative URL
  if (src.startsWith('/api/v1/uploads/')) {
    return src.replace(/^\/api\/v1/i, '')
  }
  if (src.startsWith('api/v1/uploads/')) {
    return '/' + src.replace(/^api\/v1/i, '')
  }
  if (src.startsWith('/uploads/')) return src
  if (src.startsWith('uploads/')) return '/' + src

  return src
}
