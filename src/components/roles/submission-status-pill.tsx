import type { SubmissionStatus } from '@/db/schema/role-submissions'

const STATUS_STYLES: Record<SubmissionStatus, string> = {
  submitted: 'bg-blue-950 text-blue-300 border-blue-800',
  interview_scheduled: 'bg-violet-950 text-violet-300 border-violet-800',
  interview_done: 'bg-indigo-950 text-indigo-300 border-indigo-800',
  feedback_pending: 'bg-amber-950 text-amber-300 border-amber-800',
  hired: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  rejected: 'bg-red-950 text-red-300 border-red-800',
  withdrawn: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  submitted: 'Submitted',
  interview_scheduled: 'Interview scheduled',
  interview_done: 'Interview done',
  feedback_pending: 'Feedback pending',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

type Props = {
  status: SubmissionStatus
}

export function SubmissionStatusPill({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}
      aria-label={`Submission status: ${STATUS_LABELS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
