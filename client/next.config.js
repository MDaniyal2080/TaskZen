/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'res.cloudinary.com'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001/realtime',
  },
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors in the project.
    ignoreDuringBuilds: true,
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ]
    if (isProd) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      })
    }
    return [
      {
        source: '/:path*',
        headers,
      },
    ]
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'
    let origin = 'http://localhost:3001'
    try {
      const u = new URL(apiUrl)
      origin = `${u.protocol}//${u.host}`
    } catch {
      try {
        const w = new URL(process.env.NEXT_PUBLIC_WS_URL || '')
        origin = `${w.protocol}//${w.host}`
      } catch {}
    }
    return [
      {
        source: '/api/v1/:path*',
        destination: `${origin}/api/v1/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${origin}/uploads/:path*`,
      },
    ]
  },
}

module.exports = nextConfig


