'use client'

import { useState, useActionState } from 'react'
import { saveCustomerFramework, deleteCustomerFramework } from '@/actions/frameworks'
import type { FrameworkState } from '@/actions/frameworks'
import type { FrameworkLevel } from '@/db/schema/customer-frameworks'
import { Loader2, Plus, X, Pencil, Trash2 } from 'lucide-react'

interface Props {
  customerId: string
  existingFramework: {
    name: string
    description: string | null
    levels: FrameworkLevel[]
  } | null
  isAdmin: boolean
}

function generateId(code: string): string {
  return code.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function blankLevel(order: number): FrameworkLevel {
  return { id: '', code: '', title: '', description: '', order }
}

export function FrameworkEditor({ customerId, existingFramework, isAdmin }: Props) {
  const [isEditing, setIsEditing] = useState(existingFramework === null)
  const [name, setName] = useState(existingFramework?.name ?? '')
  const [description, setDescription] = useState(existingFramework?.description ?? '')
  const [levels, setLevels] = useState<FrameworkLevel[]>(
    existingFramework?.levels ?? []
  )
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const boundSave = saveCustomerFramework.bind(null, customerId)
  const [saveState, saveAction, savePending] = useActionState<FrameworkState | null, FormData>(
    boundSave,
    null
  )

  function addLevel() {
    setLevels((prev) => [...prev, blankLevel(prev.length)])
  }

  function removeLevel(index: number) {
    setLevels((prev) => prev.filter((_, i) => i !== index))
  }

  function updateLevel(index: number, field: keyof FrameworkLevel, value: string | number) {
    setLevels((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const updated = { ...l, [field]: value }
        // Auto-generate id from code when code changes
        if (field === 'code') {
          updated.id = generateId(value as string)
        }
        return updated
      })
    )
  }

  const sortedLevels = [...(existingFramework?.levels ?? [])].sort((a, b) => a.order - b.order)

  // View mode (framework exists and not editing)
  if (existingFramework && !isEditing) {
    return (
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-[var(--color-fg)]">{existingFramework.name}</h3>
            {existingFramework.description && (
              <p className="text-sm text-[var(--color-fg-muted)] mt-1">{existingFramework.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setName(existingFramework.name)
                setDescription(existingFramework.description ?? '')
                setLevels([...existingFramework.levels])
                setIsEditing(true)
              }}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-fg)] text-xs
                         font-medium px-3 py-1.5 hover:bg-[var(--color-bg-input)] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            {isAdmin && (
              <>
                {deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-fg-muted)]">Delete framework?</span>
                    <form action={deleteCustomerFramework.bind(null, customerId)}>
                      <button
                        type="submit"
                        className="text-xs text-red-400 hover:text-red-300 font-medium"
                      >
                        Confirm
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(false)}
                      className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-1.5 rounded-md border border-red-800 text-red-400 text-xs
                               font-medium px-3 py-1.5 hover:bg-red-950 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {sortedLevels.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide pb-2 pr-4">
                    Code
                  </th>
                  <th className="text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide pb-2 pr-4">
                    Title
                  </th>
                  <th className="text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide pb-2 pr-4">
                    Description
                  </th>
                  <th className="text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide pb-2">
                    Order
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-bg-input)]">
                {sortedLevels.map((level) => (
                  <tr key={level.id}>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center rounded-md bg-[var(--color-bg-input)] border border-[var(--color-border)]
                                       text-[var(--color-fg)] text-xs font-mono px-2 py-0.5">
                        {level.code}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--color-fg)] font-medium">{level.title}</td>
                    <td className="py-2.5 pr-4 text-[var(--color-fg-muted)] max-w-xs truncate">{level.description}</td>
                    <td className="py-2.5 text-[var(--color-fg-subtle)] text-xs">{level.order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // Edit / create mode
  return (
    <form
      action={(fd) => {
        fd.set('name', name)
        fd.set('description', description)
        fd.set('levels', JSON.stringify(levels))
        saveAction(fd)
      }}
      className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 space-y-5"
    >
      <h3 className="font-semibold text-[var(--color-fg)]">
        {existingFramework ? 'Edit framework' : 'Add hiring framework'}
      </h3>

      {saveState && !saveState.success && saveState.error && (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {saveState.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-[var(--color-fg)] mb-1">
          Framework name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HSBC GCB Framework"
          required
          disabled={savePending}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                     placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50"
        />
        {saveState?.fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-400">{saveState.fieldErrors.name[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--color-fg)] mb-1">
          Description <span className="text-[var(--color-fg-subtle)] font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={savePending}
          placeholder="Brief description of this grading framework…"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                     placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50 resize-none"
        />
      </div>

      {/* Levels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--color-fg)]">
            Band levels <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addLevel}
            disabled={savePending}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300
                       disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add level
          </button>
        </div>
        {saveState?.fieldErrors?.levels && (
          <p className="text-xs text-red-400">{saveState.fieldErrors.levels[0]}</p>
        )}

        {levels.length === 0 && (
          <p className="text-xs text-[var(--color-fg-subtle)] py-2">
            No levels yet. Click &quot;Add level&quot; to define band levels.
          </p>
        )}

        {levels.map((level, index) => (
          <div
            key={index}
            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr_4rem_2rem] gap-2 items-start
                       bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-3 py-3"
          >
            <div>
              <label className="block text-xs text-[var(--color-fg-subtle)] mb-1">Code</label>
              <input
                type="text"
                value={level.code}
                onChange={(e) => updateLevel(index, 'code', e.target.value)}
                placeholder="GCB 4"
                disabled={savePending}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] px-2 py-1.5
                           text-xs placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-fg-subtle)] mb-1">Title</label>
              <input
                type="text"
                value={level.title}
                onChange={(e) => updateLevel(index, 'title', e.target.value)}
                placeholder="Specialist"
                disabled={savePending}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] px-2 py-1.5
                           text-xs placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-fg-subtle)] mb-1">Description</label>
              <input
                type="text"
                value={level.description}
                onChange={(e) => updateLevel(index, 'description', e.target.value)}
                placeholder="VP equivalent, leads a team…"
                disabled={savePending}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] px-2 py-1.5
                           text-xs placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-fg-subtle)] mb-1">Order</label>
              <input
                type="number"
                value={level.order}
                onChange={(e) => updateLevel(index, 'order', parseInt(e.target.value, 10) || 0)}
                disabled={savePending}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] px-2 py-1.5
                           text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <button
                type="button"
                onClick={() => removeLevel(index)}
                disabled={savePending}
                className="text-[var(--color-fg-subtle)] hover:text-red-400 transition-colors disabled:opacity-50"
                title="Remove level"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={savePending}
          className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                     font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {savePending && <Loader2 className="h-4 w-4 animate-spin" />}
          {savePending ? 'Saving…' : 'Save framework'}
        </button>
        {existingFramework && (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={savePending}
            className="text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
