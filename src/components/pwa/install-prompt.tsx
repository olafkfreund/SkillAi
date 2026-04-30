'use client'

import { useEffect, useState } from 'react'
import { DownloadIcon } from 'lucide-react'

// `beforeinstallprompt` is non-standard but supported in Chromium + Edge.
// Safari iOS doesn't fire it (users install via the share-sheet "Add to Home
// Screen"); the apple-mobile-web-app-capable meta in the root layout makes
// that path work without an in-app prompt. So this component is effectively
// the Android / Chromium install affordance.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Suppress the browser's default mini-bar; we'll trigger via our own button.
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || !deferredPrompt) return null

  return (
    <button
      type="button"
      onClick={async () => {
        await deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') setInstalled(true)
        setDeferredPrompt(null)
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-blue-700 bg-blue-950 text-blue-300 text-xs font-medium
                 px-2.5 py-1.5 hover:bg-blue-900 hover:text-blue-200 transition-colors"
      aria-label="Install SkillAI as an app"
    >
      <DownloadIcon className="h-3.5 w-3.5" />
      Install
    </button>
  )
}
