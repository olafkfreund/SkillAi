'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { eq, and, inArray, or, ilike, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, withTenant } from '@/db'
import { candidates, scores, agencies } from '@/db/schema'
import { ParseError } from '@/lib/parsers'
import { triggerScoring } from '@/lib/ai/scoring'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { emitAudit } from '@/lib/audit-middleware'
import { getActionContext } from '@/lib/auth/action-context'
import { validateCvFile, parseCvBuffer, persistCvFile } from '@/lib/cv/store'
import { ensureInternalAgency } from '@/lib/tenants/ensure-internal-agency'
import type { CandidateStatus, AvailabilityStatus } from '@/db/schema/candidates'

const CreateCandidateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().optional(),
  roleId: z.string().uuid(),
  country: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  languagesSpoken: z.string().optional().or(z.literal('')),
  willingToRelocate: z.enum(['true', 'false', '']).optional(),
  candidateRate: z.coerce.number().min(0).optional().or(z.literal('')),
  customerRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).toUpperCase().optional().or(z.literal('')),
}).refine(
  (data) => {
    const hasRate = (typeof data.candidateRate === 'number') || (typeof data.customerRate === 'number')
    if (hasRate && (!data.rateCurrency || data.rateCurrency === '')) return false
    return true
  },
  { message: 'Currency is required when a rate is set', path: ['rateCurrency'] }
)

