import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This middleware handles route protection based on authentication
// Note: Since we use localStorage for auth state, we can't access it in middleware
// The actual role-based protection happens client-side
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Skip middleware for API routes and static files
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // For now, allow all requests to pass through
  // The actual authentication and role checking happens client-side
  // This is because Next.js middleware runs on the server and can't access localStorage
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
