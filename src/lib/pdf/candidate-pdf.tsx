import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import { base, colors } from './styles'
import { parseCvBlocks } from './cv-formatter'
import type { candidates, scores, roles } from '@/db/schema'
import type { QuestionResponse } from '@/db/schema/transcript-analyses'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'

// ---------------------------------------------------------------------------
// Inferred schema types
// ---------------------------------------------------------------------------
type Candidate = typeof candidates.$inferSelect
type Score = typeof scores.$inferSelect
type Role = typeof roles.$inferSelect

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type RoleHistoryEntry = {
  roleTitle: string
  overallScore: number | null
  technicalScore: number | null
  experienceScore: number | null
  culturalFitScore: number | null
  communicationScore: number | null
  scoredAt: Date | null
}

type TranscriptAnalysisEntry = {
  overallScore: number | null
  communicationScore: number | null
  technicalDepthScore: number | null
  problemSolvingScore: number | null
  socialFitScore: number | null
  communicationReasoning: string | null
  technicalDepthReasoning: string | null
  problemSolvingReasoning: string | null
  socialFitReasoning: string | null
  summary: string | null
  strengths: string[] | null
  redFlags: string[] | null
  recommendedDecision: 'proceed' | 'consider' | 'decline' | null
  questionResponses: QuestionResponse[] | null
  createdAt: Date
}

type NoteEntry = {
  body: string
  createdAt: Date
  isEdited: boolean
}

type EnrichmentData = {
  webHits: WebHit[]
  githubProfile: GitHubProfile | null
} | null

type Props = {
  candidate: Candidate
  agencyName: string | null
  agencyLogoBase64?: string
  // When 'customer', sensitive fields (candidateRate, redFlags, recommendedDecision,
  // notes section, low-score reasoning) are hidden. Sanitisation of the data
  // itself happens upstream in the API route; this prop gates rendering.
  audience?: 'internal' | 'customer'
  activeScore: Score | null
  activeRole: Role | null
  /** Per-customer label for the active role's customerRoleId (UI fallback "Customer Role ID"). */
  activeRoleCustomerRoleIdLabel?: string | null
  roleHistory: RoleHistoryEntry[]
  transcriptAnalyses: TranscriptAnalysisEntry[]
  notes: NoteEntry[]
  enrichment: EnrichmentData
  generatedAt: Date
}

