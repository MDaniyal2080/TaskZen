'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { InlineSpinner } from '@/components/loading/LoadingStates'
import {
  Search,
  Filter,
  MoreHorizontal,
  UserCheck,
  UserX,
  CreditCard,
  Activity,
  Mail,
  Calendar,
  Clock,
  Ban,
  Shield,
  Crown,
  Star,
  TrendingUp,
  DollarSign,
  FileText,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react'

// Types based on Admin API responses
type AdminUserApi = {
  id: string
  email: string
  username: string | null
  firstName: string | null
  lastName: string | null
  avatar?: string | null
  role: 'USER' | 'ADMIN'
  isPro: boolean
  proExpiresAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { boards: number }
}

type UiUser = {
  id: string
  email: string
  name: string
  role: 'USER' | 'ADMIN'
  status: 'ACTIVE' | 'INACTIVE'
  subscription: {
    type: 'FREE' | 'PRO' | 'ENTERPRISE'
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED'
    billingCycle?: string
    amount?: number
    expiresAt?: string | null
  }
  createdAt: string
  lastLogin?: string | null
  boardsCount: number
  tasksCount: number
  activityLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
}

const mapAdminUserToUi = (u: AdminUserApi): UiUser => {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || u.email
  const now = new Date()
  const proExpired = !!(u.proExpiresAt && new Date(u.proExpiresAt) < now)
  return {
    id: u.id,
    email: u.email,
    name,
    role: u.role,
    status: u.isActive ? 'ACTIVE' : 'INACTIVE',
    subscription: {
      type: u.isPro ? 'PRO' : 'FREE',
      status: u.isPro ? (proExpired ? 'EXPIRED' : 'ACTIVE') : 'ACTIVE',
      billingCycle: u.isPro ? 'YEARLY' : undefined,
      amount: u.isPro ? 9.99 : undefined,
      expiresAt: u.proExpiresAt,
    },
    createdAt: u.createdAt,
    lastLogin: null,
    boardsCount: u._count?.boards ?? 0,
    tasksCount: 0,
    activityLevel: undefined,
  }
}

type AdminActivity = {
  id: string
  type: string
  createdAt: string
  userId?: string
  user?: { id: string; username: string | null; email: string }
  board?: { id: string; title: string | null }
}

type UiActivity = {
  id: string
  userId?: string
  userName: string
  action: string
  details?: string
  timestamp: string
  type: string
}

const mapActivityToUi = (a: AdminActivity): UiActivity => ({
  id: a.id,
  userId: (a as any).userId || a.user?.id,
  userName: a.user?.username || a.user?.email || 'Unknown',
  action: (a.type || '').toString().replace(/_/g, ' '),
  details: a.board?.title ? `Board: ${a.board.title}` : undefined,
  timestamp: a.createdAt,
  type: a.type,
})

export default function UsersManagementPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { fetchMe } = useAuthStore()
  const [ready, setReady] = useState(false)

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<UiUser | null>(null)
  const [showActivityDialog, setShowActivityDialog] = useState(false)
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
  const itemsPerPage = 10
  
  // Data fetching
  const { data: usersData, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data } = await api.get<AdminUserApi[]>('/admin/users')
      return data
    },
    enabled: ready,
  })
  const mappedUsers: UiUser[] = useMemo(
    () => (usersData ?? []).map(mapAdminUserToUi),
    [usersData]
  )
  
  const { data: revenueData } = useQuery({
    queryKey: ['admin', 'revenue'],
    queryFn: async () => (await api.get('/admin/revenue')).data,
    enabled: ready,
  })
  
  const { data: activitiesData } = useQuery({
    queryKey: ['admin', 'activities', { limit: 50 }],
    queryFn: async () => (await api.get('/admin/activities', { params: { limit: 50 } })).data,
    enabled: ready,
  })
  const displayedActivities: UiActivity[] = useMemo(
    () => (activitiesData ?? []).map(mapActivityToUi),
    [activitiesData]
  )
  
  // Subscription dialog state
  const [subType, setSubType] = useState<'FREE' | 'PRO' | 'ENTERPRISE'>('FREE')
  const [subBilling, setSubBilling] = useState<'MONTHLY' | 'YEARLY'>('YEARLY')
  const [subStatus, setSubStatus] = useState<'ACTIVE' | 'CANCELLED' | 'EXPIRED'>('ACTIVE')
  
  // Mutations
  const activateMutation = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/activate`)).data,
    onSuccess: () => {
      toast.success('User activated')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to activate'),
  })
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/deactivate`)).data,
    onSuccess: () => {
      toast.success('User suspended')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to suspend'),
  })
  const upgradeProMutation = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/upgrade`)).data,
    onSuccess: () => {
      toast.success('User upgraded to Pro')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to upgrade'),
  })
  const makeAdminMutation = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/make-admin`)).data,
    onSuccess: () => {
      toast.success('Granted admin role')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to grant admin'),
  })
  const removeAdminMutation = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/remove-admin`)).data,
    onSuccess: () => {
      toast.success('Removed admin role')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to remove admin'),
  })
  
  const updateSubscriptionMutation = useMutation({
    mutationFn: async (input: { id: string; payload: { type: 'FREE' | 'PRO' | 'ENTERPRISE'; billingCycle?: 'MONTHLY' | 'YEARLY'; status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' } }) =>
      (await api.patch(`/admin/users/${input.id}/subscription`, input.payload)).data,
    onSuccess: () => {
      toast.success('Subscription updated successfully')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setShowSubscriptionDialog(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update subscription'),
  })
  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/users/${id}`)).data,
    onSuccess: () => {
      toast.success('User deleted')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete user'),
  })
  
  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  // Auth check
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
      if (!st.user) return
      if (st.user.role !== 'ADMIN') {
        toast.error('Admin access required')
        router.replace('/')
        return
      }
      setReady(true)
    }
    ensureAuth()
    return () => { mounted = false }
  }, [fetchMe, router])

  // Filter users based on search and filters
  const filteredUsers = useMemo(() => {
    let users = [...mappedUsers]
    
    // Search filter
    if (searchQuery) {
      users = users.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Role filter
    if (roleFilter !== 'all') {
      users = users.filter(u => u.role === roleFilter)
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      const desired = statusFilter === 'SUSPENDED' ? 'INACTIVE' : statusFilter
      users = users.filter(u => u.status === desired)
    }
    
    // Subscription filter
    if (subscriptionFilter !== 'all') {
      users = users.filter(u => u.subscription.type === subscriptionFilter)
    }
    
    return users
  }, [mappedUsers, searchQuery, roleFilter, statusFilter, subscriptionFilter])

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Export users data
  const exportUsers = () => {
    if (!filteredUsers.length) return
    
    const csv = [
      ['ID', 'Name', 'Email', 'Role', 'Status', 'Subscription', 'Created At', 'Last Login', 'Boards', 'Tasks'],
      ...filteredUsers.map(user => [
        user.id,
        user.name,
        user.email,
        user.role,
        user.status,
        user.subscription.type,
        user.createdAt,
        user.lastLogin || 'Never',
        user.boardsCount.toString(),
        user.tasksCount.toString(),
      ])
    ].map(row => row.join(',')).join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('Users exported successfully')
  }

  if (!ready || usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <InlineSpinner />
          <span>Loading users management...</span>
        </div>
      </div>
    )
  }
  
  if (usersError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-red-600">Failed to load users</div>
          <Button variant="outline" onClick={() => refetchUsers()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">Manage users, subscriptions, and monitor activity</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mappedUsers.length}</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mappedUsers.filter((u: UiUser) => u.status === 'ACTIVE').length}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pro Users</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mappedUsers.filter((u: UiUser) => u.subscription.type === 'PRO').length}</div>
            <p className="text-xs text-muted-foreground">Paid subscriptions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(revenueData?.monthlyRecurringRevenue ?? 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Monthly recurring</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Users</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportUsers}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={refreshData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Subscription" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="FREE">Free</SelectItem>
                <SelectItem value="PRO">Pro</SelectItem>
                <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity Logs</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              {/* Users Table */}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                            {user.role === 'ADMIN' && <Shield className="h-3 w-3 mr-1" />}
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              user.status === 'ACTIVE' ? 'default' :
                              user.status === 'INACTIVE' ? 'secondary' : 'destructive'
                            }
                          >
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {user.subscription.type === 'PRO' && <Crown className="h-3 w-3 text-yellow-500" />}
                            {user.subscription.type === 'ENTERPRISE' && <Star className="h-3 w-3 text-purple-500" />}
                            <Badge variant="outline">
                              {user.subscription.type}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{user.boardsCount} boards</span>
                            <span className="text-sm text-muted-foreground">•</span>
                            <span className="text-sm">{user.tasksCount} tasks</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(user.createdAt), 'MMM d, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem 
                                onClick={() => {
                                  setSelectedUser(user)
                                  setShowActivityDialog(true)
                                }}
                              >
                                <Activity className="h-4 w-4 mr-2" />
                                View Activity
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user)
                                  setSubType(user.subscription.type)
                                  setSubBilling((user.subscription.billingCycle as 'MONTHLY' | 'YEARLY') || 'YEARLY')
                                  setSubStatus(user.subscription.status)
                                  setShowSubscriptionDialog(true)
                                }}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Manage Subscription
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => upgradeProMutation.mutate(user.id)}>
                                <Crown className="h-4 w-4 mr-2" />
                                {user.subscription.type !== 'PRO' ? 'Upgrade to Pro' : 'Extend Pro (1 year)'}
                              </DropdownMenuItem>
                              {user.role !== 'ADMIN' ? (
                                <DropdownMenuItem onClick={() => makeAdminMutation.mutate(user.id)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Make Admin
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => removeAdminMutation.mutate(user.id)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Remove Admin
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {user.status === 'ACTIVE' ? (
                                <DropdownMenuItem onClick={() => deactivateMutation.mutate(user.id)}>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Suspend User
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => activateMutation.mutate(user.id)}>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Activate User
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  if (window.confirm(`Delete ${user.name}? This action cannot be undone.`)) {
                                    deleteUserMutation.mutate(user.id)
                                  }
                                }}
                                className="text-red-600 focus:text-red-700"
                              >
                                <Ban className="h-4 w-4 mr-2" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-4">
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const start = (currentPage - 1) * itemsPerPage
                    const end = start + paginatedUsers.length
                    return `Showing ${filteredUsers.length ? start + 1 : 0} to ${end} of ${filteredUsers.length} users`
                  })()}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm">
                    Page {currentPage} of {totalPages || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Logs Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>Monitor user activities and system events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {displayedActivities.map((log: UiActivity) => (
                  <div key={log.id} className="flex items-start space-x-3 p-3 rounded-lg border">
                    <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{log.userName}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{log.action}</p>
                      {log.details && (
                        <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <CardTitle>Subscription Management</CardTitle>
              <CardDescription>Manage user subscriptions and billing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Free Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {mappedUsers.filter((u: UiUser) => u.subscription.type === 'FREE').length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Pro Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {mappedUsers.filter((u: UiUser) => u.subscription.type === 'PRO').length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Enterprise</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {mappedUsers.filter((u: UiUser) => u.subscription.type === 'ENTERPRISE').length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Billing Cycle</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedUsers.filter((u: UiUser) => u.subscription.type !== 'FREE').map((user: UiUser) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge>
                            {user.subscription.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.subscription.status === 'ACTIVE' ? 'default' : 'secondary'}>
                            {user.subscription.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.subscription.billingCycle || 'N/A'}</TableCell>
                        <TableCell>${user.subscription.amount || 0}/mo</TableCell>
                        <TableCell>
                          {user.subscription.expiresAt 
                            ? format(new Date(user.subscription.expiresAt), 'MMM d, yyyy')
                            : 'N/A'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user)
                              setSubType(user.subscription.type)
                              setSubBilling((user.subscription.billingCycle as 'MONTHLY' | 'YEARLY') || 'YEARLY')
                              setSubStatus(user.subscription.status)
                              setShowSubscriptionDialog(true)
                            }}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activity Dialog */}
      <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Activity - {selectedUser?.name}</DialogTitle>
            <DialogDescription>
              View detailed activity logs for this user
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-3">
            {displayedActivities
              .filter((log: UiActivity) => !selectedUser || log.userId === selectedUser.id)
              .map((log: UiActivity) => (
                <div key={log.id} className="flex items-start space-x-3 p-3 rounded-lg border">
                  <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm">{log.action}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription Management Dialog */}
      <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Subscription</DialogTitle>
            <DialogDescription>
              Update subscription details for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subscription Type</Label>
              <Select value={subType} onValueChange={(v) => setSubType(v as typeof subType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE" disabled>Enterprise (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Billing Cycle</Label>
              <Select value={subBilling} onValueChange={(v) => setSubBilling(v as typeof subBilling)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={subStatus} onValueChange={(v) => setSubStatus(v as typeof subStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubscriptionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedUser) return
                if (subType === 'ENTERPRISE') {
                  toast.error('Enterprise plan is not supported yet')
                  return
                }
                updateSubscriptionMutation.mutate({
                  id: selectedUser.id,
                  payload: {
                    type: subType,
                    billingCycle: subBilling,
                    status: subStatus,
                  }
                })
              }}
              disabled={!selectedUser || updateSubscriptionMutation.isPending}
            >
              Update Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
