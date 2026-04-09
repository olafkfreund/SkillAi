'use client'

import { useCompareTray } from './comparison-tray'

interface ComparisonCheckboxProps {
  candidateId: string
  candidateName: string
}

// Checkbox wired to the comparison tray — place on any candidate list row
export function ComparisonCheckbox({ candidateId, candidateName }: ComparisonCheckboxProps) {
  const { isSelected, add, remove } = useCompareTray()
  const selected = isSelected(candidateId)

  return (
    <input
      type="checkbox"
      checked={selected}
      onChange={() =>
        selected
          ? remove(candidateId)
          : add({ id: candidateId, name: candidateName })
      }
      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 cursor-pointer
                 focus:ring-blue-500 focus:ring-offset-zinc-900"
      title={selected ? 'Remove from comparison' : 'Add to comparison'}
      aria-label={
        selected
          ? `Remove ${candidateName} from comparison`
          : `Add ${candidateName} to comparison`
      }
    />
  )
}
