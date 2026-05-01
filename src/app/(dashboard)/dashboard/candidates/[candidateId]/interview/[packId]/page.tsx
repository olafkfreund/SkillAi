import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, ClockIcon, BrainIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewPacks, interviewQuestions, codeChallenges, candidates, roles } from '@/db/schema'
import { eq, asc, and } from 'drizzle-orm'
import { QuestionCard } from '@/components/interview/question-card'
import { CodeChallengeCard } from '@/components/interview/code-challenge'
import { DownloadPdfButton } from '@/components/export/download-pdf-button'
import { GenerationProgress } from '@/components/interview/generation-progress'
import { RetryButton } from '@/components/interview/retry-button'


type Props = {
  params: Promise<{ candidateId: string; packId: string }>
}

export default async function InterviewPackPage({ params }: Props) {
  const { candidateId, packId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(interviewPacks)
      .where(and(eq(interviewPacks.id, packId), eq(interviewPacks.tenantId, tenantId)))
      .limit(1)
  )
  if (!pack) notFound()

  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  )
  if (!candidate) notFound()

  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select().from(roles).where(eq(roles.id, pack.roleId)).limit(1)
  )

  const questions = pack.generationStatus === 'complete'
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select()
          .from(interviewQuestions)
          .where(eq(interviewQuestions.packId, packId))
          .orderBy(asc(interviewQuestions.orderIndex))
      )
    : []

  const [codeChallenge] = pack.generationStatus === 'complete'
    ? await withTenant(tenantId, async (tx) =>
        tx.select().from(codeChallenges).where(eq(codeChallenges.packId, packId)).limit(1)
      )
    : [undefined]

  const isPending =
    pack.generationStatus === 'pending' || pack.generationStatus === 'processing'

  return (
    <div className="max-w-3xl">
      <Link
        href={`/dashboard/candidates/${candidateId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to candidate
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-violet-950 rounded-lg">
            <BrainIcon className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-fg)]">
              {role ? role.title : 'Interview Pack'}
            </h1>
            <p className="text-sm text-[var(--color-fg-subtle)] mt-0.5">
              Interview pack for{' '}
              <span className="text-[var(--color-fg)]">
                {candidate.firstName} {candidate.lastName}
              </span>
            </p>
          </div>
        </div>

        {pack.generationStatus === 'complete' && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {pack.packType === 'pre_screening' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-950 text-amber-300 border border-amber-700">
                Pre-screening · 30 min
              </span>
            )}
            {pack.language && pack.language !== 'en' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-bg-input)] text-[var(--color-fg)] border border-[var(--color-border)]">
                {pack.language.toUpperCase()}
              </span>
            )}
            {pack.experienceLevel && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-950 text-blue-300 border border-blue-700 capitalize">
                {pack.experienceLevel} level
              </span>
            )}
            {pack.recommendedDurationMinutes && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] border border-[var(--color-border)]">
                <ClockIcon className="h-3 w-3" />
                {pack.recommendedDurationMinutes} min recommended
              </span>
            )}
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] border border-[var(--color-border)]">
              {questions.length} questions
            </span>
            {pack.includesCodeChallenge && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-violet-950 text-violet-400 border border-violet-700">
                Code challenge included
              </span>
            )}
            <DownloadPdfButton
              href={`/api/export/interview-pack/${packId}`}
              label="Download PDF"
            />
          </div>
        )}
      </div>

      {/* Live progress for pending/processing */}
      {isPending && (
        <GenerationProgress packId={packId} />
      )}

      {/* Failed banner */}
      {pack.generationStatus === 'failed' && (
        <div className="rounded-xl bg-red-950 border border-red-800 px-5 py-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-400">Generation failed</p>
              {pack.errorMessage && (
                <p className="text-xs text-red-500 mt-0.5 line-clamp-2">{pack.errorMessage.split('\n')[0]}</p>
              )}
            </div>
            <RetryButton packId={packId} includesCodeChallenge={pack.includesCodeChallenge} />
          </div>
        </div>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-3">
            Interview Questions
          </h2>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <QuestionCard key={q.id} question={q} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Code challenge */}
      {codeChallenge && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-3">
            Code Challenge
          </h2>
          <CodeChallengeCard challenge={codeChallenge} />
        </div>
      )}
    </div>
  )
}
