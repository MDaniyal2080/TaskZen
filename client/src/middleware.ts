import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Strict server-side auth/role enforcement using a JWT token mirrored into a cookie
export function middleware(request: NextRequest) {
  const { nextUrl } = request
  const pathname = nextUrl.pathname

  // Public routes (let through)
  const isPublic = (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/public')
  )
  if (isPublic) return NextResponse.next()

  // Helpers
  const redirectToLogin = () => {
    const url = new URL('/login', request.url)
    // Preserve intended target
    const nextParam = pathname + (nextUrl.search || '')
    url.searchParams.set('next', nextParam)
    return NextResponse.redirect(url)
  }

  interface JwtPayload {
    exp?: number | string
    role?: string
    [key: string]: unknown
  }

  const decodeJwt = (token: string): JwtPayload | null => {
    try {
      const parts = token.split('.')
      if (parts.length < 2) return null
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const pad = '='.repeat((4 - (b64.length % 4)) % 4)
      const json = atob(b64 + pad)
      return JSON.parse(json) as JwtPayload
    } catch {
      return null
    }
  }

  const cookieToken = request.cookies.get('taskzen_token')?.value || ''
  const payload = cookieToken ? decodeJwt(cookieToken) : null
  const isExpired = (() => {
    if (!payload || !payload.exp) return true
    try {
      const nowSec = Math.floor(Date.now() / 1000)
      return Number(payload.exp) <= nowSec
    } catch {
      return true
    }
  })()
  const isAuthenticated = !!payload && !isExpired
  const role = typeof payload?.role === 'string' ? payload.role : ''

  // Admin-only section
  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) return redirectToLogin()
    if (role !== 'ADMIN') return redirectToLogin()
    return NextResponse.next()
  }

  // Authenticated-only settings section
  if (pathname.startsWith('/settings')) {
    if (!isAuthenticated) return redirectToLogin()
    return NextResponse.next()
  }

  // Default allow
  return NextResponse.next()
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
