import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from 'react-hot-toast'
import { Navbar } from '@/components/layout/navbar'
import TopLoader from '@/components/loading/TopLoader'
import { Suspense } from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TaskZen - Minimal Kanban Task Management',
  description: 'A modern, minimal Kanban task management application with drag-and-drop functionality',
  keywords: ['kanban', 'task management', 'productivity', 'project management'],
  authors: [{ name: 'TaskZen Team' }],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6366f1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          <Suspense fallback={null}>
            <TopLoader />
          </Suspense>
          <div>
            {children}
          </div>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'hsl(var(--card))',
                color: 'hsl(var(--card-foreground))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}

