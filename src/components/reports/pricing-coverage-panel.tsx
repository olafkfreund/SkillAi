import { AlertTriangleIcon } from 'lucide-react'
import type { AiSpendDetail } from '@/actions/reports'

type Props = {
  data: AiSpendDetail['pricingCoverage']
}

export function PricingCoveragePanel({ data }: Props) {
  if (data.callsWithZeroCost === 0) return null

  const callWord = data.callsWithZeroCost === 1 ? 'call' : 'calls'

  return (
    <div className="bg-amber-950/40 border border-amber-800 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangleIcon className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-200">Some AI calls priced as $0</p>
        <p className="text-xs text-amber-300 mt-1">
          {data.callsWithZeroCost} {callWord} in this range have{' '}
          <code>cost_usd = 0</code> because their model isn&apos;t in{' '}
          <code>src/lib/ai/pricing.ts</code>:{' '}
          <strong>{data.distinctUnknownModels.join(', ')}</strong>.{' '}
          Add these to the pricing table to capture their cost.
        </p>
      </div>
    </div>
  )
}
