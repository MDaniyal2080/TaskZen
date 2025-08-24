'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useAuthStore } from '@/store/auth'
import { getDashboardStats, getRevenueMetrics, getSystemHealth, getRecentActivities } from '@/lib/admin'
import { api } from '@/lib/api'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { 
  Activity, 
  DollarSign, 
  Database, 
  Server, 
  Users, 
  Layout, 
  TrendingUp,
  CheckCircle,
  BarChart3,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  ListTodo,
  Target,
  Timer,
  CalendarCheck,
  
} from 'lucide-react'
import { InlineSpinner } from '@/components/loading/LoadingStates'

// Types for Admin analytics and activities
type TaskStatusMetric = { status: string; color: string; count: number }
type TaskPriorityMetric = { priority: string; count: number }
type TaskMetrics = {
  overview?: {
    total?: number
    completed?: number
    overdue?: number
    completionRate?: number
    avgPerUser?: number
    avgPerBoard?: number
  }
  trends?: { completionTrend?: 'up' | 'down' | 'stable' | string }
  today?: { created?: number; completed?: number; completionRate?: number }
  thisWeek?: { created?: number; completed?: number; completionRate?: number }
  thisMonth?: { velocity?: number }
  byStatus?: TaskStatusMetric[]
  byPriority?: TaskPriorityMetric[]
}
type BoardMetrics = { avgCardsPerBoard?: number }
type AdminAnalytics = { taskMetrics?: TaskMetrics; boardMetrics?: BoardMetrics }
type RecentActivity = { type: string; description?: string; timestamp?: string | number | Date; createdAt?: string | number | Date }