export type CreateCandidateState =
  | { success: true; candidateId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createCandidate(
  _prev: CreateCandidateState | null,
  formData: FormData
): Promise<CreateCandidateState> {
  // -- Auth context from middleware headers --
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  if (userRole === 'viewer') {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // -- Validate form fields --
  const parsed = CreateCandidateSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email') || undefined,
    phone: formData.get('phone') || undefined,
    agencyId: formData.get('agencyId') || undefined,
    roleId: formData.get('roleId'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // -- Validate uploaded file --
  const file = formData.get('cvFile') as File | null
  if (!file || file.size === 0) {
    return { success: false, error: 'CV file is required' }
  }

  const validated = await validateCvFile(file)
  if (!validated.ok) {
    return { success: false, error: validated.error }
  }
  const { fileType, buffer } = validated

  // -- Parse CV text --
  let cvText: string
  try {
    ;({ cvText } = await parseCvBuffer(buffer, fileType))
  } catch (err) {
    if (err instanceof ParseError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: 'Failed to extract text from CV' }
  }

  // -- Store file on disk --
  const { filePath } = await persistCvFile(tenantId, buffer, fileType)

  // -- Insert candidate + pending score within tenant RLS context --
  const candidateId = randomUUID()

  await withTenant(tenantId, async (tx) => {
    await tx.insert(candidates).values({
      id: candidateId,
      tenantId,
      agencyId: parsed.data.agencyId ?? null,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      cvText,
      filePath,
      fileType,
      country: parsed.data.country || null,
      city: parsed.data.city || null,
      languagesSpoken: parsed.data.languagesSpoken
        ? parsed.data.languagesSpoken.split(',').map((l) => l.trim()).filter(Boolean)
        : [],
      willingToRelocate: parsed.data.willingToRelocate === 'true' ? true : parsed.data.willingToRelocate === 'false' ? false : null,
      candidateRate: typeof parsed.data.candidateRate === 'number' ? String(parsed.data.candidateRate) : null,
      customerRate: typeof parsed.data.customerRate === 'number' ? String(parsed.data.customerRate) : null,
      rateCurrency: parsed.data.rateCurrency || null,
    })

    await tx.insert(scores).values({
      tenantId,
      candidateId,
      roleId: parsed.data.roleId,
      scoreStatus: 'pending',
    })
  })

  // Audit: candidate created
  await writeAuditLog(tenantId, {
    action: 'candidate.created',
    entityType: 'candidate',
    entityId: candidateId,
    entityLabel: `${parsed.data.firstName} ${parsed.data.lastName}`,
  })

  // Fire-and-forget scoring (non-blocking)
  triggerScoring(candidateId, parsed.data.roleId, tenantId).catch(console.error)

  // Fire-and-forget embedding generation (non-blocking, after response is sent)
  after(async () => {
    try {
      const { generateEmbedding } = await import('@/lib/ai/embeddings')
      const embedding = await generateEmbedding(cvText, tenantId)
      if (embedding) {
        await withTenant(tenantId, async (tx) => {
          await tx.update(candidates).set({ embedding: JSON.stringify(embedding) }).where(eq(candidates.id, candidateId))
        })
      }
    } catch (err) {
      console.error('[embedding] Failed to generate embedding for candidate:', candidateId, err)
    }

    // CV profile extraction — parallel with embedding
    try {
      const { triggerCvProfileExtraction } = await import('@/lib/ai/cv-profile')
      await triggerCvProfileExtraction(candidateId, tenantId)
    } catch (err) {
      console.error('[cv-profile] Failed to extract for candidate:', candidateId, err)
    }
  })

  return { success: true, candidateId }
}

// ---------------------------------------------------------------------------
// updateCandidateStatus — move candidate through the hiring pipeline
// ---------------------------------------------------------------------------

export { type CandidateStatus }

export async function updateCandidateStatus(
  candidateId: string,
  status: CandidateStatus
): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ status })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  // Audit: status changed
  await writeAuditLog(tenantId, {
    action: 'candidate.status_changed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { newStatus: status },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
}

// ---------------------------------------------------------------------------
// updateSynechronCandidateId — set/clear the SYNE-#### tracking ID
// ---------------------------------------------------------------------------

export async function updateSynechronCandidateId(
  candidateId: string,
  rawValue: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { ok: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Validate: trim, allow empty, max 64 chars, regex ^[A-Za-z0-9-]*$
  const trimmed = (rawValue ?? '').trim()
  if (trimmed.length > 64) {
    return { ok: false, error: 'Synechron ID must be 64 characters or fewer.' }
  }
  if (trimmed && !/^[A-Za-z0-9-]+$/.test(trimmed)) {
    return { ok: false, error: 'Only letters, digits, and hyphens are allowed.' }
  }

  const value = trimmed || null

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ synechronCandidateId: value })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  revalidatePath('/dashboard/candidates')

  return { ok: true }
}

// ---------------------------------------------------------------------------
// bulkUpdateCandidateStatus — update status for multiple candidates at once
// ---------------------------------------------------------------------------

const VALID_STATUSES: CandidateStatus[] = [
  'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected',
]

export async function bulkUpdateCandidateStatus(
  candidateIds: string[],
  status: CandidateStatus
): Promise<{ success: boolean; updated: number; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, updated: 0, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, updated: 0, error: 'Forbidden: recruiters and admins only' }
  }

  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return { success: false, updated: 0, error: 'No candidates selected' }
  }

  if (candidateIds.length > 200) {
    return { success: false, updated: 0, error: 'Cannot update more than 200 candidates at once' }
  }

  if (!VALID_STATUSES.includes(status)) {
    return { success: false, updated: 0, error: `Invalid status: ${status}` }
  }

  const result = await withTenant(tenantId, async (tx) => {
    const updated = await tx
      .update(candidates)
      .set({ status })
      .where(
        and(
          inArray(candidates.id, candidateIds),
          eq(candidates.tenantId, tenantId)
        )
      )
      .returning({ id: candidates.id })

    return updated.length
  })

  revalidatePath('/dashboard/candidates')
  return { success: true, updated: result }
}

// ---------------------------------------------------------------------------
// updateCandidateDetails — edit name / contact info for a candidate
// ---------------------------------------------------------------------------

// EU/UK right-to-work + compliance values accepted on the candidate edit form.
// Mirrors the pgEnum variants in src/db/schema/candidates.ts.
const RTW_STATUS_VALUES = [
  'checked', 'pending', 'fail', 'exempted', 'not_required',
] as const
const RTW_DOC_TYPE_VALUES = [
  'passport_uk', 'passport_eu', 'passport_other', 'brp', 'share_code',
  'visa', 'settled_status', 'presettled_status', 'other',
] as const
const GDPR_CONSENT_BY_VALUES = ['candidate', 'recruiter', 'agency'] as const

// Names of compliance fields persisted by updateCandidateDetails. Used to
// detect "any compliance field changed" for the audit metadata and to drive
// the rtw_verified transition check.
const COMPLIANCE_FIELDS = [
  'rightToWorkStatus',
  'rightToWorkDocumentType',
  'rightToWorkExpiry',
  'shareCode',
  'sponsorshipRequired',
  'nationality',
  'noticePeriodDays',
  'gdprProcessingConsentBy',
] as const
type ComplianceField = (typeof COMPLIANCE_FIELDS)[number]

const UpdateCandidateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().nullable().optional(),
  country: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  languagesSpoken: z.string().optional().or(z.literal('')),
  willingToRelocate: z.enum(['true', 'false', '']).optional(),
  candidateRate: z.coerce.number().min(0).optional().or(z.literal('')),
  customerRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).toUpperCase().optional().or(z.literal('')),
  availabilityStatus: z.enum(['available', 'on_project', 'unavailable']).optional(),
  availableFrom: z.string().optional().or(z.literal('')),

  // Compliance fields (Epic #190 / issue #194). All optional — only persisted
  // when present in the FormData. Empty strings are treated as "clear".
  rightToWorkStatus: z.enum(RTW_STATUS_VALUES).optional().or(z.literal('')),
  rightToWorkDocumentType: z.enum(RTW_DOC_TYPE_VALUES).optional().or(z.literal('')),
  rightToWorkExpiry: z.string().optional().or(z.literal('')),
  shareCode: z.string().max(20).optional().or(z.literal('')),
  sponsorshipRequired: z.enum(['true', 'false', '']).optional(),
  nationality: z.string().max(100).optional().or(z.literal('')),
  noticePeriodDays: z.coerce.number().int().min(0).optional().or(z.literal('')),
  gdprProcessingConsentBy: z.enum(GDPR_CONSENT_BY_VALUES).optional().or(z.literal('')),
})

