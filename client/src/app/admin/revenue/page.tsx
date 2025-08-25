'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'
import { getRevenueMetrics, getRevenueTransactions, exportRevenueTransactionsCsv } from '@/lib/admin'
import { RefreshCw, DollarSign, Users, Clock, Percent, Download } from 'lucide-react'

export default function AdminRevenuePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [plan, setPlan] = useState<string>('all')

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/boards')
    }
  }, [user, router])

  const metricsQuery = useQuery({
    queryKey: ['admin', 'revenue', 'metrics'],
    queryFn: getRevenueMetrics,
    enabled: user?.role === 'ADMIN'
  })

  const transactionsQuery = useQuery({
    queryKey: ['admin', 'revenue', 'transactions', limit, offset, status, plan, search],
    queryFn: () => getRevenueTransactions(limit, { offset, status, plan, q: search }),
    enabled: user?.role === 'ADMIN'
  })

  const loading = metricsQuery.isLoading || transactionsQuery.isLoading

  const allTx = transactionsQuery.data?.transactions ?? []
  const filteredTx = allTx

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [limit, status, plan, search])

  const onExportCsv = async () => {
    const blob = await exportRevenueTransactionsCsv({ status, plan, q: search })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taskzen-transactions-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'succeeded':
        return 'default'
      case 'pending':
        return 'secondary'
      case 'refunded':
        return 'outline'
      case 'failed':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  return (
    <div className="min-h-screen  from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Revenue</h1>
            <p className="text-gray-600 dark:text-gray-400">Estimated subscription revenue (from Pro users) and database-backed transactions</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { metricsQuery.refetch(); transactionsQuery.refetch(); }}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => router.push('/admin/analytics')} variant="outline">
              Analytics
            </Button>
            <Button onClick={() => router.push('/admin')}>Admin</Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">MRR</span>
                <DollarSign className="w-4 h-4 text-yellow-600" />
              </div>
              <div className="text-2xl font-bold">
                {loading ? '…' : `$${(metricsQuery.data?.monthlyRecurringRevenue ?? 0).toLocaleString()}`}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">ARR</span>
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-2xl font-bold">
                {loading ? '…' : `$${(metricsQuery.data?.yearlyProjection ?? 0).toLocaleString()}`}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Pro Users</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold">
                {loading ? '…' : (metricsQuery.data?.totalProUsers ?? 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Avg Lifetime (mo)</span>
                <Clock className="w-4 h-4 text-violet-600" />
              </div>
              <div className="text-2xl font-bold">
                {loading ? '…' : ((metricsQuery.data?.averageCustomerLifetime ?? 0) / 30.44).toFixed(1)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Churn Rate</span>
                <Percent className="w-4 h-4 text-red-600" />
              </div>
              <div className="text-2xl font-bold">
                {loading ? '…' : `${(metricsQuery.data?.churnRate ?? 0).toFixed(1)}%`}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Billing events retrieved from the transactions database</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="hidden md:block text-sm text-muted-foreground mr-2">
                  {(() => {
                    const total = transactionsQuery.data?.total ?? 0
                    const count = filteredTx.length
                    const start = total === 0 ? 0 : offset + 1
                    const end = Math.min(offset + count, total)
                    return `Showing ${start}–${end} of ${total}`
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Show</label>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  >
                    {[10, 25, 50, 100].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                  >
                    <option value="all">All Plans</option>
                    <option value="Pro Monthly">Pro Monthly</option>
                    <option value="Pro Annual">Pro Annual</option>
                  </select>
                </div>
                <div>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="succeeded">Succeeded</option>
                    <option value="pending">Pending</option>
                    <option value="refunded">Refunded</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div className="w-44">
                  <Input
                    placeholder="Search user/email/id…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Button variant="outline" onClick={onExportCsv} title="Export CSV">
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
                <div className="flex items-center gap-2 ml-2">
                  <Button
                    variant="outline"
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0 || loading}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setOffset(offset + limit)}
                    disabled={loading || (transactionsQuery.data ? offset + filteredTx.length >= (transactionsQuery.data.total || 0) : true)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map(t => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="py-2 pr-4 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                      <td className="py-2 pr-4">{t.username} <span className="text-gray-500">({t.email})</span></td>
                      <td className="py-2 pr-4">{t.plan}</td>
                      <td className="py-2 pr-4">${t.amount.toLocaleString()} {t.currency?.toUpperCase?.() ?? 'USD'}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactionsQuery.isError && (
                <p className="text-destructive mt-2">Failed to load transactions</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
