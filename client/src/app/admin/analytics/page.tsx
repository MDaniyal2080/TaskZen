'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { toast } from 'react-hot-toast'
import {
  Users, Activity,
  FileText, Download, RefreshCw, DollarSign,
  CheckCircle, ArrowUp, ArrowDown, Minus
} from 'lucide-react'
import { api } from '@/lib/api'

interface AnalyticsData {
  overview: {
    totalUsers: number
    activeUsers: number
    totalBoards: number
    totalTasks: number
    completionRate: number
    avgTasksPerUser: number
    proUsers: number
  }
  growth: {
    userGrowth: number
    boardGrowth: number
    taskGrowth: number
    revenueGrowth: number
  }
  userActivity: {
    daily: { date: string; count: number }[]
    weekly: { week: string; count: number }[]
    monthly: { month: string; count: number }[]
  }
  taskMetrics: {
    byStatus: { status: string; count: number }[]
    byPriority: { priority: string; count: number }[]
    avgCompletionTime: number
    overdueTasks: number
  }
  boardMetrics: {
    avgListsPerBoard: number
    avgCardsPerBoard: number
    mostActiveBoards: { id: string; title: string; activity: number }[]
  }
  revenue: {
    monthly: { month: string; amount: number }[]
    byPlan: { plan: string; amount: number; users: number }[]
    mrr: number
    arr: number
    churnRate: number
  }
}

async function fetchAnalytics(range: string): Promise<AnalyticsData> {
  const response = await api.get('/admin/analytics', { params: { timeRange: range } })
  return response.data
}