export type UpdateCandidateState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function updateCandidateDetails(
  candidateId: string,
  _prev: UpdateCandidateState | null,
  formData: FormData
): Promise<UpdateCandidateState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const rawAgencyId = formData.get('agencyId')
  // Compliance fields use formData.has() so that "field absent" (no form
  // section rendered) is distinguishable from "field present and empty"
  // (explicit clear). Used below to decide whether to write the column.
  const parsed = UpdateCandidateSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email') || undefined,
    phone: formData.get('phone') || undefined,
    agencyId: rawAgencyId === '' || rawAgencyId === null ? null : rawAgencyId,
    country: formData.get('country') || undefined,
    city: formData.get('city') || undefined,
    languagesSpoken: formData.get('languagesSpoken') || undefined,
    willingToRelocate: formData.get('willingToRelocate') || undefined,
    candidateRate: formData.get('candidateRate') || undefined,
    customerRate: formData.get('customerRate') || undefined,
    rateCurrency: formData.get('rateCurrency') || undefined,
    availabilityStatus: formData.get('availabilityStatus') || undefined,
    availableFrom: formData.get('availableFrom') || undefined,
    rightToWorkStatus: formData.get('rightToWorkStatus') || undefined,
    rightToWorkDocumentType: formData.get('rightToWorkDocumentType') || undefined,
    rightToWorkExpiry: formData.get('rightToWorkExpiry') || undefined,
    shareCode: formData.get('shareCode') || undefined,
    sponsorshipRequired: formData.get('sponsorshipRequired') || undefined,
    nationality: formData.get('nationality') || undefined,
    noticePeriodDays: formData.get('noticePeriodDays') || undefined,
    gdprProcessingConsentBy: formData.get('gdprProcessingConsentBy') || undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // Normalise availability: if not "on_project", null out availableFrom
  const availability = parsed.data.availabilityStatus
  const availabilityUpdate = availability
    ? {
        availabilityStatus: availability,
        availableFrom:
          availability === 'on_project' && parsed.data.availableFrom
            ? parsed.data.availableFrom
            : null,
      }
    : {}

  // ── Compliance: build the update partial + detect transitions ──────────────
  //
  // For each compliance field, only write it if the form actually carried the
  // key. "Field absent" (e.g. an old form without the compliance section)
  // should NOT clobber existing values to null. "Field present and empty"
  // (the user actively cleared the input) is interpreted as a clear and
  // persisted as null.
  const has = (k: string) => formData.has(k)
  const compliancePresent =
    has('rightToWorkStatus') ||
    has('rightToWorkDocumentType') ||
    has('rightToWorkExpiry') ||
    has('shareCode') ||
    has('sponsorshipRequired') ||
    has('nationality') ||
    has('noticePeriodDays') ||
    has('gdprProcessingConsentBy')

  // Build candidate update + diff metadata, reading the existing row first
  // so we can detect transitions (rtw → 'checked', gdpr_consent_by first set).
  type ComplianceUpdate = Partial<{
    rightToWorkStatus: 'checked' | 'pending' | 'fail' | 'exempted' | 'not_required' | null
    rightToWorkDocumentType:
      | 'passport_uk' | 'passport_eu' | 'passport_other' | 'brp' | 'share_code'
      | 'visa' | 'settled_status' | 'presettled_status' | 'other' | null
    rightToWorkExpiry: string | null
    rightToWorkCheckedAt: Date | null
    rightToWorkCheckedBy: string | null
    shareCode: string | null
    sponsorshipRequired: boolean
    nationality: string | null
    noticePeriodDays: number | null
    gdprProcessingConsentAt: Date | null
    gdprProcessingConsentBy: 'candidate' | 'recruiter' | 'agency' | null
  }>

  const complianceUpdate: ComplianceUpdate = {}
  let rtwTransitionedToChecked = false
  let fieldsChanged: ComplianceField[] = []

  if (compliancePresent) {
    const previous = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          rightToWorkStatus: candidates.rightToWorkStatus,
          rightToWorkDocumentType: candidates.rightToWorkDocumentType,
          rightToWorkExpiry: candidates.rightToWorkExpiry,
          rightToWorkCheckedAt: candidates.rightToWorkCheckedAt,
          rightToWorkCheckedBy: candidates.rightToWorkCheckedBy,
          shareCode: candidates.shareCode,
          sponsorshipRequired: candidates.sponsorshipRequired,
          nationality: candidates.nationality,
          noticePeriodDays: candidates.noticePeriodDays,
          gdprProcessingConsentAt: candidates.gdprProcessingConsentAt,
          gdprProcessingConsentBy: candidates.gdprProcessingConsentBy,
        })
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
        .limit(1)
    )

    const prev = previous[0] ?? null

    // Resolve next values for each compliance field, only when present.
    const nextRtwStatus = has('rightToWorkStatus')
      ? (parsed.data.rightToWorkStatus || null)
      : undefined
    const nextRtwDoc = has('rightToWorkDocumentType')
      ? (parsed.data.rightToWorkDocumentType || null)
      : undefined
    const nextRtwExpiry = has('rightToWorkExpiry')
      ? (parsed.data.rightToWorkExpiry || null)
      : undefined
    const nextShareCode = has('shareCode')
      ? (parsed.data.shareCode || null)
      : undefined
    const nextSponsorshipRequired = has('sponsorshipRequired')
      ? (parsed.data.sponsorshipRequired === 'true')
      : undefined
    const nextNationality = has('nationality')
      ? (parsed.data.nationality || null)
      : undefined
    const nextNoticePeriodDays = has('noticePeriodDays')
      ? (typeof parsed.data.noticePeriodDays === 'number'
          ? parsed.data.noticePeriodDays
          : null)
      : undefined
    const nextGdprConsentBy = has('gdprProcessingConsentBy')
      ? (parsed.data.gdprProcessingConsentBy || null)
      : undefined

    // Stamp into the update only if the field is being touched.
    if (nextRtwStatus !== undefined) complianceUpdate.rightToWorkStatus = nextRtwStatus as ComplianceUpdate['rightToWorkStatus']
    if (nextRtwDoc !== undefined) complianceUpdate.rightToWorkDocumentType = nextRtwDoc as ComplianceUpdate['rightToWorkDocumentType']
    if (nextRtwExpiry !== undefined) complianceUpdate.rightToWorkExpiry = nextRtwExpiry
    if (nextShareCode !== undefined) complianceUpdate.shareCode = nextShareCode
    if (nextSponsorshipRequired !== undefined) complianceUpdate.sponsorshipRequired = nextSponsorshipRequired
    if (nextNationality !== undefined) complianceUpdate.nationality = nextNationality
    if (nextNoticePeriodDays !== undefined) complianceUpdate.noticePeriodDays = nextNoticePeriodDays
    if (nextGdprConsentBy !== undefined) complianceUpdate.gdprProcessingConsentBy = nextGdprConsentBy as ComplianceUpdate['gdprProcessingConsentBy']

    // ── Transition: rtw status -> 'checked'
    //   Auto-stamp rightToWorkCheckedAt + rightToWorkCheckedBy.
    //   Only on TRANSITION (prev !== 'checked' && next === 'checked') —
    //   re-saving an already-checked status is a no-op so the original
    //   verification timestamp + actor are preserved.
    if (
      nextRtwStatus === 'checked' &&
      prev?.rightToWorkStatus !== 'checked'
    ) {
      complianceUpdate.rightToWorkCheckedAt = new Date()
      complianceUpdate.rightToWorkCheckedBy = userId || null
      rtwTransitionedToChecked = true
    }

    // ── Transition: gdpr_processing_consent_by first set
    //   Auto-stamp gdpr_processing_consent_at iff prev was null and next is
    //   a real value. If consent was already recorded, the original
    //   timestamp is preserved (we don't reset it on edits to other fields
    //   or re-saves of the same consent_by value).
    if (
      nextGdprConsentBy &&
      prev?.gdprProcessingConsentBy == null
    ) {
      complianceUpdate.gdprProcessingConsentAt = new Date()
    }

    // ── Diff: which compliance fields actually changed?
    //   `sponsorshipRequired` is NOT NULL with default false; everything
    //   else is nullable. Compare against the previous value in a
    //   coerced-equal way so undefined-vs-null and number/string are fine.
    const changed: ComplianceField[] = []
    const fieldPairs: Array<[ComplianceField, unknown, unknown]> = [
      ['rightToWorkStatus', nextRtwStatus, prev?.rightToWorkStatus ?? null],
      ['rightToWorkDocumentType', nextRtwDoc, prev?.rightToWorkDocumentType ?? null],
      ['rightToWorkExpiry', nextRtwExpiry, prev?.rightToWorkExpiry ?? null],
      ['shareCode', nextShareCode, prev?.shareCode ?? null],
      ['sponsorshipRequired', nextSponsorshipRequired, prev?.sponsorshipRequired ?? false],
      ['nationality', nextNationality, prev?.nationality ?? null],
      ['noticePeriodDays', nextNoticePeriodDays, prev?.noticePeriodDays ?? null],
      ['gdprProcessingConsentBy', nextGdprConsentBy, prev?.gdprProcessingConsentBy ?? null],
    ]
    for (const [field, next, was] of fieldPairs) {
      if (next === undefined) continue          // field not touched on this form
      // Strict-equal handles enums, booleans, and string compares. Numbers
      // come back as numeric or null from Drizzle; coerce both sides via JSON
      // shape to keep the comparison robust.
      if (next !== was) changed.push(field)
    }
    fieldsChanged = changed
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        ...(parsed.data.agencyId !== undefined ? { agencyId: parsed.data.agencyId } : {}),
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        languagesSpoken: parsed.data.languagesSpoken
          ? parsed.data.languagesSpoken.split(',').map((l) => l.trim()).filter(Boolean)
          : [],
        willingToRelocate: parsed.data.willingToRelocate === 'true' ? true : parsed.data.willingToRelocate === 'false' ? false : null,
        candidateRate: typeof parsed.data.candidateRate === 'number' ? String(parsed.data.candidateRate) : null,
        customerRate: typeof parsed.data.customerRate === 'number' ? String(parsed.data.customerRate) : null,
        rateCurrency: parsed.data.rateCurrency || null,
        ...availabilityUpdate,
        ...complianceUpdate,
      })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  // ── Audit: compliance changes ────────────────────────────────────────────
  // Emit candidate.compliance_updated whenever at least one tracked
  // compliance field actually changed. Emit candidate.rtw_verified
  // additionally on a status → 'checked' transition. Both are fire-and-forget
  // through emitAudit (PR #180) — failures are non-fatal to the action.
  if (fieldsChanged.length > 0) {
    emitAudit(tenantId, {
      action: 'candidate.compliance_updated',
      entityType: 'candidate',
      entityId: candidateId,
      metadata: { fields_changed: fieldsChanged },
    })
  }
  if (rtwTransitionedToChecked) {
    emitAudit(tenantId, {
      action: 'candidate.rtw_verified',
      entityType: 'candidate',
      entityId: candidateId,
      metadata: { verified_by: userId || null },
    })
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// updateCandidateAvailability — set availability status + return date
// ---------------------------------------------------------------------------

export async function updateCandidateAvailability(
  candidateId: string,
  input: {
    availabilityStatus: AvailabilityStatus
    availableFrom: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const { availabilityStatus, availableFrom } = input

  if (!['available', 'on_project', 'unavailable'].includes(availabilityStatus)) {
    return { success: false, error: `Invalid availability status: ${availabilityStatus}` }
  }

  // If not on_project, force availableFrom to null
  const effectiveFrom = availabilityStatus === 'on_project' ? availableFrom : null

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({
        availabilityStatus,
        availableFrom: effectiveFrom,
      })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  revalidatePath('/dashboard/candidates')
  return { success: true }
}

// ---------------------------------------------------------------------------
// bulkAssignToInternalAgency — move selected candidates to the Internal agency
// ---------------------------------------------------------------------------

export async function bulkAssignToInternalAgency(
  candidateIds: string[]
): Promise<{ success: boolean; updated: number; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, updated: 0, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, updated: 0, error: 'Forbidden: recruiters and admins only' }
  }

  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return { success: false, updated: 0, error: 'No candidates selected' }
  }

  if (candidateIds.length > 200) {
    return { success: false, updated: 0, error: 'Cannot assign more than 200 candidates at once' }
  }

  const result = await withTenant(tenantId, async (tx) => {
    // Find (or create) the Internal agency for this tenant
    let [internal] = await tx
      .select({ id: agencies.id })
      .from(agencies)
      .where(and(eq(agencies.tenantId, tenantId), eq(agencies.isInternal, true)))
      .limit(1)

    if (!internal) {
      await ensureInternalAgency(tx, tenantId)
      const [created] = await tx
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.tenantId, tenantId), eq(agencies.isInternal, true)))
        .limit(1)
      internal = created
    }

    if (!internal) {
      throw new Error('Failed to provision Internal agency')
    }

    const updated = await tx
      .update(candidates)
      .set({
        agencyId: internal.id,
        availabilityStatus: 'available',
        availableFrom: null,
      })
      .where(
        and(
          inArray(candidates.id, candidateIds),
          eq(candidates.tenantId, tenantId)
        )
      )
      .returning({ id: candidates.id })

    return updated.length
  })

  revalidatePath('/dashboard/candidates')
  return { success: true, updated: result }
}

