import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { base, colors } from './styles'
import type { candidates, scores, roles } from '@/db/schema'

type Candidate = typeof candidates.$inferSelect
type Score = typeof scores.$inferSelect
type Role = typeof roles.$inferSelect

// ── Pill colour palette (matches role-pdf.tsx) ───────────────────────────
const pillColors = {
  blue:    { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  amber:   { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  emerald: { bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },
  violet:  { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  slate:   { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
}

const s = StyleSheet.create({
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  rankNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  dimRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  dimItem: {
    flex: 1,
    alignItems: 'center',
  },
  // Role context block
  contextBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
    marginBottom: 8,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  contextLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate500,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  contextDescription: {
    fontSize: 9,
    color: colors.slate700,
    marginTop: 6,
    lineHeight: 1.4,
  },
})

function Pill({ text, variant = 'slate' }: { text: string; variant?: keyof typeof pillColors }) {
  const c = pillColors[variant]
  return (
    <Text style={[s.pill, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}>
      {text}
    </Text>
  )
}

const WORK_MODE_VARIANT: Record<string, { variant: keyof typeof pillColors; label: string }> = {
  remote:  { variant: 'emerald', label: 'Remote' },
  hybrid:  { variant: 'blue', label: 'Hybrid' },
  onsite:  { variant: 'amber', label: 'Onsite' },
}

type ShortlistEntry = {
  candidate: Candidate
  score: Score
  agencyName: string | null
  margin: { amount: number; currency: string; mismatch: boolean } | null
}

type Props = {
  entries: ShortlistEntry[]
  roleTitle: string
  role?: Role | null
  customerName?: string | null
}

type DimEntry = { label: string; getValue: (s: Score) => number | null }
const DIMENSIONS: DimEntry[] = [
  { label: 'Technical', getValue: (s) => s.technicalScore },
  { label: 'Experience', getValue: (s) => s.experienceScore },
  { label: 'Culture', getValue: (s) => s.culturalFitScore },
  { label: 'Communication', getValue: (s) => s.communicationScore },
]

function RoleContextBlock({ role, customerName }: { role: Role; customerName?: string | null }) {
  const workMode = role.workMode ? WORK_MODE_VARIANT[role.workMode] : null
  const location = [role.city, role.country].filter(Boolean).join(', ')
  const hasMeta = workMode || location || (role.languageRequirements?.length ?? 0) > 0
  const hasSkills = (role.keySkills?.length ?? 0) > 0
  const hasReqs = (role.topRequirements?.length ?? 0) > 0
  const descSnippet = role.description && role.description.length > 400
    ? role.description.slice(0, 400).trim() + '…'
    : role.description

  return (
    <View style={s.contextBox}>
      <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: colors.slate900 }}>
        {role.title}
      </Text>
      {customerName && (
        <Text style={{ fontSize: 9, color: colors.slate500, marginTop: 1 }}>
          for {customerName}
        </Text>
      )}

      {hasMeta && (
        <View style={s.metaRow}>
          {workMode && <Pill text={workMode.label} variant={workMode.variant} />}
          {location && <Pill text={location} variant="slate" />}
          {role.languageRequirements?.map((lang) => (
            <Pill key={lang} text={lang} variant="violet" />
          ))}
        </View>
      )}

      {hasSkills && (
        <>
          <Text style={s.contextLabel}>Key Skills</Text>
          <View style={s.pillsContainer}>
            {role.keySkills.map((skill) => (
              <Pill key={skill} text={skill} variant="blue" />
            ))}
          </View>
        </>
      )}

      {hasReqs && (
        <>
          <Text style={s.contextLabel}>Top Requirements</Text>
          <View style={s.pillsContainer}>
            {role.topRequirements.map((req) => (
              <Pill key={req} text={req} variant="amber" />
            ))}
          </View>
        </>
      )}

      {role.customerDayRate && (
        <>
          <Text style={s.contextLabel}>Budget</Text>
          <Text style={{ fontSize: 9, color: colors.slate700, marginTop: 2 }}>
            {role.rateCurrency ?? ''} {Number(role.customerDayRate).toFixed(0)}/day
          </Text>
        </>
      )}

      {descSnippet && (
        <Text style={s.contextDescription}>{descSnippet}</Text>
      )}
    </View>
  )
}

export function ShortlistPDF({ entries, roleTitle, role, customerName }: Props) {
  return (
    <Document title={`Shortlist — ${roleTitle}`}>
      <Page size="A4" style={base.page}>
        <Text style={base.h1}>Candidate Shortlist</Text>
        <Text style={{ ...base.small, marginTop: 2, marginBottom: 12 }}>
          {entries.length} candidate{entries.length === 1 ? '' : 's'} ranked
        </Text>

        {/* Role context — title, meta, skills, requirements, description */}
        {role && <RoleContextBlock role={role} customerName={customerName} />}

        <View style={base.divider} />

        {entries.map((entry, i) => {
          return (
            <View key={entry.candidate.id} style={{ ...base.card, flexDirection: 'row' }}>
              <View style={s.rankBadge}>
                <Text style={s.rankNum}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ ...base.h3, marginBottom: 2 }}>
                    {entry.candidate.firstName} {entry.candidate.lastName}
                  </Text>
                  <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: colors.primary }}>
                    {entry.score.overallScore}
                  </Text>
                </View>
                {entry.agencyName && (
                  <Text style={{ ...base.small, marginBottom: 4 }}>via {entry.agencyName}</Text>
                )}
                {entry.margin && (
                  <Text
                    style={{
                      fontSize: 9,
                      fontFamily: 'Helvetica-Bold',
                      color: entry.margin.amount >= 0 ? '#047857' : '#b91c1c',
                      marginBottom: 4,
                    }}
                  >
                    Margin: {entry.margin.amount >= 0 ? '+' : ''}
                    {entry.margin.currency} {entry.margin.amount.toFixed(0)}/day
                    {entry.margin.mismatch ? '  (currency mismatch)' : ''}
                  </Text>
                )}
                {entry.score.aiSummary && (
                  <Text style={{ ...base.text, marginBottom: 6 }}>{entry.score.aiSummary}</Text>
                )}
                <View style={s.dimRow}>
                  {DIMENSIONS.map((dim) => {
                    const val = dim.getValue(entry.score)
                    if (val === null) return null
                    return (
                      <View key={dim.label} style={s.dimItem}>
                        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.primary }}>
                          {val}
                        </Text>
                        <Text style={base.small}>{dim.label}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            </View>
          )
        })}

        {/* Footer */}
        <View style={base.footer} fixed>
          <Text style={base.small}>SkillAI — Confidential</Text>
          <Text style={base.small} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
