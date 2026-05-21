/**
 * Shared types for the auto-match pipeline (epic #267).
 *
 * The pipeline pre-filters the candidate archive when a new role is created
 * and surfaces the top survivors to the role detail page. See
 * `prefilter.ts` for the filter logic and `rejection.ts` for the
 * customer-rejection signal.
 */

export type RateMatch = 'within' | 'over' | 'currency_mismatch' | 'unknown'

export type AvailabilityResult =
  | { status: 'available' }
  | { status: 'on_project'; availableFrom: string | null }

export type PrefilterResult = {
  candidateId: string
  similarity: number
  rateMatch: RateMatch
  rateOveragePercent: number | null
  availability: AvailabilityResult
}
