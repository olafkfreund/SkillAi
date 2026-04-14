import Link from 'next/link'
import { CalendarIcon, VideoIcon, MapPinIcon, ChevronRightIcon } from 'lucide-react'

export type UpcomingInterview = {
  id: string
  scheduledAt: Date
  durationMinutes: number
  title: string
  location: string | null
  meetingUrl: string | null
  status: string
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  roleTitle: string | null
  interviewerName: string | null
}

type Props = {
  interviews: UpcomingInterview[]
}

/**
 * Format the scheduled time relative to now.
 * - < 60 min: "In N min"
 * - Same day: "Today at HH:mm"
 * - Tomorrow: "Tomorrow at HH:mm"
 * - Within 7 days: "Mon 14 Apr at HH:mm"
 * - Beyond: "14 Apr 2026 at HH:mm"
 */
function formatScheduledAt(date: Date): string {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60_000)
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  if (diffMins < 60) {
    return `In ${Math.max(0, diffMins)} min`
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const inAWeek = new Date(today)
  inAWeek.setDate(today.getDate() + 7)

  const dateDay = new Date(date)
  dateDay.setHours(0, 0, 0, 0)

  if (dateDay.getTime() === today.getTime()) return `Today at ${time}`
  if (dateDay.getTime() === tomorrow.getTime()) return `Tomorrow at ${time}`

  if (dateDay.getTime() < inAWeek.getTime()) {
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' })
    const day = date.getDate()
    const month = date.toLocaleDateString('en-GB', { month: 'short' })
    return `${weekday} ${day} ${month} at ${time}`
  }

  const day = date.getDate()
  const month = date.toLocaleDateString('en-GB', { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year} at ${time}`
}

function isImminent(date: Date): boolean {
  const diffMins = (date.getTime() - Date.now()) / 60_000
  return diffMins >= 0 && diffMins <= 60
}

export function NextInterviewsCard({ interviews }: Props) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Next Interviews
          </h2>
        </div>
        {interviews.length > 0 && (
          <span className="text-xs text-zinc-500">
            {interviews.length} upcoming
          </span>
        )}
      </div>

      {interviews.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">
          No upcoming interviews scheduled
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {interviews.map((slot) => {
            const imminent = isImminent(slot.scheduledAt)
            return (
              <li key={slot.id} className="py-3 first:pt-0 last:pb-0">
                <div
                  className={`flex items-center gap-3 ${
                    imminent ? 'border-l-2 border-amber-500 pl-3' : ''
                  }`}
                >
                  {/* Candidate + role */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/candidates/${slot.candidateId}`}
                      className="block"
                    >
                      <p className="text-sm font-medium text-zinc-100 truncate hover:text-blue-400 transition-colors">
                        {slot.candidateFirstName} {slot.candidateLastName}
                        {slot.roleTitle && (
                          <span className="text-zinc-500 font-normal"> · {slot.roleTitle}</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {slot.title}
                        {slot.interviewerName && (
                          <span className="text-zinc-600"> · with {slot.interviewerName}</span>
                        )}
                        {slot.location && (
                          <span className="text-zinc-600 inline-flex items-center gap-0.5 ml-2">
                            <MapPinIcon className="h-3 w-3" />
                            {slot.location}
                          </span>
                        )}
                      </p>
                    </Link>
                  </div>

                  {/* Time */}
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    <p
                      className={`text-sm font-medium tabular-nums ${
                        imminent ? 'text-amber-400' : 'text-zinc-100'
                      }`}
                    >
                      {formatScheduledAt(slot.scheduledAt)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {slot.durationMinutes} min
                    </p>
                  </div>

                  {/* Action */}
                  <div className="flex-shrink-0">
                    {slot.meetingUrl ? (
                      <a
                        href={slot.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-violet-700 transition-colors"
                      >
                        <VideoIcon className="h-3.5 w-3.5" />
                        Join
                      </a>
                    ) : (
                      <Link
                        href={`/dashboard/candidates/${slot.candidateId}`}
                        className="inline-flex items-center gap-0.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        View
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
