'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/store/auth'
import { toast } from 'react-hot-toast'
import {
  AlertTriangle, CheckCircle, XCircle, Eye,
  Flag, Lock, Search, RefreshCw, Clock,
  Ban, UserX, Trash2, AlertCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'

interface FlaggedContent {
  id: string
  type: 'board' | 'card' | 'comment' | 'user_profile'
  content: {
    title?: string
    description?: string
    text?: string
  }
  reporter: {
    id: string
    username: string
    email: string
  }
  reportedUser: {
    id: string
    username: string
    email: string
  }
  reason: string
  status: 'pending' | 'reviewed' | 'under_review' | 'resolved' | 'dismissed' | 'escalated'
  createdAt: string
  reviewedAt?: string
  reviewedBy?: {
    id: string
    username: string
  }
}

interface ModeratedUser {
  id: string
  username: string
  email: string
  status: 'active' | 'warned' | 'suspended' | 'banned'
  violations: number
  lastViolation?: string
  boards: number
  cards: number
  comments: number
  createdAt: string
}

// Helpers to integrate with new Moderation API
function mapUiStatusToReportStatus(ui?: string) {
  if (!ui || ui === 'all') return undefined
  const map: Record<string, string> = {
    pending: 'PENDING',
    reviewed: 'UNDER_REVIEW',
    resolved: 'RESOLVED',
    dismissed: 'DISMISSED',
  }
  return map[ui] ?? ui.toUpperCase()
}

interface ReportApiItem {
  id: string
  contentType: string
  content?: {
    title?: string
    description?: string
    content?: string
    username?: string
    email?: string
  }
  reporter: {
    id: string
    username: string
    email: string
  }
  reportedUser: {
    id: string
    username: string
    email: string
  }
  reason?: string
  status?: string
  createdAt: string
  reviewedAt?: string
  reviewedBy?: {
    id: string
    username: string
  } | null
}

interface ViolationApiItem {
  user?: {
    id: string
    username: string
    email: string
  }
  actions?: Array<{ action?: string }>
  createdAt: string
}

type BulkAction = 'resolve' | 'dismiss' | 'escalate' | 'delete_content' | 'ban_user'

function transformReportToFlaggedContent(report: ReportApiItem): FlaggedContent {
  const typeMap: Record<string, FlaggedContent['type']> = {
    BOARD: 'board',
    CARD: 'card',
    COMMENT: 'comment',
    USER_PROFILE: 'user_profile',
  }
  const type = (typeMap[report?.contentType] || (report?.contentType || '').toLowerCase()) as FlaggedContent['type']

  const content: FlaggedContent['content'] = { title: undefined, description: undefined, text: undefined }
  if (report?.contentType === 'BOARD' && report?.content) {
    content.title = report.content.title
    content.description = report.content.description
  } else if (report?.contentType === 'CARD' && report?.content) {
    content.title = report.content.title
    content.description = report.content.description
  } else if (report?.contentType === 'COMMENT' && report?.content) {
    content.text = report.content.content
  } else if (report?.contentType === 'USER_PROFILE' && report?.content) {
    content.title = report.content.username
    content.description = report.content.email
  }

  // Map API ReportStatus -> UI status union
  const apiStatus: string = report?.status || 'PENDING'
  const statusMap: Record<string, FlaggedContent['status']> = {
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    RESOLVED: 'resolved',
    DISMISSED: 'dismissed',
    ESCALATED: 'escalated',
  }
  const status = statusMap[apiStatus] || 'pending'

  return {
    id: report.id,
    type,
    content,
    reporter: report.reporter,
    reportedUser: report.reportedUser,
    reason: report.reason || 'OTHER',
    status,
    createdAt: report.createdAt,
    reviewedAt: report.reviewedAt,
    reviewedBy: report.reviewedBy ?? undefined,
  }
}

export default function ModerationPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedContent, setSelectedContent] = useState<FlaggedContent | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkReason, setBulkReason] = useState('')

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      toast.error('Admin access required')
      router.replace('/boards')
    }
  }, [user, router])

  // Fetch flagged content
  const { data: flaggedContent, isLoading: loadingContent } = useQuery({
    queryKey: ['moderation', 'reports', filterStatus],
    queryFn: async () => {
      const status = mapUiStatusToReportStatus(filterStatus)
      const response = await api.get('/moderation/reports', {
        params: { status },
      })
      const payload = response.data as { data: ReportApiItem[] }
      return (payload.data || []).map(transformReportToFlaggedContent)
    },
    enabled: user?.role === 'ADMIN'
  })

  // Fetch moderated users
  const { data: moderatedUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['moderation', 'violations'],
    queryFn: async () => {
      const response = await api.get('/moderation/violations', { params: { limit: 100 } })
      const payload = response.data as { data: ViolationApiItem[]; meta?: unknown }
      const map = new Map<string, ModeratedUser>()
      for (const v of payload.data || []) {
        const u = v.user
        if (!u) continue
        const existing = map.get(u.id)
        const base: ModeratedUser = existing || {
          id: u.id,
          username: u.username,
          email: u.email,
          status: 'active',
          violations: 0,
          lastViolation: undefined,
          boards: 0,
          cards: 0,
          comments: 0,
          createdAt: new Date(0).toISOString(),
        }

        // Update counts and last violation timestamp
        base.violations += 1
        if (!base.lastViolation || new Date(v.createdAt) > new Date(base.lastViolation)) {
          base.lastViolation = v.createdAt
        }

        // Derive a rough status from actions on this violation
        if (Array.isArray(v.actions)) {
          for (const a of v.actions) {
            if (a?.action === 'PERMANENT_BAN') base.status = 'banned'
            else if (a?.action === 'TEMPORARY_SUSPENSION' && base.status !== 'banned') base.status = 'suspended'
            else if (a?.action === 'WARNING' && !['banned', 'suspended'].includes(base.status)) base.status = 'warned'
          }
        }

        map.set(u.id, base)
      }
      return Array.from(map.values())
    },
    enabled: user?.role === 'ADMIN'
  })

  // Review content mutation
  const reviewContentMutation = useMutation({
    mutationFn: async ({ reportId, action }: { reportId: string; action: 'approve' | 'remove' | 'dismiss' }) => {
      if (action === 'remove') {
        return api.post(`/moderation/reports/bulk-action`, {
          reportIds: [reportId],
          action: 'delete_content',
          reason: 'Removed via admin moderation UI',
        })
      } else {
        const status = action === 'dismiss' ? 'DISMISSED' : 'RESOLVED'
        return api.put(`/moderation/reports/${reportId}`, { status })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation'] })
      toast.success('Content reviewed successfully')
      setSelectedContent(null)
    },
    onError: () => {
      toast.error('Failed to review content')
    }
  })

  // Helper to trigger review for a specific report from list items
  const handleReviewContentFor = (reportId: string, action: 'approve' | 'remove' | 'dismiss') => {
    reviewContentMutation.mutate({ reportId, action })
  }

  // Bulk action mutation
  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, reason, reportIds }: { action: BulkAction; reason?: string; reportIds: string[] }) => {
      return api.post(`/moderation/reports/bulk-action`, {
        reportIds,
        action,
        reason,
      })
    },
    onSuccess: (res) => {
      const data = res?.data || {}
      const successCount = Array.isArray(data.success) ? data.success.length : 0
      const failedCount = Array.isArray(data.failed) ? data.failed.length : 0
      toast.success(`Bulk action completed: ${successCount} success, ${failedCount} failed`)
      queryClient.invalidateQueries({ queryKey: ['moderation'] })
      setSelectedIds(new Set())
      setBulkReason('')
    },
    onError: () => {
      toast.error('Failed to perform bulk action')
    }
  })

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filteredContent?.forEach((i) => next.add(i.id))
      return next
    })
  }

  const handleClearSelection = () => setSelectedIds(new Set())

  const runBulkAction = (action: BulkAction) => {
    if (selectedIds.size === 0) return
    // Confirm destructive actions
    if ((action === 'delete_content' || action === 'ban_user') &&
        !confirm(`Are you sure you want to perform '${action.replace('_', ' ')}' on ${selectedIds.size} report(s)?`)) {
      return
    }
    bulkActionMutation.mutate({
      action,
      reason: bulkReason || undefined,
      reportIds: Array.from(selectedIds),
    })
  }

  // User action mutation
  const userActionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: 'warn' | 'suspend' | 'ban' | 'activate' }) => {
      if (action === 'activate') {
        return api.patch(`/admin/users/${userId}/activate`)
      }
      const map: Record<string, string> = {
        warn: 'WARNING',
        suspend: 'TEMPORARY_SUSPENSION',
        ban: 'PERMANENT_BAN',
      }
      return api.post(`/moderation/actions`, {
        targetUserId: userId,
        action: map[action],
        reason: `Admin ${action} via moderation UI`,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation', 'violations'] })
      toast.success('User action completed')
    },
    onError: () => {
      toast.error('Failed to perform user action')
    }
  })

  const handleReviewContent = (action: 'approve' | 'remove' | 'dismiss') => {
    if (selectedContent) {
      reviewContentMutation.mutate({ reportId: selectedContent.id, action })
    }
  }

  const handleUserAction = (userId: string, action: 'warn' | 'suspend' | 'ban' | 'activate') => {
    if (confirm(`Are you sure you want to ${action} this user?`)) {
      userActionMutation.mutate({ userId, action })
    }
  }

  const getStatusBadge = (status: string) => {
    const key = (status || '').toString().toLowerCase()
    const badges: Record<string, { color: string; icon: LucideIcon }> = {
      pending: { color: 'bg-yellow-500', icon: Clock },
      reviewed: { color: 'bg-blue-500', icon: Eye },
      under_review: { color: 'bg-blue-500', icon: Eye },
      resolved: { color: 'bg-green-500', icon: CheckCircle },
      dismissed: { color: 'bg-gray-500', icon: XCircle },
      escalated: { color: 'bg-purple-600', icon: AlertTriangle },
      active: { color: 'bg-green-500', icon: CheckCircle },
      warned: { color: 'bg-yellow-500', icon: AlertTriangle },
      suspended: { color: 'bg-orange-500', icon: Lock },
      banned: { color: 'bg-red-500', icon: Ban },
    }
    const badge = badges[key] || { color: 'bg-gray-500', icon: AlertCircle }
    const Icon = badge.icon
    return (
      <Badge className={`${badge.color} text-white`}>
        <Icon className="w-3 h-3 mr-1" />
        {key.charAt(0).toUpperCase() + key.slice(1)}
      </Badge>
    )
  }

  const filteredContent = flaggedContent?.filter(item => {
    const matchesSearch = searchTerm === '' || 
      item.content.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reportedUser.username.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesSearch
  })

  const filteredUsers = moderatedUsers?.filter(user => {
    return searchTerm === '' || 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  })

  if (loadingContent || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen  from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Content Moderation</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Review flagged content and manage user violations
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['moderation'] })}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    {flaggedContent?.filter(c => c.status === 'pending').length || 0}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Pending Reviews</p>
                </div>
                <Flag className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    {moderatedUsers?.filter(u => u.status === 'warned').length || 0}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Warned Users</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    {moderatedUsers?.filter(u => u.status === 'suspended').length || 0}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Suspended</p>
                </div>
                <Lock className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    {flaggedContent?.filter(c => c.status === 'resolved').length || 0}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Resolved</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search content or users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg dark:bg-slate-800"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="flagged" className="space-y-6">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="flagged">
              <Flag className="w-4 h-4 mr-2" />
              Flagged Content ({filteredContent?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="users">
              <UserX className="w-4 h-4 mr-2" />
              User Violations ({filteredUsers?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Flagged Content Tab */}
          <TabsContent value="flagged">
            <Card>
              <CardHeader>
                <CardTitle>Flagged Content</CardTitle>
                <CardDescription>
                  Review and moderate reported content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Bulk actions toolbar (shows when any selected) */}
                  {selectedIds.size > 0 && (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2 p-3 border rounded-lg bg-gray-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{selectedIds.size} selected</Badge>
                        <Button size="sm" variant="ghost" onClick={handleSelectAllVisible}>Select all visible</Button>
                        <Button size="sm" variant="ghost" onClick={handleClearSelection}>Clear</Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Reason (optional)"
                          value={bulkReason}
                          onChange={(e) => setBulkReason(e.target.value)}
                          className="w-56"
                        />
                        <Button size="sm" onClick={() => runBulkAction('resolve')} disabled={bulkActionMutation.isPending}>Resolve</Button>
                        <Button size="sm" variant="outline" onClick={() => runBulkAction('dismiss')} disabled={bulkActionMutation.isPending}>Dismiss</Button>
                        <Button size="sm" variant="secondary" onClick={() => runBulkAction('escalate')} disabled={bulkActionMutation.isPending}>Escalate</Button>
                        <Button size="sm" variant="destructive" onClick={() => runBulkAction('delete_content')} disabled={bulkActionMutation.isPending}>Delete Content</Button>
                        <Button size="sm" variant="destructive" onClick={() => runBulkAction('ban_user')} disabled={bulkActionMutation.isPending}>Ban User</Button>
                      </div>
                    </div>
                  )}

                  {filteredContent?.map((item) => (
                    <div
                      key={item.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                      onClick={() => setSelectedContent(item)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={(e) => {
                                e.stopPropagation()
                                handleToggleSelect(item.id)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4"
                            />
                            {getStatusBadge(item.status)}
                            <Badge variant="outline">{item.type}</Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="font-semibold">
                            {item.content.title || item.content.text?.slice(0, 100)}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Reported by: {item.reporter.username} | 
                            User: {item.reportedUser.username}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Reason: {item.reason}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReviewContentFor(item.id, 'dismiss')
                            }}
                          >
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReviewContentFor(item.id, 'remove')
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {filteredContent?.length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      No flagged content to review
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Violations</CardTitle>
                <CardDescription>
                  Manage users with content violations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4">User</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Violations</th>
                        <th className="text-left p-4">Content</th>
                        <th className="text-left p-4">Last Violation</th>
                        <th className="text-left p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers?.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-800">
                          <td className="p-4">
                            <div>
                              <p className="font-medium">{user.username}</p>
                              <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                          </td>
                          <td className="p-4">
                            {getStatusBadge(user.status)}
                          </td>
                          <td className="p-4">
                            <Badge variant={user.violations > 3 ? 'destructive' : 'secondary'}>
                              {user.violations} violations
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="text-sm">
                              <p>{user.boards} boards</p>
                              <p>{user.cards} cards</p>
                              <p>{user.comments} comments</p>
                            </div>
                          </td>
                          <td className="p-4">
                            <p className="text-sm">
                              {user.lastViolation ? 
                                new Date(user.lastViolation).toLocaleDateString() : 
                                'None'}
                            </p>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              {user.status === 'active' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUserAction(user.id, 'warn')}
                                >
                                  Warn
                                </Button>
                              )}
                              {user.status !== 'suspended' && user.status !== 'banned' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-600"
                                  onClick={() => handleUserAction(user.id, 'suspend')}
                                >
                                  Suspend
                                </Button>
                              )}
                              {user.status !== 'banned' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleUserAction(user.id, 'ban')}
                                >
                                  Ban
                                </Button>
                              )}
                              {user.status !== 'active' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600"
                                  onClick={() => handleUserAction(user.id, 'activate')}
                                >
                                  Activate
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {filteredUsers?.length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      No users with violations
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Content Detail Modal */}
        {selectedContent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Review Flagged Content</CardTitle>
                <Button
                  className="absolute top-4 right-4"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedContent(null)}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Type</p>
                  <Badge>{selectedContent.type}</Badge>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600">Status</p>
                  {getStatusBadge(selectedContent.status)}
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600">Content</p>
                  <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                    {selectedContent.content.title && (
                      <h4 className="font-semibold mb-2">{selectedContent.content.title}</h4>
                    )}
                    {selectedContent.content.description && (
                      <p className="text-sm">{selectedContent.content.description}</p>
                    )}
                    {selectedContent.content.text && (
                      <p className="text-sm">{selectedContent.content.text}</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600">Reported By</p>
                  <p>{selectedContent.reporter.username} ({selectedContent.reporter.email})</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600">Reported User</p>
                  <p>{selectedContent.reportedUser.username} ({selectedContent.reportedUser.email})</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600">Reason</p>
                  <p>{selectedContent.reason}</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600">Reported On</p>
                  <p>{new Date(selectedContent.createdAt).toLocaleString()}</p>
                </div>
                
                {selectedContent.reviewedAt && (
                  <div>
                    <p className="text-sm font-medium text-gray-600">Reviewed</p>
                    <p>
                      {new Date(selectedContent.reviewedAt).toLocaleString()} by{' '}
                      {selectedContent.reviewedBy?.username}
                    </p>
                  </div>
                )}
                
                {selectedContent.status === 'pending' && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => handleReviewContent('dismiss')}
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Dismiss
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleReviewContent('approve')}
                      className="flex-1 text-green-600"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleReviewContent('remove')}
                      className="flex-1"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove Content
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
