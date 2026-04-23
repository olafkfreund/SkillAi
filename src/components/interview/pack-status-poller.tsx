'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Mounted only while a pack is pending/processing. Calls router.refresh() every
 * 3s so the server component re-reads the pack status and re-renders when the
 * background generation finishes. Unmounts itself (and so stops polling) when
 * the parent re-renders with a terminal status.
 */
export function PackStatusPoller() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, 3000)
    return () => clearInterval(id)
  }, [router])
  return null
}
