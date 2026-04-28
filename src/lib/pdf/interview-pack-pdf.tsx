import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import '@/lib/pdf/fonts' // side-effect: registers Inter font family (Polish + Latin Extended-A glyph support)
import { base, colors } from './styles'
import type { InterviewPack, InterviewQuestion, CodeChallenge } from '@/db/schema'

// Local overrides of shared `base` styles. The shared `base` uses the built-in
// PDF core font (no Latin Extended-A glyphs — Polish diacritics fail), so we
// override per-style to use Inter, which is registered in `./fonts` with
// numeric weights 400/500/600/700 and covers all v1 supported languages.
// Other PDFs continue using `base` directly until they need similar coverage.
const t = StyleSheet.create({
  page: { ...base.page, fontFamily: 'Inter' },
  h1: { ...base.h1, fontFamily: 'Inter', fontWeight: 700 },
  h2: { ...base.h2, fontFamily: 'Inter', fontWeight: 700 },
  h3: { ...base.h3, fontFamily: 'Inter', fontWeight: 700 },
  label: { ...base.label, fontFamily: 'Inter', fontWeight: 700 },
  text: { ...base.text, fontFamily: 'Inter' },
  small: { ...base.small, fontFamily: 'Inter' },
  divider: base.divider,
  badge: { ...base.badge, fontFamily: 'Inter', fontWeight: 700 },
  card: base.card,
  row: base.row,
  footer: base.footer,
})

const s = StyleSheet.create({
  statusBadge: {
    ...t.badge,
    backgroundColor: colors.violet50,
    color: colors.violet700,
  },
  diffBadge: {
    ...t.badge,
    marginRight: 4,
  },
  questionBox: {
    ...t.card,
    marginBottom: 10,
  },
  signalBox: {
    borderRadius: 4,
    padding: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  codeBlock: {
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  codeText: {
    fontSize: 8,
    color: '#e2e8f0',
    fontFamily: 'Courier',
  },
})

const DIFF_COLORS: Record<string, string> = {
  easy: colors.green700,
  medium: colors.amber700,
  hard: colors.red700,
}

type Props = {
  pack: InterviewPack
  questions: InterviewQuestion[]
  codeChallenge: CodeChallenge | null
  candidateName: string
  roleTitle: string
}

export function InterviewPackPDF({ pack, questions, codeChallenge, candidateName, roleTitle }: Props) {
  return (
    <Document title={`Interview Pack — ${candidateName}`}>
      <Page size="A4" style={t.page}>
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={t.h1}>Interview Pack</Text>
          <Text style={{ ...t.text, marginTop: 2 }}>
            {candidateName} · {roleTitle}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {pack.experienceLevel && (
              <Text style={{ ...s.statusBadge }}>{pack.experienceLevel} level</Text>
            )}
            {pack.recommendedDurationMinutes && (
              <Text style={{ ...t.small }}>{pack.recommendedDurationMinutes} min recommended</Text>
            )}
            <Text style={t.small}>{questions.length} questions</Text>
          </View>
        </View>

        <View style={t.divider} />

        {/* Questions */}
        <Text style={t.h2}>Interview Questions</Text>
        {questions.map((q, i) => {
          const followUps = (q.followUps as Array<{ question: string }>) ?? []
          return (
            <View key={q.id} style={s.questionBox} wrap={false}>
              <View style={{ ...t.row, marginBottom: 6 }}>
                <Text style={{ ...t.small, marginRight: 8, marginTop: 1 }}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...t.text, fontFamily: 'Inter', fontWeight: 700 }}>
                    {q.questionText}
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: 4, gap: 4 }}>
                    <Text
                      style={{
                        ...s.diffBadge,
                        backgroundColor: colors.slate100,
                        color: colors.slate700,
                      }}
                    >
                      {q.questionType}
                    </Text>
                    <Text
                      style={{
                        ...s.diffBadge,
                        backgroundColor: colors.slate100,
                        color: DIFF_COLORS[q.difficulty] ?? colors.slate700,
                      }}
                    >
                      {q.difficulty}
                    </Text>
                    {q.cvReferences?.length ? (
                      <Text style={{ ...s.diffBadge, backgroundColor: colors.slate100, color: colors.slate500 }}>
                        personalised
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {q.rationale && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={t.label}>Why ask this</Text>
                  <Text style={t.text}>{q.rationale}</Text>
                </View>
              )}

              {followUps.length > 0 && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={t.label}>Follow-ups</Text>
                  {followUps.map((f, fi) => (
                    <Text key={fi} style={{ ...t.text, marginBottom: 2 }}>
                      → {f.question}
                    </Text>
                  ))}
                </View>
              )}

              {q.strongAnswerSignals?.length ? (
                <View style={{ ...s.signalBox, backgroundColor: colors.green50 }}>
                  <Text style={{ ...t.label, color: colors.green700 }}>Strong signals</Text>
                  {q.strongAnswerSignals.map((sig, si) => (
                    <Text key={si} style={{ ...t.text, color: colors.green700, marginBottom: 1 }}>
                      • {sig}
                    </Text>
                  ))}
                </View>
              ) : null}

              {/* Notes line for interviewer */}
              <View style={{ marginTop: 6, borderTop: `1pt dashed ${colors.slate200}`, paddingTop: 4 }}>
                <Text style={t.label}>Interviewer notes</Text>
                {q.notes ? (
                  <Text style={t.text}>{q.notes}</Text>
                ) : (
                  <Text style={{ ...t.small, color: colors.slate400 }}>
                    ________________________________________
                  </Text>
                )}
              </View>
            </View>
          )
        })}

        {/* Code challenge */}
        {codeChallenge && (
          <View>
            <Text style={t.h2}>Code Challenge</Text>
            <View style={t.card}>
              <Text style={{ ...t.h3, marginBottom: 2 }}>{codeChallenge.title}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Text style={{ ...s.statusBadge }}>{codeChallenge.language}</Text>
                {codeChallenge.estimatedMinutes && (
                  <Text style={t.small}>{codeChallenge.estimatedMinutes} min</Text>
                )}
              </View>

              <Text style={t.label}>Problem</Text>
              <Text style={{ ...t.text, marginBottom: 8 }}>{codeChallenge.problemDescription}</Text>

              <Text style={t.label}>Starter Code</Text>
              <View style={s.codeBlock}>
                <Text style={s.codeText}>{codeChallenge.starterCode}</Text>
              </View>

              {codeChallenge.evaluationCriteria && (
                <View style={{ marginTop: 8 }}>
                  <Text style={t.label}>Evaluation Criteria</Text>
                  <Text style={t.text}>{codeChallenge.evaluationCriteria}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={t.footer} fixed>
          <Text style={t.small}>SkillAI — Confidential</Text>
          <Text style={t.small} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
