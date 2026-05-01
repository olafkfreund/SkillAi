'use client'

import { useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  MapPinIcon,
  VideoIcon,
  XCircleIcon,
  PencilIcon,
} from 'lucide-react'
import { cancelInterviewSlot } from '@/actions/calendar'
import { ScheduleInterviewModal, type SlotData } from './schedule-interview-modal'

interface Props {
  candidateId: string
  candidateName: string
  roleId?: string
  initialSlots: SlotData[]
  canSchedule: boolean
  allRoles: { id: string; title: string }[]
  hasGoogleCalendar: boolean
  hasMicrosoftCalendar: boolean
}

// Hours displayed in the calendar grid (8 AM – 6 PM inclusive)
const START_HOUR = 8
const END_HOUR = 19
const TOTAL_HOURS = END_HOUR - START_HOUR

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  // Monday as start of week
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function isToday(date: Date): boolean {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

interface SlotPopoverProps {
  slot: SlotData
  candidateId: string
  canSchedule: boolean
  onCancelled: (slotId: string) => void
  onEdit: (slot: SlotData) => void
  onClose: () => void
}

function SlotPopover({ slot, candidateId, canSchedule, onCancelled, onEdit, onClose }: SlotPopoverProps) {
  const [cancelling, setCancelling] = useState(false)
  const start = new Date(slot.scheduledAt)
  const end = new Date(start.getTime() + slot.durationMinutes * 60_000)

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

  const handleCancel = async () => {
    setCancelling(true)
    await cancelInterviewSlot(slot.id, candidateId)
    onCancelled(slot.id)
    onClose()
  }

  return (
    <div className="absolute z-30 left-0 top-full mt-1 w-64 bg-[var(--color-bg-input)] border border-[var(--color-border)]
                    rounded-lg shadow-xl p-4 text-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-[var(--color-fg)] leading-tight">{slot.title}</p>
        <button onClick={onClose} className="p-1 rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] flex-shrink-0">
          <XCircleIcon className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[var(--color-fg-muted)] text-xs mb-1">
        {start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </p>
      <p className="text-[var(--color-fg)] text-xs mb-3">
        {formatTime(start)} – {formatTime(end)} UTC ({slot.durationMinutes} min)
      </p>

      {slot.location && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] mb-1">
          <MapPinIcon className="h-3 w-3 flex-shrink-0" />
          <span>{slot.location}</span>
        </div>
      )}
      {slot.meetingUrl && (
        <div className="flex items-center gap-1.5 text-xs mb-3">
          <VideoIcon className="h-3 w-3 flex-shrink-0 text-[var(--color-fg-muted)]" />
          <a
            href={slot.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 truncate"
          >
            Join meeting
          </a>
        </div>
      )}

      {canSchedule && slot.status !== 'cancelled' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { onEdit(slot); onClose() }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium
                       text-violet-300 border border-violet-800 rounded-md
                       px-3 py-1.5 hover:bg-violet-950 transition-colors"
          >
            <PencilIcon className="h-3 w-3" />
            Edit
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex-1 text-xs font-medium text-red-400 border border-red-800 rounded-md
                       px-3 py-1.5 hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        </div>
      )}
    </div>
  )
}

