'use client'

import { create } from 'zustand'
import { api, setAuthToken } from '@/lib/api'
import type { User, AuthResponse, RegisterRequest } from '@/shared/types/index'

// Safe helpers for error handling without using `any`
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const extractMessage = (err: unknown, fallback: string): string => {
  if (typeof err === 'string') return err
  if (isRecord(err)) {
    const direct = err['message']
    if (typeof direct === 'string') return direct
    const response = err['response']
    if (isRecord(response)) {
      const data = response['data']
      if (isRecord(data)) {
        const msg = data['message']
        if (typeof msg === 'string') return msg
      }
    }
  }
  return fallback
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<User>
  register: (payload: RegisterRequest) => Promise<User>
  logout: () => void
  setUser: (user: User | null) => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      // Ensure CSRF cookie + header for guarded endpoint
      const csrfRes = await api.get<{ csrfToken: string }>('/auth/csrf')
      const csrfToken = csrfRes.data?.csrfToken
      const { data } = await api.post<AuthResponse>(
        '/auth/login',
        { email, password },
        { headers: { 'X-CSRF-Token': csrfToken } }
      )
      setAuthToken(data.token)
      try {
        localStorage.setItem('taskzen_user', JSON.stringify(data.user))
      } catch {}
      set({ user: data.user, token: data.token, isLoading: false })
      
      // Return the user data so the login page can handle role-based redirect
      return data.user
    } catch (err: unknown) {
      const msg = extractMessage(err, 'Login failed')
      set({ isLoading: false, error: msg })
      throw new Error(msg)
    }
  },
  register: async (payload: RegisterRequest) => {
    set({ isLoading: true, error: null })
    try {
      // Ensure CSRF cookie + header for guarded endpoint
      const csrfRes = await api.get<{ csrfToken: string }>('/auth/csrf')
      const csrfToken = csrfRes.data?.csrfToken
      const { data } = await api.post<AuthResponse>(
        '/auth/register',
        payload,
        { headers: { 'X-CSRF-Token': csrfToken } }
      )
      setAuthToken(data.token)
      try {
        localStorage.setItem('taskzen_user', JSON.stringify(data.user))
      } catch {}
      set({ user: data.user, token: data.token, isLoading: false })
      
      // Return the user data so the register page can handle role-based redirect
      return data.user
    } catch (err: unknown) {
      const msg = extractMessage(err, 'Registration failed')
      set({ isLoading: false, error: msg })
      throw new Error(msg)
    }
  },
  logout: () => {
    setAuthToken(null)
    try {
      localStorage.removeItem('taskzen_user')
    } catch {}
    set({ user: null, token: null, isLoading: false, error: null })
  },
  setUser: (user: User | null) => set({ user }),
  fetchMe: async () => {
    const { token } = get()
    if (!token && typeof window !== 'undefined') {
      try {
        const storedToken = localStorage.getItem('taskzen_token')
        if (storedToken) {
          setAuthToken(storedToken)
          set({ token: storedToken })
        }
      } catch {}
    }
    try {
      const { data } = await api.get<User>('/auth/me')
      try {
        localStorage.setItem('taskzen_user', JSON.stringify(data))
      } catch {}
      set({ user: data })
    } catch {
      // ignore; interceptor will handle 401
    }
  },
}))

// hydrate from localStorage on import (client only)
if (typeof window !== 'undefined') {
  try {
    const t = localStorage.getItem('taskzen_token')
    if (t) {
      // ensure Authorization header is set before any requests
      setAuthToken(t)
      useAuthStore.setState({ token: t })
      const raw = localStorage.getItem('taskzen_user')
      if (raw) {
        const user: User = JSON.parse(raw)
        useAuthStore.setState({ user })
      }
    } else {
      // Ensure no stale user appears without a valid token
      useAuthStore.setState({ user: null, token: null })
    }
  } catch {}
}
