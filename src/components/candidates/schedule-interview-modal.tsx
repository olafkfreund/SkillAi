'use client'

import { useState, useTransition } from 'react'
import { XIcon, CalendarIcon } from 'lucide-react'
import { createInterviewSlot } from '@/actions/calendar'

export interface SlotData {
  id: string
  title: string
  scheduledAt: string
  durationMinutes: number
  status: string
  location?: string | null
  meetingUrl?: string | null
}

interface Props {
  candidateId: string
  candidateName: string
  roleId?: string
  allRoles: { id: string; title: string }[]
  onScheduled: (slot: SlotData) => void
  onClose: () => void
  hasGoogleCalendar: boolean
  hasMicrosoftCalendar: boolean
}

const DURATION_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
]

export function ScheduleInterviewModal({
  candidateId,
  candidateName,
  roleId,
  allRoles,
  onScheduled,
  onClose,
  hasGoogleCalendar,
  hasMicrosoftCalendar,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Default date: tomorrow at 10:00
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const defaultDate = tomorrow.toISOString().split('T')[0]

  const [form, setForm] = useState({
    title: `Interview – ${candidateName}`,
    selectedRoleId: roleId ?? '',
    date: defaultDate,
    time: '10:00',
    durationMinutes: 60,
    location: '',
    meetingUrl: '',
    slotNotes: '',
    syncGoogle: false,
    syncMicrosoft: false,
  })

  const update = (field: keyof typeof form, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const scheduledAt = new Date(`${form.date}T${form.time}:00Z`).toISOString()
    const syncToCalendar = form.syncGoogle || form.syncMicrosoft

    startTransition(async () => {
      const result = await createInterviewSlot({
        candidateId,
        roleId: form.selectedRoleId || undefined,
        title: form.title,
        scheduledAt,
        durationMinutes: form.durationMinutes,
        location: form.location || undefined,
        meetingUrl: form.meetingUrl || undefined,
        slotNotes: form.slotNotes || undefined,
        syncToCalendar,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      onScheduled({
        id: result.slotId,
        title: form.title,
        scheduledAt,
        durationMinutes: form.durationMinutes,
        status: 'scheduled',
        location: form.location || null,
        meetingUrl: form.meetingUrl || null,
      })
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-violet-400" />
            <h2 className="font-semibold text-zinc-100 text-sm">Schedule Interview</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              required
              maxLength={300}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Role (optional) */}
          {allRoles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Role <span className="text-zinc-600">(optional)</span>
              </label>
              <select
                value={form.selectedRoleId}
                onChange={(e) => update('selectedRoleId', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                           text-sm text-zinc-100
                           focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                <option value="">No specific role</option>
                {allRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                           text-sm text-zinc-100
                           focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Time (UTC)</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => update('time', e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                           text-sm text-zinc-100
                           focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Duration</label>
            <select
              value={form.durationMinutes}
              onChange={(e) => update('durationMinutes', Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                         text-sm text-zinc-100
                         focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Location <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              maxLength={500}
              placeholder="e.g. Conference Room A, or remote"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Meeting URL */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Meeting URL <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="url"
              value={form.meetingUrl}
              onChange={(e) => update('meetingUrl', e.target.value)}
              placeholder="https://meet.google.com/..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                         text-sm text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Notes <span className="text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={form.slotNotes}
              onChange={(e) => update('slotNotes', e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Any preparation notes or context..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                         text-sm text-zinc-100 placeholder-zinc-500 resize-none
                         focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Calendar sync options */}
          {(hasGoogleCalendar || hasMicrosoftCalendar) && (
            <div className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-zinc-400">Sync to calendar</p>
              {hasGoogleCalendar && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.syncGoogle}
                    onChange={(e) => update('syncGoogle', e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-700 text-violet-500
                               focus:ring-violet-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-sm text-zinc-300">Add to Google Calendar</span>
                </label>
              )}
              {hasMicrosoftCalendar && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.syncMicrosoft}
                    onChange={(e) => update('syncMicrosoft', e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-700 text-violet-500
                               focus:ring-violet-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-sm text-zinc-300">Add to Microsoft O365 Calendar</span>
                </label>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-violet-700 hover:bg-violet-600
                         text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Scheduling...' : 'Schedule Interview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
