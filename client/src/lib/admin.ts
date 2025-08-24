import { api } from './api'

export type AdminStats = {
  totalUsers: number
  totalBoards: number
  totalCards: number
  totalTasks: number
  activeUsers: number
  inactiveUsers: number
  proUsers: number
  adminUsers: number
}

export type AdminUser = {
  id: string
  email: string
  username: string
  firstName?: string
  lastName?: string
  avatar?: string
  role: 'USER' | 'ADMIN'
  isPro: boolean
  proExpiresAt?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { boards: number }
}

export type AdminBoard = {
  id: string
  title: string
  description?: string
  color: string
  isPrivate: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  owner: { id: string; username: string; email: string }
  _count: { members: number; lists: number }
}

export type RevenueMetrics = {
  monthlyRecurringRevenue: number
  yearlyProjection: number
  totalProUsers: number
  averageCustomerLifetime: number
  churnRate: number
}

export type RevenueTransaction = {
  id: string
  userId: string
  email: string
  username: string
  plan: 'Pro Monthly' | 'Pro Annual'
  amount: number
  currency: string
  status: 'succeeded' | 'pending' | 'refunded' | 'failed'
  createdAt: string
}

export type SystemHealth = {
  uptimeSec: number
  memoryMB: number
  dbOk: boolean
  dbLatencyMs: number
  node: string
  env: string
  timestamp: string
}

export type ActivityItem = {
  id: string
  type: string
  createdAt: string
  user?: { id: string; username: string; email: string; avatar?: string }
  board?: { id: string; title: string }
}

export async function getDashboardStats() {
  const { data } = await api.get<AdminStats>('/admin/dashboard')
  return data
}

export async function getUsers() {
  const { data } = await api.get<AdminUser[]>('/admin/users')
  return data
}

export async function getBoards() {
  const { data } = await api.get<AdminBoard[]>('/admin/boards')
  return data
}

export async function deactivateUser(id: string) {
  const { data } = await api.patch<AdminUser>(`/admin/users/${id}/deactivate`)
  return data
}

export async function activateUser(id: string) {
  const { data } = await api.patch<AdminUser>(`/admin/users/${id}/activate`)
  return data
}

export async function upgradeUserToPro(id: string) {
  const { data } = await api.patch<AdminUser>(`/admin/users/${id}/upgrade`)
  return data
}

export async function makeUserAdmin(id: string) {
  const { data } = await api.patch<AdminUser>(`/admin/users/${id}/make-admin`)
  return data
}

export async function removeAdminRole(id: string) {
  const { data } = await api.patch<AdminUser>(`/admin/users/${id}/remove-admin`)
  return data
}

export async function deleteBoard(id: string) {
  const { data } = await api.delete(`/admin/boards/${id}`)
  return data
}

export async function getRevenueMetrics() {
  const { data } = await api.get<RevenueMetrics>('/admin/revenue')
  return data
}

export async function getRevenueTransactions(
  limit = 25,
  opts?: { offset?: number; status?: string; plan?: string; q?: string }
) {
  const { data } = await api.get<{ total: number; transactions: RevenueTransaction[] }>(
    '/admin/revenue/transactions',
    { params: { limit, ...opts } }
  )
  return data
}

export async function exportRevenueTransactionsCsv(
  opts?: { status?: string; plan?: string; q?: string }
) {
  const { data } = await api.get<Blob>(
    '/admin/revenue/transactions/export',
    { params: { ...opts }, responseType: 'blob' as const }
  )
  return data
}

export async function getSystemHealth() {
  const { data } = await api.get<SystemHealth>('/admin/health')
  return data
}

export async function getRecentActivities(limit = 10) {
  const { data } = await api.get<ActivityItem[]>('/admin/activities', { params: { limit } })
  return data
}
