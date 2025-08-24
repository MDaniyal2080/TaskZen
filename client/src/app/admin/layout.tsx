'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  Shield,
  BarChart3,
  Settings,
  Menu,
  X,
  ArrowLeft,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/contexts/SettingsContext'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { settings } = useSettings()
  const appName = settings?.siteName || 'TaskZen'

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/moderation', label: 'Content Moderation', icon: Shield },
    { href: '/admin/analytics', label: 'Analytics & Reports', icon: BarChart3 },
    { href: '/admin/settings', label: 'System Settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden fixed top-4 left-4 z-50"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Sidebar */}
        <aside className={cn(
          "fixed lg:sticky top-0 left-0 z-40 h-screen w-64 border-r bg-background transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
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
                const isActive = pathname === item.href
                
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3",
                        isActive && "bg-secondary"
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="absolute bottom-4 left-4 right-4">
            <div className="rounded-lg border bg-card p-3 text-card-foreground">
              <p className="text-xs text-muted-foreground">
                Admin privileges active
              </p>
              <p className="text-sm font-medium mt-1">
                Full system control
              </p>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Main Content */}
        <main className="flex-1 lg:ml-0">
          <div className="container mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
