import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { base, colors } from './styles'
import type { roles } from '@/db/schema'

type Role = typeof roles.$inferSelect

type Props = {
  role: Role
  customerName?: string | null
  customerRoleId?: string | null
  customerRoleIdLabel?: string | null
}

// ── Pill / chip colour palette for the PDF ──────────────────────────────
const pillColors = {
  blue:    { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  amber:   { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  emerald: { bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },
  violet:  { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  slate:   { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
}

const s = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 14,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 14,
  },
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  paragraph: {
    fontSize: 10,
    color: colors.slate900,
    marginBottom: 8,
    lineHeight: 1.5,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate500,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 12,
    letterSpacing: 0.5,
  },
})

// Render a small pill — used for tags, work mode, location, etc.
function Pill({ text, variant = 'slate' }: { text: string; variant?: keyof typeof pillColors }) {
  const c = pillColors[variant]
  return (
    <Text style={[s.pill, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}>
      {text}
    </Text>
  )
}

// Split a long string into paragraphs by blank lines for readability.
function Paragraphs({ text }: { text: string }) {
  if (!text || !text.trim()) {
    return <Text style={[s.paragraph, { fontStyle: 'italic', color: colors.slate500 }]}>(empty)</Text>
  }
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <>
      {parts.map((para, i) => (
        <Text key={i} style={s.paragraph}>{para}</Text>
      ))}
    </>
  )
}

const WORK_MODE_VARIANT: Record<string, { variant: keyof typeof pillColors; label: string }> = {
  remote:  { variant: 'emerald', label: 'Remote' },
  hybrid:  { variant: 'blue', label: 'Hybrid' },
  onsite:  { variant: 'amber', label: 'Onsite' },
}

export function RolePDF({ role, customerName, customerRoleId, customerRoleIdLabel }: Props) {
  const workMode = role.workMode ? WORK_MODE_VARIANT[role.workMode] : null
  const location = [role.city, role.country].filter(Boolean).join(', ')
  const hasMeta = workMode || location || (role.languageRequirements?.length ?? 0) > 0 || customerName || role.frameworkLevelLabel
  const hasSkills = (role.keySkills?.length ?? 0) > 0
  const hasReqs = (role.topRequirements?.length ?? 0) > 0
  const roleIdLabel = customerRoleIdLabel ?? 'Customer Role ID'

  return (
    <Document title={`Role — ${role.title}`}>
      <Page size="A4" style={base.page}>
        {/* Header */}
        <Text style={base.h1}>{role.title}</Text>
        {customerRoleId && (
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.slate500, marginTop: 2 }}>
            {roleIdLabel}: {customerRoleId}
          </Text>
        )}
        <Text style={base.small}>
          {customerName && <>{customerName} · </>}
          Created {new Date(role.createdAt).toLocaleDateString('en-GB')}
          {role.isActive ? '' : ' · Archived'}
        </Text>

        {/* Meta pill bar */}
        {hasMeta && (
          <View style={s.metaRow}>
            {workMode && <Pill text={workMode.label} variant={workMode.variant} />}
            {location && <Pill text={location} variant="slate" />}
            {role.languageRequirements?.map((lang) => (
              <Pill key={lang} text={lang} variant="violet" />
            ))}
            {role.frameworkLevelLabel && <Pill text={role.frameworkLevelLabel} variant="violet" />}
          </View>
        )}

        {/* Budget — internal role PDF only (no customer-facing variant) */}
        {role.customerDayRate && (
          <Text style={{ fontSize: 10, color: colors.slate900, marginBottom: 10 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Budget: </Text>
            {role.rateCurrency ?? ''} {Number(role.customerDayRate).toFixed(0)}/day
          </Text>
        )}

        <View style={base.divider} />

        {/* Key skills */}
        {hasSkills && (
          <>
            <Text style={s.sectionLabel}>Key Skills</Text>
            <View style={s.pillsContainer}>
              {role.keySkills.map((skill) => (
                <Pill key={skill} text={skill} variant="blue" />
              ))}
            </View>
          </>
        )}

        {/* Top requirements */}
        {hasReqs && (
          <>
            <Text style={s.sectionLabel}>Top Requirements</Text>
            <View style={s.pillsContainer}>
              {role.topRequirements.map((req) => (
                <Pill key={req} text={req} variant="amber" />
              ))}
            </View>
          </>
        )}

        {/* Description */}
        <Text style={s.sectionLabel}>Description</Text>
        <Paragraphs text={role.description} />

        {/* Requirements */}
        <Text style={s.sectionLabel}>Requirements</Text>
        <Paragraphs text={role.requirements} />

        {/* Footer */}
        <View style={base.footer} fixed>
          <Text style={base.small}>SkillAI — Confidential</Text>
          <Text style={{ ...base.small, color: colors.slate400 }}>
            {new Date().toLocaleDateString('en-GB')}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
