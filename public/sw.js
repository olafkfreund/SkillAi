// SkillAi service worker — minimal, hand-rolled.
// Strategy:
//   * /api/*           → never touched (always live; never cached)
//   * /_next/static/*  → cache-first (immutable Next.js build assets)
//   * everything else  → network-first with a cache fallback for offline browsing
//
// Bump CACHE_VERSION when the SW logic changes; old caches are pruned in `activate`.

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `skillai-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `skillai-runtime-${CACHE_VERSION}`

self.addEventListener('install', (event) => {
  // Activate immediately on first install — no waiting for an old SW to release.
  self.skipWaiting()
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // Pre-cache the manifest so installation works offline-first
      cache.addAll(['/manifest.json']).catch(() => {})
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Claim all open clients so the new SW takes effect without a reload
      self.clients.claim(),
      // Prune any prior-version caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
            .map((k) => caches.delete(k))
        )
      ),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never intercept API calls — server must always be live.
  if (url.pathname.startsWith('/api/')) return

  // Cache-first for immutable Next.js build assets.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Network-first for everything else (HTML pages + public static assets).
  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const fresh = await fetch(request)
    if (fresh.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, fresh.clone())
    }
    return fresh
  } catch (err) {
    return new Response('Offline — asset unavailable', { status: 503 })
  }
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request)
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, fresh.clone())
    }
    return fresh
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    // Last-resort offline page — return a minimal HTML response.
    if (request.mode === 'navigate') {
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>Offline</title>
         <meta name="viewport" content="width=device-width,initial-scale=1">
         <style>body{font-family:system-ui;background:#09090b;color:#e4e4e7;margin:0;padding:32px;text-align:center;}
         h1{font-size:18px;font-weight:600;margin:32px 0 8px}p{font-size:14px;color:#71717a}</style></head>
         <body><h1>You're offline</h1><p>Reconnect and reload to continue.</p></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
      )
    }
    return new Response('Offline', { status: 503 })
  }
}
