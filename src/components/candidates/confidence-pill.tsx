/**
 * ConfidencePill — small visual indicator for an enrichment match confidence
 * score (0–100). Rendered next to discovered/confirmed external profiles
 * (LinkedIn, GitHub, etc.) on candidate views.
 *
 * Tier mapping:
 *   ≥ 85   → high       (emerald) "High match"
 *   60–84  → medium     (yellow)  "Suggested"
 *   40–59  → low        (zinc)    "Weak match"
 *   < 40   → not_match  (red)     "Unlikely match"
 */

interface ConfidencePillProps {
  /** Match confidence on a 0–100 scale. */
  score: number
  className?: string
}

export function ConfidencePill({ score, className }: ConfidencePillProps) {
  const tier =
    score >= 85 ? 'high' :
    score >= 60 ? 'medium' :
    score >= 40 ? 'low' : 'not_match'

  const tierStyles = {
    high: 'bg-emerald-900/40 border-emerald-700 text-emerald-200',
    medium: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
    low: 'bg-[var(--color-bg-input)] border-[var(--color-border)] text-[var(--color-fg-muted)]',
    not_match: 'bg-red-900/40 border-red-700 text-red-300',
  }[tier]

  const label =
    score >= 85 ? 'High match' :
    score >= 60 ? 'Suggested' :
    score >= 40 ? 'Weak match' : 'Unlikely match'

  const classes = [
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
    tierStyles,
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} title={`Confidence ${score}/100`}>
      {label} · {score}
    </span>
  )
}
