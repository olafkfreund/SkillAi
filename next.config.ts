import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    'p620',
    'p620.local',
    'p620.tail833f7.ts.net',
    '*.tail833f7.ts.net',
    '192.168.1.222',
    '100.69.100.115',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '11mb',
    },
  },
  async headers() {
    return [
      {
        // Apply strict security headers to everything EXCEPT /api/export/* —
        // PDF responses need X-Frame-Options/CSP relaxed so the browser's
        // built-in PDF viewer (which uses iframes) can render them.
        source: '/((?!api/export).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.anthropic.com" },
        ],
      },
      {
        // Export routes — minimal headers so PDFs render in the browser tab
        source: '/api/export/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