// ---------------------------------------------------------------------------
// Local styles (new elements only — base styles come from styles.ts)
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  // Score circle badge (large, for active role)
  scoreBadgeLg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadgeLgNum: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textAlign: 'center',
  },

  // Inline score pill (small, for tables / history rows)
  pill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    minWidth: 28,
  },

  // Candidate status badge (in header)
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    alignSelf: 'flex-start',
    marginTop: 4,
  },

  // Dimension bar row
  dimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  dimLabel: {
    fontSize: 9,
    color: colors.slate700,
    width: 130,
  },
  dimBar: {
    height: 6,
    borderRadius: 3,
    flex: 1,
    backgroundColor: colors.slate200,
  },
  dimFill: {
    height: 6,
    borderRadius: 3,
  },
  dimScore: {
    fontSize: 9,
    color: colors.slate700,
    width: 26,
    textAlign: 'right',
  },

  // Reasoning text under a dimension
  reasoning: {
    fontSize: 8,
    color: colors.slate500,
    lineHeight: 1.45,
    marginBottom: 4,
    paddingLeft: 130,
  },

  // Role history table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.slate100,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottom: `1pt solid ${colors.slate100}`,
  },
  tableCell: {
    fontSize: 8,
    color: colors.slate700,
  },
  tableCellBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate900,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Column widths for role history
  colRoleTitle: { flex: 3 },
  colScore: { width: 36, textAlign: 'center' },
  colDim: { width: 30, textAlign: 'center' },
  colDate: { width: 56, textAlign: 'right' },

  // Decision badge
  decisionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    alignSelf: 'flex-start',
  },

  // Quality badge (question responses)
  qualityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },

  // Bullet list item
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-start',
  },
  bulletDot: {
    fontSize: 10,
    color: colors.slate500,
    width: 12,
    lineHeight: 1.4,
  },
  bulletText: {
    fontSize: 9,
    color: colors.slate700,
    flex: 1,
    lineHeight: 1.4,
  },

  // Note card
  noteCard: {
    borderLeft: `3pt solid ${colors.slate200}`,
    paddingLeft: 8,
    marginBottom: 10,
  },
  noteTimestamp: {
    fontSize: 8,
    color: colors.slate400,
    marginBottom: 3,
  },
  noteBody: {
    fontSize: 9,
    color: colors.slate700,
    lineHeight: 1.5,
  },

  // Enrichment web hit row
  webHitRow: {
    marginBottom: 7,
  },
  webHitTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },
  webHitUrl: {
    fontSize: 7,
    color: colors.slate400,
    marginTop: 1,
  },
  webHitSnippet: {
    fontSize: 8,
    color: colors.slate700,
    lineHeight: 1.4,
    marginTop: 2,
  },

  // GitHub profile card
  ghCard: {
    borderRadius: 6,
    border: `1pt solid ${colors.slate200}`,
    padding: 10,
    marginBottom: 10,
  },
  ghLogin: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate900,
    marginBottom: 2,
  },
  ghMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  ghMetaItem: {
    fontSize: 8,
    color: colors.slate500,
  },

  // CV text block
  cvText: {
    fontSize: 8.5,
    color: colors.slate700,
    lineHeight: 1.6,
  },
  cvSectionHeading: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.slate900,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cvSubHeading: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.slate700,
    marginTop: 6,
    marginBottom: 2,
  },
  cvBullet: {
    fontSize: 8.5,
    color: colors.slate700,
    lineHeight: 1.5,
    marginLeft: 10,
    marginBottom: 2,
  },

  // Section header row (h2 + optional badge on the same line)
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 14,
  },

  // Transcript card
  transcriptCard: {
    borderRadius: 6,
    border: `1pt solid ${colors.slate200}`,
    padding: 10,
    marginBottom: 10,
  },
  transcriptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  // Question response row
  qRow: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottom: `1pt solid ${colors.slate100}`,
  },
  qText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate900,
    marginBottom: 3,
  },
  qExcerpt: {
    fontSize: 8,
    color: colors.slate500,
    lineHeight: 1.4,
    marginBottom: 3,
    fontFamily: 'Helvetica-Oblique',
  },
  qNotes: {
    fontSize: 8,
    color: colors.slate700,
    lineHeight: 1.4,
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtShort(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

/**
 * Returns badge background/text colors for a 0-100 score.
 * green >70 | amber 40-70 | red <40
 */
function scoreColors(score: number | null): { bg: string; text: string } {
  if (score === null) return { bg: colors.slate100, text: colors.slate500 }
  if (score > 70) return { bg: colors.green50, text: colors.green700 }
  if (score >= 40) return { bg: colors.amber50, text: colors.amber700 }
  return { bg: colors.red50, text: colors.red700 }
}

/**
 * Fill color for dimension progress bars — same thresholds as scoreColors.
 */
function barFillColor(score: number | null): string {
  if (score === null) return colors.slate200
  if (score > 70) return colors.green700
  if (score >= 40) return colors.amber700
  return colors.red700
}

function decisionColors(decision: 'proceed' | 'consider' | 'decline' | null): {
  bg: string
  text: string
  label: string
} {
  switch (decision) {
    case 'proceed': return { bg: colors.green50, text: colors.green700, label: 'Proceed' }
    case 'consider': return { bg: colors.amber50, text: colors.amber700, label: 'Consider' }
    case 'decline': return { bg: colors.red50, text: colors.red700, label: 'Decline' }
    default: return { bg: colors.slate100, text: colors.slate500, label: 'Pending' }
  }
}

function qualityColors(quality: QuestionResponse['quality']): { bg: string; text: string } {
  switch (quality) {
    case 'strong': return { bg: colors.green50, text: colors.green700 }
    case 'acceptable': return { bg: colors.amber50, text: colors.amber700 }
    case 'weak': return { bg: colors.red50, text: colors.red700 }
  }
}

function statusColors(status: Candidate['status']): { bg: string; text: string } {
  switch (status) {
    case 'hired': return { bg: colors.green50, text: colors.green700 }
    case 'shortlisted': return { bg: colors.violet50, text: colors.violet700 }
    case 'interviewing': return { bg: colors.amber50, text: colors.amber700 }
    case 'offered': return { bg: colors.green50, text: colors.green700 }
    case 'rejected': return { bg: colors.red50, text: colors.red700 }
    default: return { bg: colors.slate100, text: colors.slate500 }
  }
}

function statusLabel(status: Candidate['status']): string {
  const map: Record<Candidate['status'], string> = {
    new: 'New',
    shortlisted: 'Shortlisted',
    interviewing: 'Interviewing',
    offered: 'Offered',
    rejected: 'Rejected',
    hired: 'Hired',
  }
  return map[status]
}

/** Returns true when at least one compliance field is populated on the candidate. */
function hasComplianceData(c: Candidate): boolean {
  return !!(
    c.rightToWorkStatus ||
    c.rightToWorkDocumentType ||
    c.rightToWorkExpiry ||
    c.rightToWorkCheckedAt ||
    c.shareCode ||
    c.nationality ||
    c.noticePeriodDays !== null ||
    c.gdprProcessingConsentAt
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Inline score pill: "74" on coloured background */
function ScorePill({ score }: { score: number | null }) {
  const c = scoreColors(score)
  return (
    <Text style={[s.pill, { backgroundColor: c.bg, color: c.text }]}>
      {score !== null ? String(score) : '—'}
    </Text>
  )
}

/** One dimension bar row with optional reasoning line below */
function DimBar({
  label,
  score,
  reasoning,
}: {
  label: string
  score: number | null
  reasoning?: string | null
}) {
  const fill = barFillColor(score)
  return (
    <View>
      <View style={s.dimRow}>
        <Text style={s.dimLabel}>{label}</Text>
        <View style={s.dimBar}>
          {score !== null && (
            <View
              style={[s.dimFill, { width: `${score}%`, backgroundColor: fill }]}
            />
          )}
        </View>
        <Text style={s.dimScore}>{score !== null ? String(score) : '—'}</Text>
      </View>
      {reasoning ? <Text style={s.reasoning}>{reasoning}</Text> : null}
    </View>
  )
}

/** Simple bullet list */
function BulletList({ items, color }: { items: string[]; color?: string }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={[s.bulletDot, color ? { color } : {}]}>{'\u2022'}</Text>
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Header
// ---------------------------------------------------------------------------
function HeaderSection({
  candidate,
  agencyName,
  agencyLogoBase64,
  audience,
  generatedAt,
}: {
  candidate: Candidate
  agencyName: string | null
  agencyLogoBase64?: string
  audience: 'internal' | 'customer'
  generatedAt: Date
}) {
  const sc = statusColors(candidate.status)
  const isCustomer = audience === 'customer'
  return (
    <View style={{ marginBottom: 4 }}>
      <View style={{ ...base.row, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left: name + contact */}
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={base.h1}>
            {candidate.firstName} {candidate.lastName}
          </Text>

          {/* Status badge — internal only (exposes internal pipeline stage) */}
          {!isCustomer && (
            <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
              <Text style={{ color: sc.text, fontSize: 8, fontFamily: 'Helvetica-Bold' }}>
                {statusLabel(candidate.status).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={{ marginTop: 6 }}>
            {candidate.email && (
              <Text style={base.small}>{candidate.email}</Text>
            )}
            {candidate.phone && (
              <Text style={{ ...base.small, marginTop: 2 }}>{candidate.phone}</Text>
            )}
            {agencyName && !isCustomer && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
                {agencyLogoBase64 && (
                  <Image
                    src={agencyLogoBase64}
                    style={{ width: 32, height: 32, borderRadius: 16 }}
                  />
                )}
                <Text style={base.small}>Agency: {agencyName}</Text>
              </View>
            )}
            {candidate.linkedinUrl && (
              <Text style={{ ...base.small, marginTop: 2 }}>
                LinkedIn: {candidate.linkedinUrl}
              </Text>
            )}
            {candidate.githubUsername && (
              <Text style={{ ...base.small, marginTop: 2 }}>
                GitHub: {candidate.githubUsername}
              </Text>
            )}
            {/* candidateRate reveals our margin — internal only */}
            {!isCustomer && candidate.candidateRate && (
              <Text style={{ ...base.small, marginTop: 2 }}>
                Day Rate: {candidate.rateCurrency ?? ''} {Number(candidate.candidateRate).toFixed(2)}/day
              </Text>
            )}
            {candidate.customerRate && (
              <Text style={{ ...base.small, marginTop: 2 }}>
                {isCustomer ? 'Day Rate' : 'Customer Rate'}: {candidate.rateCurrency ?? ''} {Number(candidate.customerRate).toFixed(2)}/day
              </Text>
            )}
          </View>
        </View>

        {/* Right: generated date */}
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[base.small, { marginBottom: 2, fontFamily: 'Helvetica-Bold' }]}>
            {isCustomer ? 'CANDIDATE PROFILE' : 'Candidate Dossier'}
          </Text>
          <Text style={base.small}>Generated: {fmt(generatedAt)}</Text>
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Active Role Score
// ---------------------------------------------------------------------------
function ActiveScoreSection({
  score,
  role,
  candidate,
  audience,
  customerRoleIdLabel,
}: {
  score: Score | null
  role: Role | null
  candidate: Candidate
  audience: 'internal' | 'customer'
  customerRoleIdLabel?: string | null
}) {
  if (!score || !role) return null

  const isCustomer = audience === 'customer'
  // Margin is internal-only — never surfaced to customers
  const showMargin =
    !isCustomer && role.customerDayRate && candidate.candidateRate
  const marginAmount = showMargin
    ? Number(role.customerDayRate) - Number(candidate.candidateRate)
    : null
  const marginCurrency = role.rateCurrency ?? candidate.rateCurrency ?? ''
  const roleIdLabel = customerRoleIdLabel ?? 'Customer Role ID'

  return (
    <View break={false}>
      {/* Section heading + overall score circle side by side */}
      <View style={s.sectionHeaderRow}>
        <Text style={[base.h2, { marginTop: 0, marginBottom: 0 }]}>
          Score for: {role.title}
        </Text>
        {score.overallScore !== null && (
          <View style={s.scoreBadgeLg}>
            <Text style={s.scoreBadgeLgNum}>{score.overallScore}</Text>
          </View>
        )}
      </View>
      {role.customerRoleId && (
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.slate500, marginTop: 2, marginBottom: 6 }}>
          {roleIdLabel}: {role.customerRoleId}
        </Text>
      )}

      {/* Dimension bars */}
      <DimBar
        label="Technical Skills"
        score={score.technicalScore}
        reasoning={score.technicalReasoning}
      />
      <DimBar
        label="Experience Level"
        score={score.experienceScore}
        reasoning={score.experienceReasoning}
      />
      <DimBar
        label="Cultural Fit"
        score={score.culturalFitScore}
        reasoning={score.culturalFitReasoning}
      />
      <DimBar
        label="Communication"
        score={score.communicationScore}
        reasoning={score.communicationReasoning}
      />

      {/* Margin on this role — internal only */}
      {showMargin && marginAmount !== null && (
        <Text
          style={{
            fontSize: 9,
            fontFamily: 'Helvetica-Bold',
            color: marginAmount >= 0 ? colors.green700 : colors.red700,
            marginTop: 8,
          }}
        >
          Margin on this role: {marginAmount >= 0 ? '+' : ''}
          {marginCurrency} {marginAmount.toFixed(0)}/day
        </Text>
      )}

      {/* AI Summary */}
      {score.aiSummary && (
        <View style={{ marginTop: 10 }}>
          <Text style={base.label}>AI Summary</Text>
          <Text style={base.text}>{score.aiSummary}</Text>
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Role History
// ---------------------------------------------------------------------------
function RoleHistorySection({ history }: { history: RoleHistoryEntry[] }) {
  if (history.length === 0) return null
  return (
    <View>
      <Text style={base.h2}>Role History</Text>

      {/* Table header */}
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, s.colRoleTitle]}>Role</Text>
        <Text style={[s.tableHeaderCell, s.colScore]}>Overall</Text>
        <Text style={[s.tableHeaderCell, s.colDim]}>Tech</Text>
        <Text style={[s.tableHeaderCell, s.colDim]}>Exp</Text>
        <Text style={[s.tableHeaderCell, s.colDim]}>Fit</Text>
        <Text style={[s.tableHeaderCell, s.colDim]}>Comm</Text>
        <Text style={[s.tableHeaderCell, s.colDate]}>Scored</Text>
      </View>

      {/* Table rows */}
      {history.map((row, i) => (
        <View key={i} style={s.tableRow}>
          <Text style={[s.tableCellBold, s.colRoleTitle]}>
            {row.roleTitle}
          </Text>
          <View style={[{ alignItems: 'center' }, s.colScore]}>
            <ScorePill score={row.overallScore} />
          </View>
          <View style={[{ alignItems: 'center' }, s.colDim]}>
            <ScorePill score={row.technicalScore} />
          </View>
          <View style={[{ alignItems: 'center' }, s.colDim]}>
            <ScorePill score={row.experienceScore} />
          </View>
          <View style={[{ alignItems: 'center' }, s.colDim]}>
            <ScorePill score={row.culturalFitScore} />
          </View>
          <View style={[{ alignItems: 'center' }, s.colDim]}>
            <ScorePill score={row.communicationScore} />
          </View>
          <Text style={[s.tableCell, s.colDate]}>{fmtShort(row.scoredAt)}</Text>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Interview Transcript Analyses
// ---------------------------------------------------------------------------
function TranscriptAnalysesSection({
  analyses,
  audience,
}: {
  analyses: TranscriptAnalysisEntry[]
  audience: 'internal' | 'customer'
}) {
  if (analyses.length === 0) return null
  const isCustomer = audience === 'customer'

  return (
    <View>
      <Text style={base.h2}>Interview Transcript Analyses</Text>

      {analyses.map((analysis, idx) => {
        const dc = decisionColors(analysis.recommendedDecision)
        const overallC = scoreColors(analysis.overallScore)

        return (
          <View key={idx} style={s.transcriptCard} break={false}>
            {/* Card header: date + decision badge + overall score */}
            <View style={s.transcriptCardHeader}>
              <View>
                <Text style={[base.h3, { marginBottom: 0 }]}>
                  Interview — {fmt(analysis.createdAt)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {analysis.overallScore !== null && (
                  <View
                    style={[
                      s.pill,
                      { backgroundColor: overallC.bg, paddingHorizontal: 7, paddingVertical: 3 },
                    ]}
                  >
                    <Text
                      style={{
                        color: overallC.text,
                        fontSize: 9,
                        fontFamily: 'Helvetica-Bold',
                      }}
                    >
                      {analysis.overallScore}
                    </Text>
                  </View>
                )}
                {/* Recommended decision is an internal signal — hide from customer */}
                {!isCustomer && (
                  <View style={[s.decisionBadge, { backgroundColor: dc.bg }]}>
                    <Text style={{ color: dc.text, fontSize: 9, fontFamily: 'Helvetica-Bold' }}>
                      {dc.label.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Dimension bars */}
            <DimBar
              label="Communication"
              score={analysis.communicationScore}
              reasoning={analysis.communicationReasoning}
            />
            <DimBar
              label="Technical Depth"
              score={analysis.technicalDepthScore}
              reasoning={analysis.technicalDepthReasoning}
            />
            <DimBar
              label="Problem Solving"
              score={analysis.problemSolvingScore}
              reasoning={analysis.problemSolvingReasoning}
            />
            <DimBar
              label="Social Fit"
              score={analysis.socialFitScore}
              reasoning={analysis.socialFitReasoning}
            />

            {/* Summary */}
            {analysis.summary && (
              <View style={{ marginTop: 8 }}>
                <Text style={base.label}>Summary</Text>
                <Text style={base.text}>{analysis.summary}</Text>
              </View>
            )}

            {/* Strengths */}
            {analysis.strengths && analysis.strengths.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={base.label}>Strengths</Text>
                <BulletList items={analysis.strengths} color={colors.green700} />
              </View>
            )}

            {/* Red flags — internal only (sanitised upstream for customer) */}
            {!isCustomer && analysis.redFlags && analysis.redFlags.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={base.label}>Red Flags</Text>
                <BulletList items={analysis.redFlags} color={colors.red700} />
              </View>
            )}

            {/* Question responses */}
            {analysis.questionResponses && analysis.questionResponses.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={base.label}>Question Responses</Text>
                {analysis.questionResponses.map((qr, qi) => {
                  const qc = qualityColors(qr.quality)
                  return (
                    <View key={qi} style={s.qRow}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          marginBottom: 3,
                        }}
                      >
                        <Text style={[s.qText, { flex: 1, marginRight: 6 }]}>
                          {qi + 1}. {qr.questionText}
                        </Text>
                        <View
                          style={[
                            s.qualityBadge,
                            { backgroundColor: qc.bg },
                          ]}
                        >
                          <Text
                            style={{
                              color: qc.text,
                              fontSize: 7,
                              fontFamily: 'Helvetica-Bold',
                            }}
                          >
                            {qr.quality.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {qr.transcriptExcerpt && (
                        <Text style={s.qExcerpt}>"{qr.transcriptExcerpt}"</Text>
                      )}
                      {qr.notes && (
                        <Text style={s.qNotes}>{qr.notes}</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Notes
// ---------------------------------------------------------------------------
function NotesSection({ notes }: { notes: NoteEntry[] }) {
  if (notes.length === 0) return null

  // Most recent first
  const sorted = [...notes].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )

  return (
    <View>
      <Text style={base.h2}>Recruiter Notes</Text>
      {sorted.map((note, i) => (
        <View key={i} style={s.noteCard}>
          <Text style={s.noteTimestamp}>
            {fmt(note.createdAt)}
            {note.isEdited ? '  (edited)' : ''}
          </Text>
          <Text style={s.noteBody}>{note.body}</Text>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Enrichment Data
// ---------------------------------------------------------------------------
function EnrichmentSection({ enrichment }: { enrichment: EnrichmentData }) {
  if (!enrichment) return null

  const hasGitHub = !!enrichment.githubProfile
  const hasWebHits = enrichment.webHits.length > 0

  if (!hasGitHub && !hasWebHits) return null

  return (
    <View>
      <Text style={base.h2}>Enrichment Data</Text>

      {/* GitHub profile */}
      {hasGitHub && enrichment.githubProfile && (
        <View style={s.ghCard}>
          <Text style={base.label}>GitHub Profile</Text>
          <Text style={s.ghLogin}>{enrichment.githubProfile.login}</Text>
          {enrichment.githubProfile.bio && (
            <Text style={[base.text, { marginTop: 2, fontSize: 9 }]}>
              {enrichment.githubProfile.bio}
            </Text>
          )}
          <View style={s.ghMeta}>
            <Text style={s.ghMetaItem}>
              Public repos: {enrichment.githubProfile.publicRepos}
            </Text>
            <Text style={s.ghMetaItem}>
              Followers: {enrichment.githubProfile.followers}
            </Text>
          </View>
        </View>
      )}

      {/* Web hits */}
      {hasWebHits && (
        <View>
          <Text style={[base.label, { marginBottom: 6 }]}>Web Results</Text>
          {enrichment.webHits.map((hit, i) => (
            <View key={i} style={s.webHitRow}>
              <Text style={s.webHitTitle}>{hit.title}</Text>
              <Text style={s.webHitUrl}>{hit.url}</Text>
              {hit.description && (
                <Text style={s.webHitSnippet}>{hit.description}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: Compliance & Eligibility (internal / recruiter only)
// Never rendered for customer audience — gated at the call-site.
// ---------------------------------------------------------------------------
function ComplianceSection({ candidate }: { candidate: Candidate }) {
  // Only render when at least one compliance field is populated
  if (!hasComplianceData(candidate)) return null

  // Human-readable labels for enum values
  function rtwStatusLabel(v: string | null): string {
    if (!v) return '—'
    const map: Record<string, string> = {
      checked: 'Checked',
      pending: 'Pending',
      fail: 'Fail',
      exempted: 'Exempted',
      not_required: 'Not Required',
    }
    return map[v] ?? v
  }

  function rtwDocLabel(v: string | null): string {
    if (!v) return '—'
    const map: Record<string, string> = {
      passport_uk: 'UK Passport',
      passport_eu: 'EU Passport',
      passport_other: 'Other Passport',
      brp: 'BRP',
      share_code: 'Share Code',
      visa: 'Visa',
      settled_status: 'Settled Status',
      presettled_status: 'Pre-Settled Status',
      other: 'Other',
    }
    return map[v] ?? v
  }

  function consentByLabel(v: string | null): string {
    if (!v) return '—'
    const map: Record<string, string> = {
      candidate: 'Candidate',
      recruiter: 'Recruiter',
      agency: 'Agency',
    }
    return map[v] ?? v
  }

  // Reusable row: label + value
  function FieldRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 8,
            fontFamily: 'Helvetica-Bold',
            color: colors.slate500,
            width: 160,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 9, color: colors.slate700, flex: 1 }}>{value}</Text>
      </View>
    )
  }

  // Right-to-work status badge color
  function rtwStatusColors(v: string | null): { bg: string; text: string } {
    switch (v) {
      case 'checked': return { bg: colors.green50, text: colors.green700 }
      case 'fail': return { bg: colors.red50, text: colors.red700 }
      case 'pending': return { bg: colors.amber50, text: colors.amber700 }
      default: return { bg: colors.slate100, text: colors.slate500 }
    }
  }

  const rtwC = rtwStatusColors(candidate.rightToWorkStatus ?? null)

  return (
    <View>
      <View style={s.sectionHeaderRow}>
        <Text style={[base.h2, { marginTop: 0, marginBottom: 0 }]}>
          Compliance &amp; Eligibility
        </Text>
        {candidate.rightToWorkStatus && (
          <View
            style={[
              base.badge,
              { backgroundColor: rtwC.bg },
            ]}
          >
            <Text style={{ color: rtwC.text, fontSize: 8, fontFamily: 'Helvetica-Bold' }}>
              RIGHT TO WORK: {rtwStatusLabel(candidate.rightToWorkStatus).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={[base.card, { marginTop: 6 }]}>
        {/* Right to Work */}
        {candidate.rightToWorkStatus && (
          <FieldRow label="Right to Work Status" value={rtwStatusLabel(candidate.rightToWorkStatus)} />
        )}
        {candidate.rightToWorkDocumentType && (
          <FieldRow label="Document Type" value={rtwDocLabel(candidate.rightToWorkDocumentType)} />
        )}
        {candidate.rightToWorkExpiry && (
          <FieldRow label="Document Expiry" value={candidate.rightToWorkExpiry} />
        )}
        {candidate.rightToWorkCheckedAt && (
          <FieldRow label="Check Date" value={fmt(candidate.rightToWorkCheckedAt)} />
        )}
        {candidate.shareCode && (
          <FieldRow label="Share Code" value={candidate.shareCode} />
        )}

        {/* Sponsorship & Nationality */}
        <FieldRow
          label="Sponsorship Required"
          value={candidate.sponsorshipRequired ? 'Yes' : 'No'}
        />
        {candidate.nationality && (
          <FieldRow label="Nationality" value={candidate.nationality} />
        )}

        {/* Notice period */}
        {candidate.noticePeriodDays !== null && candidate.noticePeriodDays !== undefined && (
          <FieldRow
            label="Notice Period"
            value={
              candidate.noticePeriodDays === 0
                ? 'Immediate'
                : `${candidate.noticePeriodDays} day${candidate.noticePeriodDays === 1 ? '' : 's'}`
            }
          />
        )}

        {/* GDPR consent */}
        {candidate.gdprProcessingConsentAt && (
          <FieldRow label="GDPR Consent Date" value={fmt(candidate.gdprProcessingConsentAt)} />
        )}
        {candidate.gdprProcessingConsentBy && (
          <FieldRow
            label="GDPR Consent Provided By"
            value={consentByLabel(candidate.gdprProcessingConsentBy)}
          />
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Section: CV Text
// ---------------------------------------------------------------------------
function CvTextSection({ cvText, cvTextFormatted }: { cvText: string; cvTextFormatted?: string | null }) {
  // Prefer AI-formatted (markdown) version when present; fall back to raw
  // cv_text. The parser handles both — it auto-detects markdown markers and
  // otherwise injects section breaks before known CV headings.
  const blocks = parseCvBlocks(cvTextFormatted ?? cvText)

  if (blocks.length === 0) {
    return (
      <View>
        <Text style={base.h2}>Curriculum Vitae</Text>
        <Text style={s.cvText}>(no CV text available)</Text>
      </View>
    )
  }

  return (
    <View>
      <Text style={base.h2}>Curriculum Vitae</Text>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return <Text key={i} style={s.cvSectionHeading}>{block.text}</Text>
          case 'subheading':
            return <Text key={i} style={s.cvSubHeading}>{block.text}</Text>
          case 'bullet':
            return <Text key={i} style={s.cvBullet}>• {block.text}</Text>
          case 'paragraph':
          default:
            return <Text key={i} style={[s.cvText, { marginBottom: 6 }]}>{block.text}</Text>
        }
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
export function CandidatePDF({
  candidate,
  agencyName,
  agencyLogoBase64,
  audience = 'internal',
  activeScore,
  activeRole,
  activeRoleCustomerRoleIdLabel,
  roleHistory,
  transcriptAnalyses,
  notes,
  enrichment,
  generatedAt,
}: Props) {
  const fullName = `${candidate.firstName} ${candidate.lastName}`
  const isCustomer = audience === 'customer'
  const docTitle = isCustomer ? `${fullName} — Candidate Profile` : `${fullName} — Candidate Dossier`

  return (
    <Document title={docTitle}>
      <Page size="A4" style={base.page}>
        {/* ── 1. Header ─────────────────────────────────────────────── */}
        <HeaderSection
          candidate={candidate}
          agencyName={agencyName}
          agencyLogoBase64={agencyLogoBase64}
          audience={audience}
          generatedAt={generatedAt}
        />

        <View style={base.divider} />

        {/* ── 2. Active Role Score ───────────────────────────────────── */}
        <ActiveScoreSection
          score={activeScore}
          role={activeRole}
          candidate={candidate}
          audience={audience}
          customerRoleIdLabel={activeRoleCustomerRoleIdLabel}
        />

        {(activeScore || activeRole) && <View style={base.divider} />}

        {/* ── 3. Role History ───────────────────────────────────────── */}
        {roleHistory.length > 0 && (
          <>
            <RoleHistorySection history={roleHistory} />
            <View style={base.divider} />
          </>
        )}

        {/* ── 4. Interview Transcript Analyses ──────────────────────── */}
        {transcriptAnalyses.length > 0 && (
          <>
            <TranscriptAnalysesSection analyses={transcriptAnalyses} audience={audience} />
            <View style={base.divider} />
          </>
        )}

        {/* ── 5. Notes (internal only) ──────────────────────────────── */}
        {!isCustomer && notes.length > 0 && (
          <>
            <NotesSection notes={notes} />
            <View style={base.divider} />
          </>
        )}

        {/* ── 5b. Compliance & Eligibility (internal only) ─────────── */}
        {!isCustomer && hasComplianceData(candidate) && (
          <>
            <ComplianceSection candidate={candidate} />
            <View style={base.divider} />
          </>
        )}

        {/* ── 6. Enrichment Data ────────────────────────────────────── */}
        {enrichment && (
          <>
            <EnrichmentSection enrichment={enrichment} />
            <View style={base.divider} />
          </>
        )}

        {/* ── 7. CV Text ────────────────────────────────────────────── */}
        <CvTextSection cvText={candidate.cvText} cvTextFormatted={candidate.cvTextFormatted} />

        {/* ── Footer (fixed on every page) ──────────────────────────── */}
        <View style={base.footer} fixed>
          <Text style={base.small}>
            {isCustomer
              ? 'Confidential — Prepared for customer review. Candidate contact details shared upon engagement only.'
              : 'SkillAI — Confidential'}
          </Text>
          <Text
            style={base.small}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
