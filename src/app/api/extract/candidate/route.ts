/**
 * POST /api/extract/candidate
 *
 * Accepts a CV file (multipart/form-data, field: "file"),
 * parses it, calls Claude to extract candidate details,
 * returns structured JSON.
 *
 * Response: { firstName, lastName, email, phone, linkedin, summary }
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { parseFile } from '@/lib/parsers'
import type { FileType } from '@/lib/parsers'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_candidate_details',
  description: 'Extract structured candidate details from a CV or resume',
  input_schema: {
    type: 'object' as const,
    properties: {
      firstName: { type: 'string', description: "Candidate's first name" },
      lastName: { type: 'string', description: "Candidate's last name or family name" },
      email: { type: 'string', description: "Candidate's email address, if present" },
      phone: { type: 'string', description: "Candidate's phone number, if present" },
      linkedin: { type: 'string', description: "Candidate's LinkedIn URL or handle, if present" },
      currentTitle: { type: 'string', description: "Current or most recent job title" },
      summary: {
        type: 'string',
        description: 'A 2-3 sentence professional summary derived from the CV content',
      },
    },
    required: ['firstName', 'lastName'],
  },
}

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}

const EXT_MAP: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'txt',
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Resolve file type
    let fileType = ACCEPTED_TYPES[file.type]
    if (!fileType) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      fileType = EXT_MAP[ext]
    }
    if (!fileType) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await parseFile(buffer, fileType)

    if (!text || text.length < 20) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey.startsWith('sk-ant-placeholder')) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured — add a real key to .env.local' },
        { status: 503 }
      )
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: `Extract the candidate's details from the following CV text. Only extract information that is explicitly present — do not guess or invent details.\n\n<cv>\n${text.slice(0, 8000)}\n</cv>`,
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
    }

    return NextResponse.json(toolUse.input)
  } catch (err) {
    console.error('[extract/candidate]', err)
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
