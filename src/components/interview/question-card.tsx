'use client'

import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { InterviewQuestion } from '@/db/schema'
import { updateQuestionNotes } from '@/actions/interview'

const TYPE_COLORS: Record<string, string> = {
  behavioral: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  technical: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',
  situational: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700',
  cultural: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700',
  medium: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800',
  hard: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800',
}

type Props = { question: InterviewQuestion; index: number }

export function QuestionCard({ question, index }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(question.notes ?? '')
  const followUps = (question.followUps as Array<{ question: string }>) ?? []

  async function handleNotesBlur() {
    await updateQuestionNotes(question.id, notes)
  }

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-[var(--color-bg-input)] transition-colors"
      >
        <span className="text-sm font-bold text-[var(--color-fg-subtle)] mt-0.5 w-5 flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-fg)]">{question.questionText}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[question.questionType]}`}>
              {question.questionType}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${DIFFICULTY_COLORS[question.difficulty]}`}>
              {question.difficulty}
            </span>
            {question.cvReferences?.length ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] border-[var(--color-border)]">
                personalised
              </span>
            ) : null}
          </div>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-[var(--color-fg-subtle)] flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[var(--color-border)] pt-4 space-y-4">
          {question.rationale && (
            <div>
              <p className="text-xs font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wide mb-1">Why ask this</p>
              <p className="text-sm text-[var(--color-fg-muted)]">{question.rationale}</p>
            </div>
          )}

          {followUps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wide mb-2">Follow-ups</p>
              <ul className="space-y-1">
                {followUps.map((f, i) => (
                  <li key={i} className="text-sm text-[var(--color-fg-muted)] flex gap-2">
                    <span className="text-[var(--color-fg-subtle)]">→</span> {f.question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wide mb-2">Scoring rubric</p>
            <div className="grid gap-2">
              {question.strongAnswerSignals?.length ? (
                <div className="rounded-md bg-emerald-100 dark:bg-green-950 border border-emerald-300 dark:border-green-800 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-green-400 mb-1">Strong answer signals</p>
                  <ul className="space-y-0.5">
                    {question.strongAnswerSignals.map((s, i) => (
                      <li key={i} className="text-xs text-emerald-700 dark:text-green-400">• {s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {question.acceptableAnswerSignals?.length ? (
                <div className="rounded-md bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Acceptable answer signals</p>
                  <ul className="space-y-0.5">
                    {question.acceptableAnswerSignals.map((s, i) => (
                      <li key={i} className="text-xs text-amber-700 dark:text-amber-400">• {s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {question.weakAnswerSignals?.length ? (
                <div className="rounded-md bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 px-3 py-2">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Weak answer signals</p>
                  <ul className="space-y-0.5">
                    {question.weakAnswerSignals.map((s, i) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-400">• {s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor={`notes-${question.id}`} className="text-xs font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wide block mb-1">
              Interviewer notes
            </label>
            <textarea
              id={`notes-${question.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              rows={2}
              placeholder="Add your notes here…"
              className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2
                         placeholder:text-[var(--color-fg-subtle)]
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>
        </div>
      )}
    </div>
  )
}
