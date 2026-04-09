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

const s = StyleSheet.create({
  scoreBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  dimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
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
    backgroundColor: colors.primary,
  },
  dimScore: {
    fontSize: 9,
    color: colors.slate700,
    width: 24,
    textAlign: 'right',
  },
})

type Props = {
  candidate: Candidate
  score: Score | null
  role: Role | null
  agencyName: string | null
}

type DimEntry = { label: string; getValue: (s: Score) => number | null }
const DIMENSIONS: DimEntry[] = [
  { label: 'Technical Skills', getValue: (s) => s.technicalScore },
  { label: 'Experience Level', getValue: (s) => s.experienceScore },
  { label: 'Cultural Fit', getValue: (s) => s.culturalFitScore },
  { label: 'Communication', getValue: (s) => s.communicationScore },
]

export function CandidatePDF({ candidate, score, role, agencyName }: Props) {
  return (
    <Document title={`${candidate.firstName} ${candidate.lastName} — Candidate Profile`}>
      <Page size="A4" style={base.page}>
        {/* Header */}
        <View style={{ ...base.row, justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={base.h1}>{candidate.firstName} {candidate.lastName}</Text>
            {candidate.email && <Text style={base.small}>{candidate.email}</Text>}
            {candidate.phone && <Text style={{ ...base.small, marginTop: 2 }}>{candidate.phone}</Text>}
            {agencyName && <Text style={{ ...base.small, marginTop: 2 }}>via {agencyName}</Text>}
          </View>
          {score?.overallScore !== null && score?.overallScore !== undefined && (
            <View style={s.scoreBadge}>
              <Text style={s.scoreNum}>{score.overallScore}</Text>
            </View>
          )}
        </View>

        <View style={base.divider} />

        {/* Role + dimensions */}
        {role && score && (
          <View>
            <Text style={base.h2}>Score for: {role.title}</Text>
            {DIMENSIONS.map((dim) => {
              const val = dim.getValue(score)
              if (val === null) return null
              return (
                <View key={dim.label} style={s.dimRow}>
                  <Text style={s.dimLabel}>{dim.label}</Text>
                  <View style={s.dimBar}>
                    <View style={{ ...s.dimFill, width: `${val}%` }} />
                  </View>
                  <Text style={s.dimScore}>{val}</Text>
                </View>
              )
            })}
            {score.aiSummary && (
              <View style={{ marginTop: 10 }}>
                <Text style={base.label}>AI Summary</Text>
                <Text style={base.text}>{score.aiSummary}</Text>
              </View>
            )}
          </View>
        )}

        <View style={base.divider} />

        {/* CV text */}
        <Text style={base.h2}>Curriculum Vitae</Text>
        <Text style={{ ...base.text, lineHeight: 1.6 }}>{candidate.cvText}</Text>

        {/* Footer */}
        <View style={base.footer} fixed>
          <Text style={base.small}>SkillAI — Confidential</Text>
          <Text style={base.small} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
