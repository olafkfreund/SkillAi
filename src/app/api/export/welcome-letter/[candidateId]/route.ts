import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, roles, tenants } from '@/db/schema'
import { hasRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'
import { SUPPORTED_LANGUAGES } from '@/lib/ai/language'
import { INTERVIEW_TYPES } from '@/lib/ai/welcome-letter-schemas'
import { generateWelcomeLetter } from '@/lib/ai/welcome-letter'
import { WelcomeLetterPDF } from '@/lib/pdf/welcome-letter-pdf'
import { getOrExtractCvProfile } from '@/lib/ai/cv-profile'
import { writeAuditLog } from '@/lib/audit'

// AI + PDF generation can take up to 60s on first call (cache miss + extraction)
export const maxDuration = 60

const QuerySchema = z.object({
  lang: z.enum(SUPPORTED_LANGUAGES),
  type: z.enum(INTERVIEW_TYPES),
  roleId: z.string().uuid().optional(),
})

/** ASCII-safe slug for Content-Disposition filename. */
function slugify(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'candidate'
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const userRole = (session.user as { role?: UserRole }).role

  // Welcome letter is recruiter-only — hiring managers and viewers are blocked
  if (!userRole || !hasRole(userRole, 'recruiter')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { candidateId } = await params
  const { searchParams } = new URL(req.url)

  const parsed = QuerySchema.safeParse({
    lang: searchParams.get('lang') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    roleId: searchParams.get('roleId') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { lang, type: interviewType, roleId } = parsed.data

  try {
    // Fetch candidate + optional role inside one RLS context
    const { candidate, role } = await withTenant(tenantId, async (tx) => {
      const [c] = await tx
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
        .limit(1)

      if (!c) return { candidate: null, role: null }

      const r = roleId
        ? await tx
            .select()
            .from(roles)
            .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : null

      return { candidate: c, role: r }
    })

    if (!candidate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Fetch tenant name for branding (tenants table has no RLS, accessed via db directly)
    const tenantName = await withTenant(tenantId, async (tx) =>
      tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
        .then((rows) => rows[0]?.name ?? '')
    )

    // CV profile — cached on first call, extracted fresh if absent
    const cvProfile = candidate.cvText
      ? await getOrExtractCvProfile(candidateId, tenantId, candidate.cvText)
      : null

    const cvProfileArg = cvProfile
      ? {
          summary: cvProfile.summary ?? '',
          technicalSkills: cvProfile.technical_skills ?? [],
          experienceLevel: cvProfile.experience_level ?? null,
        }
      : null

    // roles.requirements is a single text blob (not an array).
    // Wrap it in a single-element array so the generator's string[].map() works.
    const roleArg = role
      ? {
          id: role.id,
          title: role.title,
          description: role.description,
          requirements: role.requirements ? [role.requirements] : null,
          priorityKeywords: role.priorityKeywords.length > 0 ? role.priorityKeywords : null,
        }
      : null

    const letter = await generateWelcomeLetter({
      candidate: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        experienceLevel: null,
      },
      role: roleArg,
      cvProfile: cvProfileArg,
      language: lang,
      interviewType,
      tenantName,
      tenantId,
      userId: session.user.id,
    })

    const candidateFullName = `${candidate.firstName} ${candidate.lastName}`.trim()

    const buffer = await renderToBuffer(
      React.createElement(WelcomeLetterPDF, {
        letter,
        candidateFullName,
        roleTitle: role?.title ?? null,
        tenantName,
        language: lang,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // Fire-and-forget audit log — never blocks the response
    writeAuditLog(tenantId, {
      action: 'candidate.welcome_letter_generated',
      entityType: 'candidate',
      entityId: candidateId,
      entityLabel: candidateFullName,
      metadata: { language: lang, interviewType, roleId: roleId ?? null },
    }).catch(() => { /* audit failures must not break the download */ })

    const slug = slugify(candidate.firstName)
    const filename = `welcome-letter-${slug}-${lang}.pdf`

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[welcome-letter-export] generation failed:', err instanceof Error ? err.stack : err)
    return NextResponse.json(
      { error: 'Generation failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
