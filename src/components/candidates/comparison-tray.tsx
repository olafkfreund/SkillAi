'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'skillai_compare'

export interface CompareItem {
  id: string
  name: string
}

// Hook for managing comparison selection — shared across tray and checkbox
export function useCompareTray() {
  const [items, setItems] = useState<CompareItem[]>([])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setItems(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  const add = (item: CompareItem) => {
    setItems((prev) => {
      if (prev.length >= 5 || prev.some((i) => i.id === item.id)) return prev
      const next = [...prev, item]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const remove = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const clear = () => {
    localStorage.removeItem(STORAGE_KEY)
    setItems([])
  }

  const isSelected = (id: string) => items.some((i) => i.id === id)

  return { items, add, remove, clear, isSelected }
}

// Fixed bottom tray shown when 1+ candidates are selected
export function ComparisonTray() {
  const { items, remove, clear } = useCompareTray()
  const router = useRouter()

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-700 shadow-2xl">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
        <span className="text-sm text-zinc-400 flex-shrink-0">
          Compare ({items.length}/5):
        </span>
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-xs text-zinc-300"
            >
              {item.name}
              <button
                onClick={() => remove(item.id)}
                className="text-zinc-500 hover:text-zinc-300 leading-none"
                aria-label={`Remove ${item.name} from comparison`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={clear}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 transition-colors"
          >
            Clear
          </button>
          <button
            disabled={items.length < 2}
            onClick={() =>
              router.push(
                `/dashboard/compare?ids=${items.map((i) => i.id).join(',')}`
              )
            }
            className="flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-xs font-medium px-4 py-1.5
                       hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Compare &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}
