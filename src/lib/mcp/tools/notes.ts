/**
 * Note MCP tools — create / update / delete candidate notes. All three
 * delegate to the canonical actions in `src/actions/notes.ts` which enforce
 * "author or admin" edit rules.
 */

import { z } from 'zod'
import { createNote, updateNote, deleteNote } from '@/actions/notes'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const CreateNoteInput = {
  candidateId: z.string().uuid(),
  body: z.string().min(1).max(5000),
  confirmed: z.literal(true),
}

export const UpdateNoteInput = {
  noteId: z.string().uuid(),
  candidateId: z.string().uuid(),
  body: z.string().min(1).max(5000),
  confirmed: z.literal(true),
}

export const DeleteNoteInput = {
  noteId: z.string().uuid(),
  candidateId: z.string().uuid(),
  confirmed: z.literal(true),
}

export function registerNoteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_note',
    {
      title: 'Create candidate note',
      description:
        'Add a timestamped note to a candidate. Body is plain text up to 5000 chars. The note ' +
        'is attributed to the calling user. Requires write scope and confirmed: true.',
      inputSchema: CreateNoteInput,
    },
    async (args) =>
      runTool(ctx, 'create_note', 'write', true, args, async () => {
        const result = await createNote(args.candidateId, args.body)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )

  server.registerTool(
    'update_note',
    {
      title: 'Update candidate note',
      description:
        'Edit the body of an existing note. Only the original author or an admin may edit. ' +
        'Sets isEdited=true. Requires write scope and confirmed: true.',
      inputSchema: UpdateNoteInput,
    },
    async (args) =>
      runTool(ctx, 'update_note', 'write', true, args, async () => {
        const result = await updateNote(args.noteId, args.candidateId, args.body)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )

  server.registerTool(
    'delete_note',
    {
      title: 'Delete candidate note',
      description:
        'Permanently delete a note. Only the original author or an admin may delete. ' +
        'Requires write scope and confirmed: true.',
      inputSchema: DeleteNoteInput,
    },
    async (args) =>
      runTool(ctx, 'delete_note', 'write', true, args, async () => {
        const result = await deleteNote(args.noteId, args.candidateId)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )
}
