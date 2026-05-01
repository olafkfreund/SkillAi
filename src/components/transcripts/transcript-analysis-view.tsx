'use client'

import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CheckCircle2Icon, AlertTriangleIcon } from 'lucide-react'
import { TranscriptScoreCard } from './transcript-score-card'
import type { QuestionResponse } from '@/db/schema/transcript-analyses'

type Analysis = {
  overallScore: number | null
  communicationScore: number | null
  communicationReasoning: string | null
  technicalDepthScore: number | null
  technicalDepthReasoning: string | null
  problemSolvingScore: number | null
  problemSolvingReasoning: string | null
  socialFitScore: number | null
  socialFitReasoning: string | null
  summary: string | null
  strengths: string[] | null
  redFlags: string[] | null
  recommendedDecision: 'proceed' | 'consider' | 'decline' | null
  questionResponses: QuestionResponse[] | null
}

type Props = {
  analysis: Analysis
}

const QUALITY_CONFIG = {
  strong: { label: 'Strong', classes: 'bg-emerald-900 text-emerald-300 border-emerald-700' },
  acceptable: { label: 'Acceptable', classes: 'bg-amber-900 text-amber-300 border-amber-700' },
  weak: { label: 'Weak', classes: 'bg-red-900 text-red-300 border-red-700' },
}

function QuestionAccordion({ responses }: { responses: QuestionResponse[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (responses.length === 0) return null

  return (
    <div className="space-y-2">
      {responses.map((qr, i) => {
        const isOpen = openIndex === i
        const quality = QUALITY_CONFIG[qr.quality]
        return (
          <div key={i} className="rounded-lg border border-[var(--color-border)] overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-bg-input)] transition-colors"
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`flex-shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${quality.classes}`}>
                  {quality.label}
                </span>
                <span className="text-sm text-[var(--color-fg)] truncate">{qr.questionText}</span>
              </div>
              {isOpen
                ? <ChevronUpIcon className="h-4 w-4 text-[var(--color-fg-subtle)] flex-shrink-0 ml-2" />
                : <ChevronDownIcon className="h-4 w-4 text-[var(--color-fg-subtle)] flex-shrink-0 ml-2" />
              }
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border)] space-y-3">
                {qr.transcriptExcerpt && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-fg-subtle)] mb-1">Transcript excerpt</p>
                    <p className="text-sm text-[var(--color-fg-muted)] italic font-mono bg-[var(--color-bg-input)] rounded px-3 py-2">
                      &ldquo;{qr.transcriptExcerpt}&rdquo;
                    </p>
                  </div>
                )}
                {qr.notes && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-fg-subtle)] mb-1">Assessor notes</p>
                    <p className="text-sm text-[var(--color-fg-muted)]">{qr.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function TranscriptAnalysisView({ analysis }: Props) {
  const strengths = analysis.strengths?.filter(Boolean) ?? []
  const redFlags = analysis.redFlags?.filter(Boolean) ?? []
  const questionResponses = analysis.questionResponses ?? []

  return (
    <div className="space-y-6">
      {/* Score card */}
      <TranscriptScoreCard
        overallScore={analysis.overallScore}
        communicationScore={analysis.communicationScore}
        communicationReasoning={analysis.communicationReasoning}
        technicalDepthScore={analysis.technicalDepthScore}
        technicalDepthReasoning={analysis.technicalDepthReasoning}
        problemSolvingScore={analysis.problemSolvingScore}
        problemSolvingReasoning={analysis.problemSolvingReasoning}
        socialFitScore={analysis.socialFitScore}
        socialFitReasoning={analysis.socialFitReasoning}
        recommendedDecision={analysis.recommendedDecision}
        summary={analysis.summary}
      />

      {/* Strengths + Red flags */}
      {(strengths.length > 0 || redFlags.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {strengths.length > 0 && (
            <div className="rounded-lg bg-emerald-950 border border-emerald-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2Icon className="h-4 w-4 text-emerald-400" />
                <h4 className="text-sm font-semibold text-emerald-300">Strengths</h4>
              </div>
              <ul className="space-y-1.5">
                {strengths.map((s, i) => (
                  <li key={i} className="text-sm text-emerald-200 flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {redFlags.length > 0 && (
            <div className="rounded-lg bg-red-950 border border-red-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangleIcon className="h-4 w-4 text-red-400" />
                <h4 className="text-sm font-semibold text-red-300">Red Flags</h4>
              </div>
              <ul className="space-y-1.5">
                {redFlags.map((f, i) => (
                  <li key={i} className="text-sm text-red-200 flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Question responses accordion */}
      {questionResponses.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-fg)] mb-3">
            Question-by-Question Responses
          </h4>
          <QuestionAccordion responses={questionResponses} />
        </div>
      )}
    </div>
  )
}
