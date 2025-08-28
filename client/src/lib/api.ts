import axios from 'axios'
import { toast } from 'react-hot-toast'

// Robust base URL:
// - In the browser: use relative '/api/v1' so requests go through Next.js rewrites
// - On the server (SSR/Node): use absolute backend URL from env (or localhost fallback)
const envApi = process.env.NEXT_PUBLIC_API_URL
const baseURL = typeof window !== 'undefined'
  ? (envApi || '/api/v1')
  : (envApi || 'http://localhost:3001/api/v1')

export const api = axios.create({
  baseURL,
  withCredentials: true,
})

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    try {
      localStorage.setItem('taskzen_token', token)
      // Mirror token into a cookie so Next.js middleware can read it server-side
      // Note: cannot set HttpOnly from client; this complements localStorage for middleware-only checks
      const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
      const maxAge = 60 * 60 * 24 * 7 // 7 days (matches default server session)
      const parts = [
        `taskzen_token=${encodeURIComponent(token)}`,
        'Path=/',
        `Max-Age=${maxAge}`,
        isSecure ? 'Secure; SameSite=None' : 'SameSite=Lax',
      ]
      document.cookie = parts.join('; ')
    } catch {}
  } else {
    delete api.defaults.headers.common['Authorization']
    try {
      localStorage.removeItem('taskzen_token')
      // Proactively clear the cookie copy
      document.cookie = 'taskzen_token=; Path=/; Max-Age=0'
    } catch {}
  }
}

// Attach token from storage on first import (client-only)
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('taskzen_token')
    if (stored) setAuthToken(stored)
  } catch {}
}

// Basic 401 handling
api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Maintenance mode
    if (error?.response?.status === 503 && typeof window !== 'undefined') {
      try {
        const info = error?.response?.data?.maintenance || null
        if (info) sessionStorage.setItem('maintenance_info', JSON.stringify(info))
      } catch {}
      if (!window.location.pathname.startsWith('/maintenance')) {
        window.location.href = '/maintenance'
      }
    }

    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      setAuthToken(null)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      // Do not show a toast here; redirect is enough
      return Promise.reject(error)
    }

    // Friendly error toasts for normal users
    try {
      // Allow per-request opt-out
      const suppressed = error?.config?.headers?.['X-Suppress-Error-Toast']
      if (!suppressed && typeof window !== 'undefined') {
        const status: number | undefined = error?.response?.status
        const data = error?.response?.data || {}
        const serverMessage: string | undefined = (data && (data.message || data.error)) || undefined

        let userMessage = serverMessage

        if (!status) {
          userMessage = 'Network error. Please check your connection and try again.'
        } else if (status >= 500) {
          userMessage = 'Something went wrong on our side. Please try again later.'
        } else if (status === 404) {
          userMessage = 'We couldn\'t find what you\'re looking for.'
        } else if (status === 403) {
          userMessage = "You don't have permission to do that."
        } else if (status === 429) {
          userMessage = 'Too many requests. Please try again in a moment.'
        } else if (status === 422) {
          userMessage = 'Validation failed. Please check the form and try again.'
        } else if (status === 409) {
          userMessage = 'There\'s a conflict with the current data. Please refresh and try again.'
        } else if (status === 400) {
          userMessage = serverMessage || 'Please check your input and try again.'
        }

        if (userMessage) {
          toast.error(userMessage)
        }
      }
    } catch {}
    return Promise.reject(error)
  }
)