export default function AnalyticsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [timeRange, setTimeRange] = useState('30d')
  const [exportLoading, setExportLoading] = useState(false)

  const { data: analytics, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'analytics', timeRange],
    queryFn: () => fetchAnalytics(timeRange),
    enabled: user?.role === 'ADMIN'
  })

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      toast.error('Admin access required')
      router.replace('/boards')
    }
  }, [user, router])

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExportLoading(true)
    try {
      const response = await api.get('/admin/analytics/export', {
        params: { format, timeRange },
        responseType: 'blob'
      })
      
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `taskzen-analytics-${new Date().toISOString().split('T')[0]}.${format}`
      a.click()
      
      toast.success(`Analytics exported as ${format.toUpperCase()}`)
    } catch {
      toast.error('Failed to export analytics')
    } finally {
      setExportLoading(false)
    }
  }

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-600"></div>
      </div>
    )
  }

  type StatCardProps = {
    title: string
    value: string | number
    change?: number
    icon: ComponentType<{ className?: string }>
    color?: string
    trend?: 'up' | 'down' | 'neutral'
  }

  const StatCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    color = 'text-violet-600',
    trend = 'neutral'
  }: StatCardProps) => {
    const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
    const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500'
    
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-800 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
                <TrendIcon className="w-4 h-4" />
                <span>{Math.abs(change)}%</span>
              </div>
            )}
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-h-screen  from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Analytics Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Comprehensive insights into your platform performance
            </p>
          </div>
          <div className="flex gap-2 flex-wrap w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('csv')}
              disabled={exportLoading}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => handleExport('pdf')}
              disabled={exportLoading}
            >
              <FileText className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex flex-wrap gap-2 mb-6">
          {['7d', '30d', '90d', '1y'].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range === '7d' ? 'Last 7 Days' :
               range === '30d' ? 'Last 30 Days' :
               range === '90d' ? 'Last 90 Days' : 'Last Year'}
            </Button>
          ))}
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Users"
            value={analytics.overview.totalUsers.toLocaleString()}
            change={analytics.growth.userGrowth}
            icon={Users}
            color="text-blue-600"
            trend={analytics.growth.userGrowth > 0 ? 'up' : analytics.growth.userGrowth < 0 ? 'down' : 'neutral'}
          />
          <StatCard
            title="Active Boards"
            value={analytics.overview.totalBoards.toLocaleString()}
            change={analytics.growth.boardGrowth}
            icon={Activity}
            color="text-green-600"
            trend={analytics.growth.boardGrowth > 0 ? 'up' : analytics.growth.boardGrowth < 0 ? 'down' : 'neutral'}
          />
          <StatCard
            title="Total Tasks"
            value={analytics.overview.totalTasks.toLocaleString()}
            change={analytics.growth.taskGrowth}
            icon={CheckCircle}
            color="text-violet-600"
            trend={analytics.growth.taskGrowth > 0 ? 'up' : analytics.growth.taskGrowth < 0 ? 'down' : 'neutral'}
          />
          <StatCard
            title="Monthly Revenue"
            value={`$${analytics.revenue.mrr.toLocaleString()}`}
            change={analytics.growth.revenueGrowth}
            icon={DollarSign}
            color="text-yellow-600"
            trend={analytics.growth.revenueGrowth > 0 ? 'up' : analytics.growth.revenueGrowth < 0 ? 'down' : 'neutral'}
          />
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* User Activity Chart */}
          <Card>
            <CardHeader>
              <CardTitle>User Activity</CardTitle>
              <CardDescription>Daily active users over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64 flex items-end justify-between gap-1 sm:gap-2">
                {analytics.userActivity.daily.slice(-14).map((day, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-violet-600 to-cyan-600 rounded-t hover:opacity-80 transition-opacity"
                    style={{
                      height: `${(day.count / Math.max(1, ...analytics.userActivity.daily.map(d => d.count))) * 100}%`,
                      minHeight: '4px'
                    }}
                    title={`${day.date}: ${day.count} users`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>2 weeks ago</span>
                <span>Today</span>
              </div>
            </CardContent>
          </Card>

          {/* Task Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Task Status Distribution</CardTitle>
              <CardDescription>Tasks grouped by current status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.taskMetrics.byStatus.map((status) => {
                  const denominator = analytics.overview.totalTasks || 1
                  const percentage = (status.count / denominator) * 100
                  return (
                    <div key={status.status}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{status.status}</span>
                        <span className="text-sm text-gray-500">
                          {status.count} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Metrics */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Revenue Analytics</CardTitle>
            <CardDescription>Subscription and revenue performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">MRR</p>
                <p className="text-2xl font-bold">${analytics.revenue.mrr.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">ARR</p>
                <p className="text-2xl font-bold">${analytics.revenue.arr.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pro Users</p>
                <p className="text-2xl font-bold">{analytics.overview.proUsers}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Churn Rate</p>
                <p className="text-2xl font-bold">{Number(analytics.revenue?.churnRate ?? 0).toFixed(1)}%</p>
              </div>
            </div>

            {/* Monthly Revenue Chart */}
            <div className="h-48 sm:h-64 flex items-end justify-between gap-1 sm:gap-2">
              {analytics.revenue.monthly.map((month, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-gradient-to-t from-green-600 to-emerald-400 rounded-t hover:opacity-80 transition-opacity"
                    style={{
                      height: `${(month.amount / Math.max(1, ...analytics.revenue.monthly.map(m => m.amount))) * 100}%`,
                      minHeight: '4px'
                    }}
                    title={`${month.month}: $${month.amount}`}
                  />
                  <span className="text-xs text-gray-500 mt-1">{month.month.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Additional Insights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Completion Rate */}
          <Card>
            <CardHeader>
              <CardTitle>Task Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      className="text-gray-200 dark:text-gray-700"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - Number(analytics.overview?.completionRate ?? 0) / 100)}`}
                      className="text-green-500 transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">
                      {Number(analytics.overview?.completionRate ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Average Tasks per User */}
          <Card>
            <CardHeader>
              <CardTitle>Productivity Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-4xl font-bold text-violet-600">
                  {Number(analytics.overview?.avgTasksPerUser ?? 0).toFixed(1)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Average tasks per user
                </p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Overdue Tasks</span>
                    <span className="font-semibold text-red-500">
                      {analytics.taskMetrics.overdueTasks}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Avg Completion Time</span>
                    <span className="font-semibold">
                      {Number(analytics.taskMetrics?.avgCompletionTime ?? 0).toFixed(1)} days
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Most Active Boards */}
          <Card>
            <CardHeader>
              <CardTitle>Top Active Boards</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.boardMetrics.mostActiveBoards.slice(0, 5).map((board, i) => (
                  <div key={board.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">#{i + 1}</span>
                      <span className="text-sm truncate max-w-[60vw] sm:max-w-[150px]">{board.title}</span>
                    </div>
                    <span className="text-sm font-semibold text-violet-600">
                      {board.activity}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
