'use client'

import { useEffect, useState } from 'react'
import { CommandPalette } from './command-palette'

type Props = {
  userRole: string
}

export function CommandPaletteTrigger({ userRole }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (userRole !== 'recruiter' && userRole !== 'admin') return null

  return <CommandPalette open={open} onClose={() => setOpen(false)} />
}
