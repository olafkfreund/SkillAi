import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateSubmissionStatusByToken } from '@/actions/role-submissions'
import type { SubmissionStatus } from '@/db/schema/role-submissions'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  // Validated downstream against the customer-allowed whitelist inside the action.
  status: z.string().min(1),
  notes: z.string().max(2000).optional(),
  customerName: z.string().max(200).optional(),
  customerEmail: z.string().email().max(320).optional().or(z.literal('')),
})

// ---------------------------------------------------------------------------
// POST /api/share/submission/[token]/update
//
// WHY A ROUTE HANDLER:
//   Server actions invoked from client components do not have access to the
//   HTTP request headers (req.ip, user-agent). A route handler does. This thin
//   wrapper extracts the IP + user-agent from request headers, parses + validates
//   the body, and delegates to updateSubmissionStatusByToken. The result is
//   returned as JSON so the client UpdateForm can branch on status codes.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── Parse body ─────────────────────────────────────────────────────────────
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 }
    )
  }

  // ── Extract IP + user-agent ─────────────────────────────────────────────────
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  // ── Delegate to the server action ──────────────────────────────────────────
  const result = await updateSubmissionStatusByToken(
    token,
    parsed.data.status as SubmissionStatus,
    {
      notes: parsed.data.notes,
      customerName: parsed.data.customerName,
      // Normalise empty string → undefined so the action receives clean optional
      customerEmail: parsed.data.customerEmail || undefined,
      ipAddress,
      userAgent,
    }
  )

  if (!result.success) {
    // Map rate-limit errors to 429 so the client UpdateForm can render the
    // "too many updates" message distinctly from generic 400 errors.
    const errorLower = result.error.toLowerCase()
    if (errorLower.includes('too many')) {
      return NextResponse.json({ error: result.error }, { status: 429 })
    }
    if (errorLower.includes('not found') || errorLower.includes('revoked')) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(result.data, { status: 200 })
}
