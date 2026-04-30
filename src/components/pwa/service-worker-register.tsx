'use client'

import { useEffect } from 'react'

// Registers /sw.js once on mount. Runs only in the browser. Failures are
// non-fatal and quietly logged — a missing or broken SW must never block
// the app from rendering.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('[sw] registration failed:', err)
      })
  }, [])

  return null
}
