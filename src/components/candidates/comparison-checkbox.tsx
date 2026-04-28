'use client'

import { GitCompareArrows } from 'lucide-react'
import { useCompareTray } from './comparison-tray'

interface ComparisonCheckboxProps {
  candidateId: string
  candidateName: string
}

// Icon button wired to the comparison tray — place in the actions cell of any candidate list row
export function ComparisonCheckbox({ candidateId, candidateName }: ComparisonCheckboxProps) {
  const { isSelected, add, remove, items } = useCompareTray()
  const selected = isSelected(candidateId)
  const trayFull = items.length >= 5 && !selected

  return (
    <button
      type="button"
      onClick={() =>
        selected
          ? remove(candidateId)
          : add({ id: candidateId, name: candidateName })
      }
      disabled={trayFull}
      aria-label={
        selected
          ? `Remove ${candidateName} from comparison`
          : `Add ${candidateName} to comparison`
      }
      aria-pressed={selected}
      title={selected ? 'Remove from comparison' : trayFull ? 'Comparison tray full (max 5)' : 'Add to comparison'}
      className={`h-7 w-7 rounded p-1 inline-flex items-center justify-center transition-colors
                  disabled:cursor-not-allowed disabled:opacity-40
                  ${selected
                    ? 'bg-violet-950/40 text-violet-400'
                    : 'text-zinc-600 hover:text-violet-400'
                  }`}
    >
      <GitCompareArrows className="h-4 w-4" />
    </button>
  )
}
