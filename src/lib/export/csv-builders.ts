/**
 * Per-entity CSV builders for tenant-scoped data exports.
 *
 * Each builder runs inside withTenant() (RLS-safe), selects an explicit column
 * list (excluding heavy text / vector / JSONB columns), maps rows to flat
 * records, and returns { csv, rowCount }.
 *
 * Heavy columns excluded per plan (DEC-011 / issue #82):
 *   candidates  — cvText, cvTextFormatted, embedding, synechronCvData
 *   roles       — description, requirements
 *   scores      — technicalReasoning, experienceReasoning, culturalFitReasoning,
 *                 communicationReasoning, aiSummary
 *   agencies    — nothing excluded
 */

import { withTenant } from '@/db'
import { candidates, roles, scores, agencies } from '@/db/schema'
import { toCsv } from '@/lib/reports/to-csv'

// ── Type ──────────────────────────────────────────────────────────────────────

export interface CsvResult {
  csv: string
  rowCount: number
}

// ── Column header definitions ─────────────────────────────────────────────────

const CANDIDATE_HEADERS = [
  { key: 'id',                   label: 'ID' },
  { key: 'tenantId',             label: 'Tenant ID' },
  { key: 'agencyId',             label: 'Agency ID' },
  { key: 'firstName',            label: 'First Name' },
  { key: 'lastName',             label: 'Last Name' },
  { key: 'email',                label: 'Email' },
  { key: 'phone',                label: 'Phone' },
  { key: 'filePath',             label: 'File Path' },
  { key: 'fileType',             label: 'File Type' },
  { key: 'linkedinUrl',          label: 'LinkedIn URL' },
  { key: 'githubUsername',       label: 'GitHub Username' },
  { key: 'status',               label: 'Status' },
  { key: 'statusConfirmedBy',    label: 'Status Confirmed By' },
  { key: 'statusConfirmedAt',    label: 'Status Confirmed At' },
  { key: 'country',              label: 'Country' },
  { key: 'city',                 label: 'City' },
  { key: 'languagesSpoken',      label: 'Languages Spoken' },
  { key: 'willingToRelocate',    label: 'Willing To Relocate' },
  { key: 'candidateRate',        label: 'Candidate Rate' },
  { key: 'customerRate',         label: 'Customer Rate' },
  { key: 'rateCurrency',         label: 'Rate Currency' },
  { key: 'availabilityStatus',   label: 'Availability Status' },
  { key: 'availableFrom',        label: 'Available From' },
  { key: 'isActive',             label: 'Is Active' },
  { key: 'synechronCandidateId', label: 'Synechron Candidate ID' },
  { key: 'createdAt',            label: 'Created At' },
] as const

const ROLE_HEADERS = [
  { key: 'id',                        label: 'ID' },
  { key: 'tenantId',                  label: 'Tenant ID' },
  { key: 'title',                     label: 'Title' },
  { key: 'filePath',                  label: 'File Path' },
  { key: 'createdBy',                 label: 'Created By' },
  { key: 'customerId',                label: 'Customer ID' },
  { key: 'customerRoleId',            label: 'Customer Role ID' },
  { key: 'isActive',                  label: 'Is Active' },
  { key: 'frameworkLevelId',          label: 'Framework Level ID' },
  { key: 'frameworkLevelLabel',       label: 'Framework Level Label' },
  { key: 'country',                   label: 'Country' },
  { key: 'city',                      label: 'City' },
  { key: 'workMode',                  label: 'Work Mode' },
  { key: 'languageRequirements',      label: 'Language Requirements' },
  { key: 'keySkills',                 label: 'Key Skills' },
  { key: 'topRequirements',           label: 'Top Requirements' },
  { key: 'priorityKeywords',          label: 'Priority Keywords' },
  { key: 'priorityKeywordsUpdatedAt', label: 'Priority Keywords Updated At' },
  { key: 'targetFillDate',            label: 'Target Fill Date' },
  { key: 'cutoffDate',                label: 'Cutoff Date' },
  { key: 'customerPortalPath',        label: 'Customer Portal Path' },
  { key: 'customerDayRate',           label: 'Customer Day Rate' },
  { key: 'rateCurrency',              label: 'Rate Currency' },
  { key: 'shortlistSentAt',           label: 'Shortlist Sent At' },
  { key: 'createdAt',                 label: 'Created At' },
] as const

const SCORE_HEADERS = [
  { key: 'id',                 label: 'ID' },
  { key: 'tenantId',           label: 'Tenant ID' },
  { key: 'candidateId',        label: 'Candidate ID' },
  { key: 'roleId',             label: 'Role ID' },
  { key: 'scoreStatus',        label: 'Score Status' },
  { key: 'overallScore',       label: 'Overall Score' },
  { key: 'technicalScore',     label: 'Technical Score' },
  { key: 'experienceScore',    label: 'Experience Score' },
  { key: 'culturalFitScore',   label: 'Cultural Fit Score' },
  { key: 'communicationScore', label: 'Communication Score' },
  { key: 'errorMessage',       label: 'Error Message' },
  { key: 'createdAt',          label: 'Created At' },
  { key: 'updatedAt',          label: 'Updated At' },
] as const

const AGENCY_HEADERS = [
  { key: 'id',           label: 'ID' },
  { key: 'tenantId',     label: 'Tenant ID' },
  { key: 'name',         label: 'Name' },
  { key: 'contactEmail', label: 'Contact Email' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'notes',        label: 'Notes' },
  { key: 'logoPath',     label: 'Logo Path' },
  { key: 'isActive',     label: 'Is Active' },
  { key: 'isInternal',   label: 'Is Internal' },
  { key: 'isSystem',     label: 'Is System' },
  { key: 'createdAt',    label: 'Created At' },
] as const

