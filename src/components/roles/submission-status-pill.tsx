import type { SubmissionStatus } from '@/db/schema/role-submissions'

const STATUS_STYLES: Record<SubmissionStatus, string> = {
  submitted: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  interview_scheduled: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800',
  interview_done: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
  feedback_pending: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  hired: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  rejected: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
  withdrawn: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700',
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
