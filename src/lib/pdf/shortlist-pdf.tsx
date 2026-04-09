import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { base, colors } from './styles'
import type { candidates, scores } from '@/db/schema'

type Candidate = typeof candidates.$inferSelect
type Score = typeof scores.$inferSelect

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
})

type ShortlistEntry = {
  candidate: Candidate
  score: Score
  agencyName: string | null
}

type Props = {
  entries: ShortlistEntry[]
  roleTitle: string
}

type DimEntry = { label: string; getValue: (s: Score) => number | null }
const DIMENSIONS: DimEntry[] = [
  { label: 'Technical', getValue: (s) => s.technicalScore },
  { label: 'Experience', getValue: (s) => s.experienceScore },
  { label: 'Culture', getValue: (s) => s.culturalFitScore },
  { label: 'Communication', getValue: (s) => s.communicationScore },
]

export function ShortlistPDF({ entries, roleTitle }: Props) {
  return (
    <Document title={`Shortlist — ${roleTitle}`}>
      <Page size="A4" style={base.page}>
        <Text style={base.h1}>Candidate Shortlist</Text>
        <Text style={{ ...base.text, marginTop: 2, marginBottom: 16 }}>Role: {roleTitle}</Text>

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
