'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
 import { Crown, ArrowLeft, XCircle, Sparkles, Check, X, Zap } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

const features = [
  { name: 'Unlimited Boards', free: true, pro: true },
  { name: 'Unlimited Cards', free: true, pro: true },
  { name: 'Basic Drag & Drop', free: true, pro: true },
  { name: 'Due Date Tracking', free: true, pro: true },
  { name: 'Maximum Board Members', free: '3', pro: 'Unlimited' },
  { name: 'File Attachments', free: '10MB', pro: '100MB' },
  { name: 'Board Templates', free: false, pro: true },
  { name: 'Advanced Analytics', free: false, pro: true },
  { name: 'Priority Support', free: false, pro: true },
  { name: 'Custom Backgrounds', free: false, pro: true },
  { name: 'Board Archive', free: false, pro: true },
  { name: 'Activity History', free: '7 days', pro: 'Unlimited' },
]

export default function BillingPage() {
  const router = useRouter()
  const { user, fetchMe } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const { settings } = useSettings()

  // Dynamic pricing from public settings
  const currency = settings?.payments?.currency || 'USD'
  const monthlyPrice = settings?.payments?.monthlyPrice ?? 9.99
  const yearlyPrice = settings?.payments?.yearlyPrice ?? 99.99
  const paymentsEnabled = settings?.payments?.enabled ?? true
  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency })
  const yearlyFull = monthlyPrice * 12
  const yearlySavings = Math.max(0, yearlyFull - yearlyPrice)
  const savingsPercent = yearlyFull > 0 ? Math.round((yearlySavings / yearlyFull) * 100) : 0

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [user, router])

  const formatDate = (d?: string | Date | null) => {
    if (!d) return '—'
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toLocaleDateString()
  }

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (typeof err === 'object' && err !== null) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      if (e.response?.data?.message) return e.response.data.message
      if (typeof e.message === 'string') return e.message
    }
    return fallback
  }

  const handleUpgrade = async (duration: 'monthly' | 'yearly') => {
    setLoading(duration)
    try {
      const res = await api.post('/users/upgrade-pro', { duration })
      if (res.data?.success) {
        toast.success(`Upgraded to Pro (${duration})`)
        await fetchMe()
      }
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'Upgrade failed'))
    } finally {
      setLoading(null)
    }
  }

  const handleDowngrade = async () => {
    setLoading('downgrade')
    try {
      const res = await api.post('/users/downgrade')
      if (res.data?.success) {
        toast.success('Downgraded to Free')
        await fetchMe()
      }
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'Downgrade failed'))
    } finally {
      setLoading(null)
    }
  }

  const isPro = !!user?.isPro

  return (
    <div className="min-h-screen dark:bg-dark">
      <div className="container mx-auto px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">Choose Your Plan</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Unlock advanced features and take your productivity to the next level
            </p>
          </div>

          {/* Current Subscription Status */}
          {user && (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">Current Subscription</CardTitle>
                    <CardDescription>Your active plan and billing details</CardDescription>
                  </div>
                  {isPro ? (
                    <Badge className="bg-violet-600 text-white flex items-center gap-1">
                      <Crown className="w-4 h-4"/> Pro Member
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Sparkles className="w-4 h-4"/> Free Plan
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Status</div>
                    <div className="font-semibold mt-1">{isPro ? 'Pro Active' : 'Free Plan'}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Member Since</div>
                    <div className="font-semibold mt-1">
                      {formatDate(user?.createdAt ?? null)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Pro Expires</div>
                    <div className="font-semibold mt-1">
                      {isPro ? formatDate(user?.proExpiresAt ?? null) : '—'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
            {/* Free Plan */}
            <Card className={!isPro ? 'border-violet-500 shadow-lg' : ''}>
              <CardHeader>
                <CardTitle className="text-xl">Free</CardTitle>
                <CardDescription>Perfect for personal use</CardDescription>
                <div className="mt-4">
                  <span className="text-2xl sm:text-3xl font-bold">$0</span>
                  <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Unlimited boards</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Up to 3 members per board</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">10MB file attachments</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">7 days activity history</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <X className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Board templates</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <X className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Advanced analytics</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                {!isPro && (
                  <Button className="w-full" variant="outline" disabled>
                    Current Plan
                  </Button>
                )}
              </CardFooter>
            </Card>

            {/* Pro Monthly */}
            <Card className="border-violet-500 shadow-xl sm:scale-105 sm:col-span-2 lg:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Pro Monthly</CardTitle>
                  <Badge className="bg-violet-600 text-white">Popular</Badge>
                </div>
                <CardDescription>For teams and professionals</CardDescription>
                <div className="mt-4">
                  <span className="text-2xl sm:text-3xl font-bold">{fmt.format(monthlyPrice)}</span>
                  <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Everything in Free</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Unlimited team members</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">100MB file attachments</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Unlimited activity history</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Board templates library</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Advanced analytics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Priority support</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => handleUpgrade('monthly')}
                  disabled={loading !== null || !paymentsEnabled}
                >
                  {isPro ? 'Extend Monthly' : 'Upgrade to Pro'}
                </Button>
              </CardFooter>
            </Card>

            {/* Pro Yearly */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Pro Yearly</CardTitle>
                  <Badge className="bg-green-600 text-white">{savingsPercent > 0 ? `Save ${savingsPercent}%` : 'Yearly'}</Badge>
                </div>
                <CardDescription>Best value for teams</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{fmt.format(yearlyPrice)}</span>
                  <span className="text-gray-600 dark:text-gray-400">/year</span>
                  {yearlySavings > 0 && (
                    <div className="text-sm text-green-600 mt-1">Save {fmt.format(yearlySavings)} per year</div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">All Pro features</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">2 months free</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Annual billing discount</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Priority onboarding</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Dedicated support</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full"
                  variant="outline"
                  onClick={() => handleUpgrade('yearly')}
                  disabled={loading !== null || !paymentsEnabled}
                >
                  {isPro ? 'Extend Yearly' : 'Upgrade Yearly'}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Feature Comparison */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Feature Comparison</CardTitle>
              <CardDescription>See what&apos;s included in each plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2">Feature</th>
                      <th className="text-center py-3 px-2">Free</th>
                      <th className="text-center py-3 px-2">Pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {features.map((feature, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-3 px-2 text-sm">{feature.name}</td>
                        <td className="py-3 px-2 text-center">
                          {typeof feature.free === 'boolean' ? (
                            feature.free ? (
                              <Check className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-gray-400 mx-auto" />
                            )
                          ) : (
                            <span className="text-sm text-gray-600">{feature.free}</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {typeof feature.pro === 'boolean' ? (
                            feature.pro ? (
                              <Check className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-gray-400 mx-auto" />
                            )
                          ) : (
                            <span className="text-sm font-medium">{feature.pro}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Downgrade Option */}
          {isPro && (
            <Card className="border-red-200 dark:border-red-900/30">
              <CardHeader>
                <CardTitle className="text-lg">Manage Subscription</CardTitle>
                <CardDescription>Change or cancel your current plan</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  variant="destructive"
                  onClick={handleDowngrade}
                  disabled={loading !== null}
                  className="mr-2"
                >
                  <XCircle className="w-4 h-4 mr-2"/> Downgrade to Free
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  You&apos;ll keep Pro features until {user?.proExpiresAt ? formatDate(user.proExpiresAt) : 'expiry'}
                </span>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
