'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Check, Crown, Rocket, Users, BarChart3, Shield, Zap, Sparkles } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { api } from '@/lib/api'

interface PricingPlan {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  icon: React.ElementType
  color: string
  popular?: boolean
}

const plans: PricingPlan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'Perfect for personal use and small projects',
    features: [
      'Up to 3 boards',
      'Unlimited cards per board',
      'Basic drag & drop',
      'File attachments (5MB max)',
      'Activity tracking',
      'Search functionality'
    ],
    icon: Sparkles,
    color: 'text-slate-600'
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'Ideal for professionals and growing teams',
    features: [
      'Unlimited boards',
      'Advanced analytics',
      'Priority support',
      'File attachments (50MB max)',
      'Custom board themes',
      'Export to CSV/PDF',
      'Advanced search filters',
      'Email notifications',
      'Team collaboration tools',
      'API access'
    ],
    icon: Crown,
    color: 'text-violet-600',
    popular: true
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with specific needs',
    features: [
      'Everything in Pro',
      'Unlimited file storage',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
      'Advanced security',
      'Custom branding',
      'On-premise deployment'
    ],
    icon: Rocket,
    color: 'text-cyan-600'
  }
]

export default function UpgradePage() {
  const router = useRouter()
  const { user, fetchMe } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [redirecting] = useState(true)

  // Redirect this page to the centralized Billing page
  useEffect(() => {
    router.replace('/billing')
  }, [router])
  if (redirecting) return null

  const handleUpgrade = async (planName: string) => {
    if (planName === 'Free') {
      toast.success('You are already on the Free plan')
      return
    }

    if (planName === 'Enterprise') {
      toast('Please contact sales@taskzen.com for Enterprise pricing', {
        icon: '📧',
        duration: 5000
      })
      return
    }

    if (!user) {
      toast.error('Please login to upgrade')
      router.push('/login')
      return
    }

    setLoading(true)
    try {
      // Simulate payment process (replace with Stripe/payment gateway)
      const response = await api.post('/users/upgrade-pro', { duration: 'monthly' })

      if (response.data.success) {
        toast.success('🎉 Successfully upgraded to Pro!')
        await fetchMe() // Refresh user data
        router.push('/boards')
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to upgrade. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen  from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Unlock powerful features to supercharge your productivity
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon
            const isCurrentPlan = 
              (plan.name === 'Free' && !user?.isPro) ||
              (plan.name === 'Pro' && user?.isPro)

            return (
              <Card 
                key={plan.name}
                className={`relative transition-all duration-300 hover:scale-105 ${
                  plan.popular 
                    ? 'border-violet-500 shadow-xl shadow-violet-500/20' 
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-violet-600 to-cyan-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <CardHeader className="text-center pb-8">
                  <div className={`inline-flex p-3 rounded-xl  from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 mb-4 ${plan.color}`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-gray-600 dark:text-gray-400">{plan.period}</span>
                  </div>
                </CardHeader>

                <CardContent className="pb-8">
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button 
                    className={`w-full ${
                      isCurrentPlan 
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : plan.popular
                        ? 'bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white'
                        : ''
                    }`}
                    size="lg"
                    disabled={isCurrentPlan || loading}
                    onClick={() => handleUpgrade(plan.name)}
                  >
                    {isCurrentPlan ? 'Current Plan' : `Get ${plan.name}`}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>

        {/* Features Comparison */}
        <div className="mt-20 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Why Upgrade to Pro?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Users className="w-6 h-6 text-violet-600" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Team Collaboration</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Work seamlessly with your team with advanced collaboration features
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-cyan-600" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Advanced Analytics</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get insights into your productivity with detailed analytics
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Priority Support</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get help when you need it with priority customer support
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-orange-600" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Unlimited Boards</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create as many boards as you need without any restrictions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
