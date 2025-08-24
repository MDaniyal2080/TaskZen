import axios from 'axios'

// Robust base URL:
// - In the browser: use relative '/api/v1' so requests go through Next.js rewrites
// - On the server (SSR/Node): use absolute backend URL from env (or localhost fallback)
const envApi = process.env.NEXT_PUBLIC_API_URL
const baseURL = typeof window !== 'undefined'
  ? '/api/v1'
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
    } catch {}
  } else {
    delete api.defaults.headers.common['Authorization']
    try {
      localStorage.removeItem('taskzen_token')
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
    }
    return Promise.reject(error)
  }
)
