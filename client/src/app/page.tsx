'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Users, Zap, Shield, ArrowRight } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

export default function HomePage() {
  const { settings } = useSettings()
  const appName = settings?.siteName || 'TaskZen'
  return (
    <div className="min-h-screen  from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-primary-600 via-secondary-500 to-accent-500 bg-clip-text text-transparent">
              {appName}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Minimal Kanban task management with powerful features. 
              Organize your work, collaborate with your team, and boost productivity.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Create Account
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="glass border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="text-center">
              <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Drag & Drop</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Intuitive drag-and-drop interface for effortless task organization
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="glass border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="text-center">
              <Users className="h-12 w-12 text-secondary mx-auto mb-4" />
              <CardTitle>Team Collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Work together with real-time updates and team member management
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="glass border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="text-center">
              <Zap className="h-12 w-12 text-accent mx-auto mb-4" />
              <CardTitle>Real-time Updates</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                See changes instantly with live synchronization across all devices
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="glass border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Secure & Private</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Your data is protected with enterprise-grade security
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="mt-24 text-center">
          <Card className="glass border-0 shadow-xl max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-3xl">Ready to get organized?</CardTitle>
              <CardDescription className="text-lg">
                Join thousands of teams already using {appName} to manage their projects
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/register">
                  <Button size="lg" className="w-full sm:w-auto">
                    Start Free Trial
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Sign In
                  </Button>
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                No credit card required • Free forever plan available
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