function formatUptime(totalSec: number) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '—'
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (!parts.length) parts.push(`${s}s`)
  return parts.join(' ')
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const { fetchMe } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const ensureAuth = async () => {
      const state = useAuthStore.getState()
      if (!state.token) {
        await fetchMe()
      }
      if (!mounted) return
      const st = useAuthStore.getState()
      if (!st.token) {
        router.replace('/login')
        return
      }
      if (!st.user) return // wait for user hydration
      if (st.user.role !== 'ADMIN') {
        toast.error('Admin access required')
        router.replace('/')
        return
      }
      setReady(true)
    }
    ensureAuth()
    const unsub = useAuthStore.subscribe((s) => {
      if (!mounted) return
      if (!s.token) return
      if (!s.user) return
      if (s.user.role === 'ADMIN') setReady(true)
      else {
        toast.error('Admin access required')
        router.replace('/')
      }
    })
    return () => { mounted = false; unsub() }
  }, [fetchMe, router])

  const statsQuery = useQuery({
    queryKey: ['admin','stats'],
    queryFn: getDashboardStats,
    enabled: ready,
    refetchInterval: 30000,
  })

  const analyticsQuery = useQuery({
    queryKey: ['admin','analytics'],
    queryFn: async () => {
      const res = await api.get('/admin/analytics')
      return res.data as AdminAnalytics
    },
    enabled: ready,
  })

  const revenueQuery = useQuery({
    queryKey: ['admin','revenue'],
    queryFn: getRevenueMetrics,
    enabled: ready,
  })

  const healthQuery = useQuery({
    queryKey: ['admin','health'],
    queryFn: getSystemHealth,
    enabled: ready,
  })

  const activitiesQuery = useQuery({
    queryKey: ['admin','activities'],
    queryFn: () => getRecentActivities(5),
    enabled: ready,
  })

  const loading = !ready || statsQuery.isLoading

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-2 text-muted-foreground">
            <InlineSpinner />
            <span>Loading dashboard...</span>
          </div>
        </div>
      </div>
    )
  }

  const stats = statsQuery.data
  const revenue = revenueQuery.data
  const health = healthQuery.data
  const activities: RecentActivity[] = (activitiesQuery.data || []) as RecentActivity[]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Monitor your platform&apos;s performance and activity</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            statsQuery.refetch()
            analyticsQuery.refetch()
            revenueQuery.refetch()
            healthQuery.refetch()
            activitiesQuery.refetch()
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeUsers || 0} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Boards</CardTitle>
            <Layout className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBoards || 0}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsQuery.data?.boardMetrics?.avgCardsPerBoard?.toFixed(1) || 0} avg cards/board
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsQuery.data?.taskMetrics?.overview?.total || stats?.totalTasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsQuery.data?.taskMetrics?.overview?.completed || 0} completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pro Users</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.proUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.adminUsers || 0} admins
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${revenue?.monthlyRecurringRevenue || 0}</div>
            <p className="text-xs text-muted-foreground">
              ${revenue?.yearlyProjection || 0} projected yearly
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Task Analytics Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Target className="h-5 w-5 mr-2" />
          Task Performance
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analyticsQuery.data?.taskMetrics?.overview?.completionRate || 0}%
              </div>
              <Progress value={analyticsQuery.data?.taskMetrics?.overview?.completionRate || 0} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {analyticsQuery.data?.taskMetrics?.trends?.completionTrend === 'up' ? '↑' : '→'} Trending {analyticsQuery.data?.taskMetrics?.trends?.completionTrend || 'stable'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Progress</CardTitle>
              <CalendarCheck className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analyticsQuery.data?.taskMetrics?.today?.completed || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                of {analyticsQuery.data?.taskMetrics?.today?.created || 0} created today
              </p>
              <p className="text-xs text-green-600 mt-1">
                {analyticsQuery.data?.taskMetrics?.today?.completionRate || 0}% completion rate
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weekly Tasks</CardTitle>
              <Timer className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analyticsQuery.data?.taskMetrics?.thisWeek?.completed || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                of {analyticsQuery.data?.taskMetrics?.thisWeek?.created || 0} created
              </p>
              <p className="text-xs text-purple-600 mt-1">
                {analyticsQuery.data?.taskMetrics?.thisWeek?.completionRate || 0}% completion rate
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {analyticsQuery.data?.taskMetrics?.overview?.overdue || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                requiring attention
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Task Distribution */}
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tasks by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analyticsQuery.data?.taskMetrics?.byStatus?.map((status) => (
                  <div key={status.status} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 ${status.color === 'text-green-600' ? 'bg-green-600' : 'bg-yellow-600'}`} />
                      <span className="text-sm">{status.status}</span>
                    </div>
                    <span className="text-sm font-medium">{status.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tasks by Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analyticsQuery.data?.taskMetrics?.byPriority?.slice(0, 5).map((priority) => (
                  <div key={priority.priority} className="flex items-center justify-between">
                    <span className="text-sm">{priority.priority}</span>
                    <span className="text-sm font-medium">{priority.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Task Velocity */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Task Velocity
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Average task completion rate over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Monthly Velocity</p>
                <p className="text-2xl font-bold">{analyticsQuery.data?.taskMetrics?.thisMonth?.velocity || 0}</p>
                <p className="text-xs text-muted-foreground">tasks/day average</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg per User</p>
                <p className="text-2xl font-bold">{analyticsQuery.data?.taskMetrics?.overview?.avgPerUser || 0}</p>
                <p className="text-xs text-muted-foreground">tasks assigned</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg per Board</p>
                <p className="text-2xl font-bold">{analyticsQuery.data?.taskMetrics?.overview?.avgPerBoard || 0}</p>
                <p className="text-xs text-muted-foreground">tasks created</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              User Management
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Manage users, roles, and permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/users">
              <Button className="w-full" variant="default">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Manage Users
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Board Management
              <Layout className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>View and manage all user boards</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/boards">
              <Button className="w-full" variant="default">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Manage Boards
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Analytics
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>View detailed platform analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/analytics">
              <Button className="w-full" variant="outline">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                View Analytics
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              System Health
              <Server className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">API Status</span>
                <span className="flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Operational
                </span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Database</span>
                <span className="flex items-center text-green-600">
                  <Database className="h-4 w-4 mr-1" />
                  Connected
                </span>
              </div>
              <Progress value={health?.dbOk ? 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Uptime</span>
                <span className="text-sm text-muted-foreground">
                  {formatUptime(health?.uptimeSec || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Activities
              <Activity className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activities</p>
              ) : (
                activities.map((activity, idx: number) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      {activity.type === 'user_signup' && (
                        <Users className="h-4 w-4 text-blue-500 mt-0.5" />
                      )}
                      {activity.type === 'board_created' && (
                        <Layout className="h-4 w-4 text-green-500 mt-0.5" />
                      )}
                      {activity.type === 'user_upgraded' && (
                        <TrendingUp className="h-4 w-4 text-purple-500 mt-0.5" />
                      )}
                      {activity.type === 'task_completed' && (
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      )}
                      {!['user_signup', 'board_created', 'user_upgraded', 'task_completed'].includes(activity.type) && (
                        <Activity className="h-4 w-4 text-gray-500 mt-0.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {activity.description || activity.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.timestamp ? new Date(activity.timestamp).toLocaleString() : 
                         activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Just now'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Metrics */}
      {revenue && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Revenue Overview
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Monthly Recurring</p>
                <p className="text-2xl font-bold">${revenue.monthlyRecurringRevenue || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Annual Revenue</p>
                <p className="text-2xl font-bold">${revenue.yearlyProjection || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Churn Rate</p>
                <p className="text-2xl font-bold">{revenue.churnRate || 0}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
