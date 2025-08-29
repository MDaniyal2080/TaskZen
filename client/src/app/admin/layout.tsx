'use client'

import Link from 'next/link'
import { ReactNode, Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  Shield,
  BarChart3,
  Settings,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/contexts/SettingsContext'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  )
}

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { settings } = useSettings()
  const appName = settings?.siteName || 'TaskZen'

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/moderation', label: 'Content Moderation', icon: Shield },
    { href: '/admin/analytics', label: 'Analytics & Reports', icon: BarChart3 },
    { href: '/admin/settings', label: 'System Settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block sticky top-14 h-[calc(100vh-3.5rem)] w-64 border-r bg-background">
          <div className="flex flex-col h-full">
            {/* Header section */}
            <div className="p-4 border-b">
              <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
                <ArrowLeft className="h-4 w-4" />
                Back to App
              </Link>
              <Link href="/admin" className="font-semibold text-lg block">
                {appName} Admin
              </Link>
              <p className="text-xs text-muted-foreground mt-1">Admin Panel</p>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col gap-1 p-4 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
                
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3",
                        isActive && "bg-secondary"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                )
              })}
            </nav>

            <div className="p-4">
              <div className="rounded-lg border bg-card p-3 text-card-foreground">
                <p className="text-xs text-muted-foreground">
                  Admin privileges active
                </p>
                <p className="text-sm font-medium mt-1">
                  Full system control
                </p>
              </div>
            </div>
          </div>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