// ── Builders ──────────────────────────────────────────────────────────────────

/**
 * Build a CSV of all candidates for the tenant.
 * Excludes: cvText, cvTextFormatted, embedding, synechronCvData
 */
export async function buildCandidatesCsv(tenantId: string): Promise<CsvResult> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({
      id:                   candidates.id,
      tenantId:             candidates.tenantId,
      agencyId:             candidates.agencyId,
      firstName:            candidates.firstName,
      lastName:             candidates.lastName,
      email:                candidates.email,
      phone:                candidates.phone,
      filePath:             candidates.filePath,
      fileType:             candidates.fileType,
      linkedinUrl:          candidates.linkedinUrl,
      githubUsername:       candidates.githubUsername,
      status:               candidates.status,
      statusConfirmedBy:    candidates.statusConfirmedBy,
      statusConfirmedAt:    candidates.statusConfirmedAt,
      country:              candidates.country,
      city:                 candidates.city,
      languagesSpoken:      candidates.languagesSpoken,
      willingToRelocate:    candidates.willingToRelocate,
      candidateRate:        candidates.candidateRate,
      customerRate:         candidates.customerRate,
      rateCurrency:         candidates.rateCurrency,
      availabilityStatus:   candidates.availabilityStatus,
      availableFrom:        candidates.availableFrom,
      isActive:             candidates.isActive,
      synechronCandidateId: candidates.synechronCandidateId,
      createdAt:            candidates.createdAt,
    }).from(candidates)
  )

  // Flatten array columns to semicolon-delimited strings for CSV compatibility
  const flatRows = rows.map((r) => ({
    ...r,
    languagesSpoken: r.languagesSpoken.join('; '),
  }))

  const csv = toCsv(flatRows, [...CANDIDATE_HEADERS])
  return { csv, rowCount: rows.length }
}

/**
 * Build a CSV of all roles for the tenant.
 * Excludes: description, requirements (large text)
 */
export async function buildRolesCsv(tenantId: string): Promise<CsvResult> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({
      id:                        roles.id,
      tenantId:                  roles.tenantId,
      title:                     roles.title,
      filePath:                  roles.filePath,
      createdBy:                 roles.createdBy,
      customerId:                roles.customerId,
      customerRoleId:            roles.customerRoleId,
      isActive:                  roles.isActive,
      frameworkLevelId:          roles.frameworkLevelId,
      frameworkLevelLabel:       roles.frameworkLevelLabel,
      country:                   roles.country,
      city:                      roles.city,
      workMode:                  roles.workMode,
      languageRequirements:      roles.languageRequirements,
      keySkills:                 roles.keySkills,
      topRequirements:           roles.topRequirements,
      priorityKeywords:          roles.priorityKeywords,
      priorityKeywordsUpdatedAt: roles.priorityKeywordsUpdatedAt,
      targetFillDate:            roles.targetFillDate,
      cutoffDate:                roles.cutoffDate,
      customerPortalPath:        roles.customerPortalPath,
      customerDayRate:           roles.customerDayRate,
      rateCurrency:              roles.rateCurrency,
      shortlistSentAt:           roles.shortlistSentAt,
      createdAt:                 roles.createdAt,
    }).from(roles)
  )

  // Flatten array columns to semicolon-delimited strings
  const flatRows = rows.map((r) => ({
    ...r,
    languageRequirements: r.languageRequirements.join('; '),
    keySkills:            r.keySkills.join('; '),
    topRequirements:      r.topRequirements.join('; '),
    priorityKeywords:     r.priorityKeywords.join('; '),
  }))

  const csv = toCsv(flatRows, [...ROLE_HEADERS])
  return { csv, rowCount: rows.length }
}

/**
 * Build a CSV of all AI scoring runs for the tenant.
 * Excludes: technicalReasoning, experienceReasoning, culturalFitReasoning,
 *           communicationReasoning, aiSummary (long text reasoning fields)
 */
export async function buildScoresCsv(tenantId: string): Promise<CsvResult> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({
      id:                 scores.id,
      tenantId:           scores.tenantId,
      candidateId:        scores.candidateId,
      roleId:             scores.roleId,
      scoreStatus:        scores.scoreStatus,
      overallScore:       scores.overallScore,
      technicalScore:     scores.technicalScore,
      experienceScore:    scores.experienceScore,
      culturalFitScore:   scores.culturalFitScore,
      communicationScore: scores.communicationScore,
      errorMessage:       scores.errorMessage,
      createdAt:          scores.createdAt,
      updatedAt:          scores.updatedAt,
    }).from(scores)
  )

  const csv = toCsv(rows, [...SCORE_HEADERS])
  return { csv, rowCount: rows.length }
}

/**
 * Build a CSV of all agencies for the tenant.
 * No columns excluded.
 */
export async function buildAgenciesCsv(tenantId: string): Promise<CsvResult> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({
      id:           agencies.id,
      tenantId:     agencies.tenantId,
      name:         agencies.name,
      contactEmail: agencies.contactEmail,
      contactPhone: agencies.contactPhone,
      notes:        agencies.notes,
      logoPath:     agencies.logoPath,
      isActive:     agencies.isActive,
      isInternal:   agencies.isInternal,
      isSystem:     agencies.isSystem,
      createdAt:    agencies.createdAt,
    }).from(agencies)
  )

  const csv = toCsv(rows, [...AGENCY_HEADERS])
  return { csv, rowCount: rows.length }
}