// ---------------------------------------------------------------------------
// updateCandidateAgency — assign or remove a candidate's agency
// ---------------------------------------------------------------------------

export async function updateCandidateAgency(
  candidateId: string,
  agencyId: string | null
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ agencyId })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// archiveCandidate — soft-delete a candidate by setting isActive=false
// ---------------------------------------------------------------------------

export async function archiveCandidate(candidateId: string): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ isActive: false })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  // Audit: candidate archived
  await writeAuditLog(tenantId, {
    action: 'candidate.archived',
    entityType: 'candidate',
    entityId: candidateId,
  })

  redirect('/dashboard/candidates')
}

// ---------------------------------------------------------------------------
// searchCandidatesForRole — find active candidates not yet scored for a role
// ---------------------------------------------------------------------------

export type CandidateSearchResult = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  status: string
}

export async function searchCandidatesForRole(
  roleId: string,
  query: string
): Promise<CandidateSearchResult[]> {
  const ctx = await getActionContext()
  if (!ctx) return []

  const { tenantId } = ctx
  const trimmed = query.trim()
  if (trimmed.length < 1) return []

  // Escape LIKE metacharacters to prevent wildcard injection
  const safeTrimmed = trimmed.replace(/[%_\\]/g, '\\$&')

  // Subquery: candidate IDs already scored for this role
  const alreadyScoredSubquery = db
    .select({ candidateId: scores.candidateId })
    .from(scores)
    .where(eq(scores.roleId, roleId))

  const results = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        status: candidates.status,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.tenantId, tenantId),
          eq(candidates.isActive, true),
          or(
            ilike(candidates.firstName, `%${safeTrimmed}%`),
            ilike(candidates.lastName, `%${safeTrimmed}%`),
            ilike(candidates.email, `%${safeTrimmed}%`)
          ),
          notInArray(candidates.id, alreadyScoredSubquery)
        )
      )
      .orderBy(candidates.lastName, candidates.firstName)
      .limit(20)
  )

  return results
}
