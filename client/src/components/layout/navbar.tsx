'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { Moon, Sun, LogIn, LogOut, LayoutDashboard, Home, KanbanSquare, Calendar, Settings, CreditCard, Sparkles, Menu, X, Users, Shield, BarChart3, ChevronRight } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSettings } from '@/contexts/SettingsContext'

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Loading theme toggle" disabled>
        <div className="h-5 w-5 animate-pulse bg-muted rounded" />
      </Button>
    )
  }

  // Use resolvedTheme to get the actual current theme (handles 'system' properly)
  const currentTheme = resolvedTheme || theme
  const isDark = currentTheme === 'dark'
  
  const handleToggle = () => {
    // Cycle through: light -> dark -> system
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('system')
    } else {
      setTheme('light')
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Current theme: ${theme}. Click to toggle`}
      onClick={handleToggle}
      className="relative overflow-hidden transition-all duration-200 hover:scale-105"
    >
      <div className="relative">
        {isDark ? (
          <Sun className="h-5 w-5 transition-transform duration-200 rotate-0 scale-100" />
        ) : (
          <Moon className="h-5 w-5 transition-transform duration-200 rotate-0 scale-100" />
        )}
        {theme === 'system' && (
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        )}
      </div>
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
        'text-sm px-3 py-2 rounded-lg transition-all duration-200 relative overflow-hidden group ' +
        (active 
          ? 'text-primary font-medium bg-primary/10 shadow-sm' 
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:shadow-sm hover:-translate-y-0.5'
        )
      }
    >
      <span className="relative z-10">{children}</span>
      {active && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-purple-600/20 animate-pulse" />
      )}
    </Link>
  )
}

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { settings } = useSettings()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [adminSubmenuOpen, setAdminSubmenuOpen] = useState(false)

  const onLogout = () => {
    logout()
    router.replace('/login')
  }

  // Close mobile menu when route changes
  useEffect(() => {
    // Always close on route change; avoid referencing mobileOpen to satisfy hook deps
    setMobileOpen(false)
    setAdminSubmenuOpen(false)
  }, [pathname])


  return (
    <>
      <header className="sticky top-0 z-50 w-full glass-navbar">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <KanbanSquare className="h-6 w-6 text-primary animate-float" />
              <div className="absolute -inset-1 bg-primary/20 rounded-lg blur-sm animate-pulse"></div>
            </div>
            <Link href="/" className="font-bold text-lg bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent hover:scale-105 transition-transform duration-200">
              {settings?.siteName || 'TaskZen'}
            </Link>
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
          <div className="absolute top-14 inset-x-0 bg-background border-t shadow-md max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
              {user?.role === 'ADMIN' ? (
                <>
                  {/* Admin submenu toggle */}
                  <button
                    onClick={() => setAdminSubmenuOpen(!adminSubmenuOpen)}
                    className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center justify-between w-full hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" /> Admin Panel
                    </span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${adminSubmenuOpen ? 'rotate-90' : ''}`} />
                  </button>
                  
                  {/* Admin submenu items */}
                  {adminSubmenuOpen && (
                    <div className="ml-6 flex flex-col gap-1">
                      <Link href="/admin" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                      </Link>
                      <Link href="/admin/users" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <Users className="h-4 w-4" /> User Management
                      </Link>
                      <Link href="/admin/moderation" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <Shield className="h-4 w-4" /> Content Moderation
                      </Link>
                      <Link href="/admin/analytics" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <BarChart3 className="h-4 w-4" /> Analytics & Reports
                      </Link>
                      <Link href="/admin/settings" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <Settings className="h-4 w-4" /> System Settings
                      </Link>
                    </div>
                  )}
                  
                  {/* Regular nav items for admin */}
                  <div className="border-t mt-2 pt-2">
                    <Link href="/" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                      <Home className="h-4 w-4" /> Back to App
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <Link href="/" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                    <Home className="h-4 w-4" /> Home
                  </Link>
                  <Link href="/boards" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                    <KanbanSquare className="h-4 w-4" /> Boards
                  </Link>
                  {user && (
                    <>
                      <Link href="/calendar" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <Calendar className="h-4 w-4" /> Calendar
                      </Link>
                      <Link href="/settings" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <Settings className="h-4 w-4" /> Settings
                      </Link>
                      <Link href="/billing" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
                        <CreditCard className="h-4 w-4" /> Billing
                      </Link>
                      {!user.isPro && (
                        <Link href="/upgrade" onClick={() => setMobileOpen(false)} className="text-sm px-2 py-2 rounded-md transition-colors text-foreground flex items-center gap-2 hover:bg-accent">
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

