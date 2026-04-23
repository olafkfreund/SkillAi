/**
 * POST /api/extract/role
 *
 * Accepts a job description document (multipart/form-data, field: "file"),
 * parses it, calls Claude to extract role fields,
 * returns structured JSON.
 *
 * Response: { title, description, requirements }
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { parseFile } from '@/lib/parsers'
import { auth } from '@/lib/auth'
import type { FileType } from '@/lib/parsers'
import { resolveAnthropicKey } from '@/lib/ai/keys'

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_role_details',
  description: 'Extract structured job role details from a job description document',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'The job title or role name (e.g. "Senior Software Engineer")',
      },
      description: {
        type: 'string',
        description:
          'A clear description of the role, responsibilities, and context. 2-5 sentences.',
      },
      requirements: {
        type: 'string',
        description:
          'A newline-separated list of key requirements, skills, and qualifications for the role. Each requirement on its own line.',
      },
    },
    required: ['title', 'description', 'requirements'],
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
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

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

    if (!text || text.length < 10) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 })
    }

    let apiKey: string
    try {
      apiKey = await resolveAnthropicKey(tenantId)
    } catch {
      // Fallback: return raw text in description so the user can still edit it
      const firstLine = text.split('\n').find((l) => l.trim().length > 3)?.trim() ?? ''
      return NextResponse.json({
        title: firstLine.slice(0, 120),
        description: text.slice(0, 1000),
        requirements: text.slice(1000, 3000),
        _warning: 'Anthropic API key not configured — raw text returned, please edit fields.',
      })
    }

    const anthropic = new Anthropic({ apiKey, maxRetries: 3 })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: `Extract the job role details from the following job description document. Produce a clean, well-structured output suitable for a recruiting portal.\n\n<document>\n${text.slice(0, 8000)}\n</document>`,
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json({ error: 'Extraction failed — Claude did not return structured data' }, { status: 500 })
    }

    return NextResponse.json(toolUse.input)
  } catch (err) {
    console.error('[extract/role]', err)
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