export function InterviewCalendar({
  candidateId,
  candidateName,
  roleId,
  initialSlots,
  canSchedule,
  allRoles,
  hasGoogleCalendar,
  hasMicrosoftCalendar,
}: Props) {
  const [slots, setSlots] = useState<SlotData[]>(initialSlots)
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [showModal, setShowModal] = useState(false)
  const [editingSlot, setEditingSlot] = useState<SlotData | null>(null)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const prevWeek = () => setWeekStart((d) => addDays(d, -7))
  const nextWeek = () => setWeekStart((d) => addDays(d, 7))
  const goToday = () => setWeekStart(getWeekStart(new Date()))

  const handleScheduled = (slot: SlotData) => {
    if (editingSlot) {
      // Edit mode: replace the existing slot
      setSlots((prev) => prev.map((s) => (s.id === editingSlot.id ? { ...s, ...slot, id: editingSlot.id } : s)))
    } else {
      setSlots((prev) => [slot, ...prev])
    }
    setShowModal(false)
    setEditingSlot(null)
  }

  const handleEdit = (slot: SlotData) => {
    setEditingSlot(slot)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingSlot(null)
  }

  const handleCancelled = (slotId: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, status: 'cancelled' } : s))
    )
  }

  // Returns slots that fall on a given calendar day
  const slotsForDay = (day: Date): SlotData[] => {
    return slots.filter((s) => {
      const d = new Date(s.scheduledAt)
      return (
        d.getUTCFullYear() === day.getFullYear() &&
        d.getUTCMonth() === day.getMonth() &&
        d.getUTCDate() === day.getDate()
      )
    })
  }

  // Compute top position and height for a slot block (as percentage of grid height)
  const slotStyle = (slot: SlotData): React.CSSProperties => {
    const d = new Date(slot.scheduledAt)
    const startHour = d.getUTCHours() + d.getUTCMinutes() / 60
    const topPct = ((startHour - START_HOUR) / TOTAL_HOURS) * 100
    const heightPct = (slot.durationMinutes / 60 / TOTAL_HOURS) * 100
    return {
      top: `${Math.max(0, topPct)}%`,
      height: `${Math.max(2, heightPct)}%`,
    }
  }

  const formatSlotTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  }

  // Height of the time grid in px (determines slot positioning precision)
  const GRID_HEIGHT = 440

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                       hover:border-[var(--color-border)] transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] rounded-md
                       hover:text-[var(--color-fg)] hover:border-[var(--color-border)] transition-colors"
          >
            Today
          </button>
          <button
            onClick={nextWeek}
            className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                       hover:border-[var(--color-border)] transition-colors"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <span className="text-xs text-[var(--color-fg-subtle)] ml-1">
            {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
          </span>
        </div>

        {canSchedule && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       bg-violet-700 hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Schedule Interview
          </button>
        )}
      </div>

      {/* Scroll hint — only shown on phones where the 640px grid overflows */}
      <p className="md:hidden text-xs text-[var(--color-fg-subtle)] mb-2">
        ← Scroll horizontally to see the full week →
      </p>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b border-[var(--color-border)] mb-0">
            {/* Time label column header */}
            <div className="col-span-1" />
            {weekDays.map((day, i) => (
              <div
                key={i}
                className={`col-span-1 text-center py-2 text-xs font-medium
                  ${isToday(day) ? 'text-violet-400' : 'text-[var(--color-fg-muted)]'}`}
              >
                <div>{DAY_LABELS[i]}</div>
                <div
                  className={`text-lg font-bold leading-tight
                    ${isToday(day)
                      ? 'text-violet-300 bg-violet-900/50 rounded-full w-8 h-8 flex items-center justify-center mx-auto'
                      : 'text-[var(--color-fg)]'
                    }`}
                >
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>

          {/* Time rows + slot blocks */}
          <div className="grid grid-cols-8" style={{ height: `${GRID_HEIGHT}px` }}>
            {/* Hour labels */}
            <div className="col-span-1 flex flex-col border-r border-[var(--color-border)]">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i).map((hour) => (
                <div
                  key={hour}
                  className="flex-1 border-b border-[var(--color-border)] pr-2 flex items-start justify-end"
                >
                  <span className="text-[10px] text-[var(--color-fg-subtle)] mt-1">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIndex) => {
              const daySlots = slotsForDay(day)
              return (
                <div
                  key={dayIndex}
                  className={`col-span-1 relative border-r border-[var(--color-border)]
                    ${isToday(day) ? 'bg-violet-950/20' : ''}`}
                >
                  {/* Hour grid lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute w-full border-b border-[var(--color-border)]"
                      style={{ top: `${(i / TOTAL_HOURS) * 100}%` }}
                    />
                  ))}

                  {/* Slot blocks */}
                  {daySlots.map((slot) => {
                    const isCancelled = slot.status === 'cancelled'
                    const isOpen = openPopoverId === slot.id
                    return (
                      <div
                        key={slot.id}
                        className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 cursor-pointer
                                   overflow-hidden text-[10px] leading-tight transition-opacity
                                   hover:opacity-90 relative"
                        style={{
                          ...slotStyle(slot),
                          backgroundColor: isCancelled ? 'var(--color-bg-input)' : '#6d28d9',
                          opacity: isCancelled ? 0.6 : 1,
                        }}
                        onClick={() => setOpenPopoverId(isOpen ? null : slot.id)}
                      >
                        <p
                          className={`font-semibold text-white truncate
                            ${isCancelled ? 'line-through text-[var(--color-fg-muted)]' : ''}`}
                        >
                          {slot.title}
                        </p>
                        <p className={`text-[9px] ${isCancelled ? 'text-[var(--color-fg-subtle)]' : 'text-violet-200'}`}>
                          {formatSlotTime(slot.scheduledAt)}
                        </p>

                        {isOpen && (
                          <SlotPopover
                            slot={slot}
                            candidateId={candidateId}
                            canSchedule={canSchedule}
                            onCancelled={handleCancelled}
                            onEdit={handleEdit}
                            onClose={() => setOpenPopoverId(null)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Upcoming slots list (for slots outside the visible week) */}
      {slots.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide mb-2">
            All scheduled interviews
          </p>
          <div className="space-y-1.5">
            {slots.map((slot) => {
              const d = new Date(slot.scheduledAt)
              const isCancelled = slot.status === 'cancelled'
              return (
                <div
                  key={slot.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs
                    ${isCancelled ? 'bg-[var(--color-bg-input)]/50' : 'bg-[var(--color-bg-input)]'}`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0
                    ${isCancelled ? 'bg-[var(--color-border)]' : 'bg-violet-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate
                      ${isCancelled ? 'text-[var(--color-fg-subtle)] line-through' : 'text-[var(--color-fg)]'}`}>
                      {slot.title}
                    </p>
                    <p className="text-[var(--color-fg-subtle)]">
                      {d.toLocaleDateString('en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
                      })}{' '}
                      at{' '}
                      {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                    </p>
                  </div>
                  {isCancelled ? (
                    <span className="text-[10px] text-[var(--color-fg-subtle)] bg-[var(--color-bg-input)] px-2 py-0.5 rounded">
                      Cancelled
                    </span>
                  ) : canSchedule && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(slot)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium
                                   text-violet-300 border border-violet-800 rounded px-2 py-1
                                   hover:bg-violet-950 transition-colors"
                      >
                        <PencilIcon className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          await cancelInterviewSlot(slot.id, candidateId)
                          handleCancelled(slot.id)
                        }}
                        className="text-[11px] font-medium text-red-400 border border-red-800
                                   rounded px-2 py-1 hover:bg-red-950 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Schedule / Edit modal */}
      {showModal && (
        <ScheduleInterviewModal
          candidateId={candidateId}
          candidateName={candidateName}
          roleId={roleId}
          allRoles={allRoles}
          onScheduled={handleScheduled}
          onClose={closeModal}
          hasGoogleCalendar={hasGoogleCalendar}
          hasMicrosoftCalendar={hasMicrosoftCalendar}
          editingSlot={editingSlot}
        />
      )}
    </>
  )
}
