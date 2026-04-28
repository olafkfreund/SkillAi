'use client'

import { useState, useTransition } from 'react'
import { PencilIcon, Trash2Icon, CheckIcon, XIcon, PlusIcon } from 'lucide-react'
import { createNote, updateNote, deleteNote } from '@/actions/notes'

export type NoteItem = {
  id: string
  body: string
  authorId: string
  createdAt: string
  updatedAt: string | null
  isEdited: boolean
  isShareable?: boolean
}

type Props = {
  candidateId: string
  currentUserId: string
  canEdit: boolean
  initialNotes: NoteItem[]
  audience?: 'recruiter' | 'customer' | 'manager'
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function NotesPanel({ candidateId, currentUserId, canEdit, initialNotes, audience = 'recruiter' }: Props) {
  const isManagerView = audience === 'manager'

  // Newest first; manager sees only shareable notes
  const filteredInitial = isManagerView
    ? initialNotes.filter((n) => n.isShareable)
    : initialNotes

  const [notesList, setNotesList] = useState<NoteItem[]>(
    [...filteredInitial].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  )

  const [newBody, setNewBody] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [isAdding, startAdd] = useTransition()

  // Per-note UI state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditing, startEdit] = useTransition()

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  // ---------------------------------------------------------------------------
  // Add note
  // ---------------------------------------------------------------------------
  function handleAdd() {
    if (!newBody.trim()) {
      setAddError('Note cannot be empty')
      return
    }
    setAddError(null)

    startAdd(async () => {
      const result = await createNote(candidateId, newBody.trim())
      if (!result.success) {
        setAddError(result.error)
        return
      }
      // Optimistic: prepend a temporary note — revalidation will replace it
      const optimistic: NoteItem = {
        id: `temp-${Date.now()}`,
        body: newBody.trim(),
        authorId: currentUserId,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        isEdited: false,
      }
      setNotesList((prev) => [optimistic, ...prev])
      setNewBody('')
    })
  }

  // ---------------------------------------------------------------------------
  // Edit note
  // ---------------------------------------------------------------------------
  function startEditing(note: NoteItem) {
    setEditingId(note.id)
    setEditBody(note.body)
    setEditError(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditBody('')
    setEditError(null)
  }

  function handleSaveEdit(noteId: string) {
    if (!editBody.trim()) {
      setEditError('Note cannot be empty')
      return
    }
    setEditError(null)

    startEdit(async () => {
      const result = await updateNote(noteId, candidateId, editBody.trim())
      if (!result.success) {
        setEditError(result.error)
        return
      }
      setNotesList((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, body: editBody.trim(), updatedAt: new Date().toISOString(), isEdited: true }
            : n
        )
      )
      setEditingId(null)
      setEditBody('')
    })
  }

  // ---------------------------------------------------------------------------
  // Delete note
  // ---------------------------------------------------------------------------
  function handleDelete(noteId: string) {
    setDeleteError(null)

    startDelete(async () => {
      const result = await deleteNote(noteId, candidateId)
      if (!result.success) {
        setDeleteError(result.error)
        setConfirmDeleteId(null)
        return
      }
      setNotesList((prev) => prev.filter((n) => n.id !== noteId))
      setConfirmDeleteId(null)
    })
  }

  const canModifyNote = (note: NoteItem) =>
    canEdit || note.authorId === currentUserId

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="font-semibold text-zinc-100 mb-4">
        Notes ({notesList.length})
      </h2>

      {/* Add note textarea */}
      {canEdit && !isManagerView && (
        <div className="mb-5">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Add a note…"
            rows={3}
            disabled={isAdding}
            className="w-full rounded-md bg-zinc-800 border border-zinc-700
                       text-sm text-zinc-200 placeholder-zinc-500 px-3 py-2
                       focus:outline-none focus:ring-1 focus:ring-violet-600
                       resize-none disabled:opacity-50"
          />
          {addError && (
            <p className="text-xs text-red-400 mt-1">{addError}</p>
          )}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600
                         hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5
                         transition-colors disabled:opacity-50"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {isAdding ? 'Adding…' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {notesList.length === 0 ? (
        <p className="text-sm text-zinc-500">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notesList.map((note) => (
            <div
              key={note.id}
              className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-3"
            >
              {editingId === note.id ? (
                /* Inline edit mode */
                <div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    disabled={isEditing}
                    className="w-full rounded-md bg-zinc-900 border border-zinc-600
                               text-sm text-zinc-200 px-3 py-2
                               focus:outline-none focus:ring-1 focus:ring-violet-600
                               resize-none disabled:opacity-50"
                  />
                  {editError && (
                    <p className="text-xs text-red-400 mt-1">{editError}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(note.id)}
                      disabled={isEditing}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-600
                                 hover:bg-violet-500 text-white text-xs font-medium px-2.5 py-1.5
                                 transition-colors disabled:opacity-50"
                    >
                      <CheckIcon className="h-3 w-3" />
                      {isEditing ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={isEditing}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-600
                                 text-zinc-400 hover:text-zinc-200 text-xs font-medium px-2.5 py-1.5
                                 transition-colors disabled:opacity-50"
                    >
                      <XIcon className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{note.body}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-zinc-500">
                      {formatTimestamp(note.createdAt)}
                      {note.isEdited && (
                        <span className="ml-1.5 text-zinc-600">(edited)</span>
                      )}
                    </p>

                    {canModifyNote(note) && (
                      <div className="flex items-center gap-1.5">
                        {confirmDeleteId === note.id ? (
                          /* Inline delete confirmation */
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-red-400">Delete this note?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(note.id)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 rounded-md bg-red-800
                                         hover:bg-red-700 text-red-100 text-xs font-medium px-2 py-1
                                         transition-colors disabled:opacity-50"
                            >
                              <CheckIcon className="h-3 w-3" />
                              {isDeleting ? 'Deleting…' : 'Yes'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-600
                                         text-zinc-400 hover:text-zinc-200 text-xs font-medium px-2 py-1
                                         transition-colors disabled:opacity-50"
                            >
                              <XIcon className="h-3 w-3" />
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(note)}
                              aria-label="Edit note"
                              className="rounded p-1 text-zinc-500 hover:text-zinc-200
                                         hover:bg-zinc-700 transition-colors"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(note.id)}
                              aria-label="Delete note"
                              className="rounded p-1 text-zinc-500 hover:text-red-400
                                         hover:bg-zinc-700 transition-colors"
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Per-note delete error */}
                  {deleteError && confirmDeleteId !== note.id && (
                    <p className="text-xs text-red-400 mt-1">{deleteError}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Global delete error (shown outside confirmation flow) */}
      {deleteError && !confirmDeleteId && (
        <p className="text-xs text-red-400 mt-3">{deleteError}</p>
      )}
    </div>
  )
}
