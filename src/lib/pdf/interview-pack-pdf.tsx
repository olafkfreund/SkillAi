import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { base, colors } from './styles'
import type { InterviewPack, InterviewQuestion, CodeChallenge } from '@/db/schema'

const s = StyleSheet.create({
  statusBadge: {
    ...base.badge,
    backgroundColor: colors.violet50,
    color: colors.violet700,
  },
  diffBadge: {
    ...base.badge,
    marginRight: 4,
  },
  questionBox: {
    ...base.card,
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
      <Page size="A4" style={base.page}>
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={base.h1}>Interview Pack</Text>
          <Text style={{ ...base.text, marginTop: 2 }}>
            {candidateName} · {roleTitle}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {pack.experienceLevel && (
              <Text style={{ ...s.statusBadge }}>{pack.experienceLevel} level</Text>
            )}
            {pack.recommendedDurationMinutes && (
              <Text style={{ ...base.small }}>{pack.recommendedDurationMinutes} min recommended</Text>
            )}
            <Text style={base.small}>{questions.length} questions</Text>
          </View>
        </View>

        <View style={base.divider} />

        {/* Questions */}
        <Text style={base.h2}>Interview Questions</Text>
        {questions.map((q, i) => {
          const followUps = (q.followUps as Array<{ question: string }>) ?? []
          return (
            <View key={q.id} style={s.questionBox} wrap={false}>
              <View style={{ ...base.row, marginBottom: 6 }}>
                <Text style={{ ...base.small, marginRight: 8, marginTop: 1 }}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...base.text, fontFamily: 'Helvetica-Bold' }}>
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
                  <Text style={base.label}>Why ask this</Text>
                  <Text style={base.text}>{q.rationale}</Text>
                </View>
              )}

              {followUps.length > 0 && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={base.label}>Follow-ups</Text>
                  {followUps.map((f, fi) => (
                    <Text key={fi} style={{ ...base.text, marginBottom: 2 }}>
                      → {f.question}
                    </Text>
                  ))}
                </View>
              )}

              {q.strongAnswerSignals?.length ? (
                <View style={{ ...s.signalBox, backgroundColor: colors.green50 }}>
                  <Text style={{ ...base.label, color: colors.green700 }}>Strong signals</Text>
                  {q.strongAnswerSignals.map((sig, si) => (
                    <Text key={si} style={{ ...base.text, color: colors.green700, marginBottom: 1 }}>
                      • {sig}
                    </Text>
                  ))}
                </View>
              ) : null}

              {/* Notes line for interviewer */}
              <View style={{ marginTop: 6, borderTop: `1pt dashed ${colors.slate200}`, paddingTop: 4 }}>
                <Text style={base.label}>Interviewer notes</Text>
                {q.notes ? (
                  <Text style={base.text}>{q.notes}</Text>
                ) : (
                  <Text style={{ ...base.small, color: colors.slate400 }}>
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
            <Text style={base.h2}>Code Challenge</Text>
            <View style={base.card}>
              <Text style={{ ...base.h3, marginBottom: 2 }}>{codeChallenge.title}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Text style={{ ...s.statusBadge }}>{codeChallenge.language}</Text>
                {codeChallenge.estimatedMinutes && (
                  <Text style={base.small}>{codeChallenge.estimatedMinutes} min</Text>
                )}
              </View>

              <Text style={base.label}>Problem</Text>
              <Text style={{ ...base.text, marginBottom: 8 }}>{codeChallenge.problemDescription}</Text>

              <Text style={base.label}>Starter Code</Text>
              <View style={s.codeBlock}>
                <Text style={s.codeText}>{codeChallenge.starterCode}</Text>
              </View>

              {codeChallenge.evaluationCriteria && (
                <View style={{ marginTop: 8 }}>
                  <Text style={base.label}>Evaluation Criteria</Text>
                  <Text style={base.text}>{codeChallenge.evaluationCriteria}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={base.footer} fixed>
          <Text style={base.small}>SkillAI — Confidential</Text>
          <Text style={base.small} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
