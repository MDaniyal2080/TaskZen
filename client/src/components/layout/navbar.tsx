'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { Moon, Sun, LogIn, LogOut, LayoutDashboard, Home, KanbanSquare, Calendar, Settings, CreditCard, Sparkles, Menu, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSettings } from '@/contexts/SettingsContext'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href
  return (
    <Link
      href={href}
      className={
        'text-sm px-2 py-1 rounded-md transition-colors ' +
        (active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </Link>
  )
}

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { settings } = useSettings()
  const [mobileOpen, setMobileOpen] = useState(false)

  const onLogout = () => {
    logout()
    router.replace('/login')
  }

  // Close mobile menu when route changes
  useEffect(() => {
    // Always close on route change; avoid referencing mobileOpen to satisfy hook deps
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          {/* Left: Brand */}
          <div className="flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 text-primary" />
            <Link href="/" className="font-semibold">{settings?.siteName || 'TaskZen'}</Link>
          </div>

          {/* Middle: Nav links (desktop) */}
          <nav className="hidden md:flex items-center gap-4">
            {/* Show different navigation based on user role */}
            {user?.role === 'ADMIN' ? (
              // Admin sees only the admin panel link in main nav
              <NavLink href="/admin"><span className="inline-flex items-center gap-1"><LayoutDashboard className="h-4 w-4" /> Admin Panel</span></NavLink>
            ) : (
              // Normal users see user-specific pages
              <>
                <NavLink href="/"><span className="inline-flex items-center gap-1"><Home className="h-4 w-4" /> Home</span></NavLink>
                <NavLink href="/boards"><span className="inline-flex items-center gap-1"><KanbanSquare className="h-4 w-4" /> Boards</span></NavLink>
                {user && (
                  <>
                    <NavLink href="/calendar"><span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" /> Calendar</span></NavLink>
                    <NavLink href="/settings"><span className="inline-flex items-center gap-1"><Settings className="h-4 w-4" /> Settings</span></NavLink>
                    <NavLink href="/billing"><span className="inline-flex items-center gap-1"><CreditCard className="h-4 w-4" /> Billing</span></NavLink>
                    {!user.isPro && (
                      <NavLink href="/upgrade"><span className="inline-flex items-center gap-1"><Sparkles className="h-4 w-4" /> Upgrade</span></NavLink>
                    )}
                  </>
                )}
              </>
            )}
          </nav>

          {/* Right: Auth + Theme + Mobile Toggle */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            {user ? (
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-1" /> Logout
              </Button>
            ) : (
              <Link href="/login">
                <Button variant="default" size="sm">
                  <LogIn className="h-4 w-4 mr-1" /> Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-14 inset-x-0 bg-background border-t shadow-md">
            <nav className="container mx-auto px-4 py-3 flex flex-col gap-1" onClick={() => setMobileOpen(false)}>
              {user?.role === 'ADMIN' ? (
                <Link href="/admin" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" /> Admin Panel
                </Link>
              ) : (
                <>
                  <Link href="/" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                    <Home className="h-4 w-4" /> Home
                  </Link>
                  <Link href="/boards" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                    <KanbanSquare className="h-4 w-4" /> Boards
                  </Link>
                  {user && (
                    <>
                      <Link href="/calendar" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> Calendar
                      </Link>
                      <Link href="/settings" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                        <Settings className="h-4 w-4" /> Settings
                      </Link>
                      <Link href="/billing" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Billing
                      </Link>
                      {!user.isPro && (
                        <Link href="/upgrade" className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2">
                          <Sparkles className="h-4 w-4" /> Upgrade
                        </Link>
                      )}
                    </>
                  )}
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}

