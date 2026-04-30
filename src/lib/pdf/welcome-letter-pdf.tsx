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
import type { WelcomeLetter } from '@/lib/ai/welcome-letter-schemas'

// Local overrides of shared `base` styles so Inter is used for all text.
// The built-in Helvetica core font lacks Latin Extended-A glyphs — Polish
// diacritics (ł, ę, ż, etc.) render as missing-glyph squares without this.
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

// Component-local style compositions — derived from base tokens only, no new colors.
const s = StyleSheet.create({
  // Header card: full-width bordered area with slight tint
  headerCard: {
    ...base.card,
    backgroundColor: colors.slate50,
    marginBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  langBadge: {
    ...base.badge,
    fontFamily: 'Inter',
    fontWeight: 700,
    backgroundColor: colors.violet50,
    color: colors.violet700,
  },
  tenantLabel: {
    ...base.small,
    fontFamily: 'Inter',
    color: colors.slate400,
  },
  roleLabel: {
    ...base.small,
    fontFamily: 'Inter',
    color: colors.slate500,
    marginTop: 4,
  },
  // Process section: individual process cards
  processCard: {
    ...base.card,
    marginBottom: 6,
  },
  // STAR callout block: violet tint
  starCallout: {
    ...base.card,
    backgroundColor: colors.violet50,
    marginBottom: 6,
  },
  starRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  starLetter: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 10,
    color: colors.violet700,
    width: 20,
    flexShrink: 0,
  },
  starBody: {
    ...base.text,
    fontFamily: 'Inter',
    flex: 1,
    color: colors.slate700,
  },
  // Worked example sub-block: slate tint
  workedExampleCard: {
    ...base.card,
    backgroundColor: colors.slate50,
    marginTop: 4,
  },
  // Tips & tricks: numbered item row
  tipRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  tipNumber: {
    ...base.small,
    fontFamily: 'Inter',
    fontWeight: 700,
    width: 18,
    flexShrink: 0,
    color: colors.slate500,
    marginTop: 1,
  },
  tipContent: {
    flex: 1,
  },
  tipHeading: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 10,
    color: colors.slate900,
    marginBottom: 2,
  },
  // Gaps to bridge: bulleted row
  gapRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  gapBullet: {
    ...base.small,
    fontFamily: 'Inter',
    width: 12,
    flexShrink: 0,
    color: colors.amber700,
    marginTop: 1,
  },
  gapArea: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 10,
    color: colors.slate900,
  },
  gapSuggestion: {
    ...base.text,
    fontFamily: 'Inter',
    color: colors.slate700,
    marginTop: 1,
  },
  // Motivation: green emphasis card
  motivationCard: {
    ...base.card,
    backgroundColor: colors.green50,
    marginBottom: 10,
  },
  motivationText: {
    ...base.text,
    fontFamily: 'Inter',
    color: colors.green700,
  },
  // Signoff: right-aligned, slightly larger top margin
  signoffContainer: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  signoffText: {
    ...base.text,
    fontFamily: 'Inter',
    color: colors.slate700,
    fontStyle: 'italic',
  },
})

type Props = {
  letter: WelcomeLetter
  candidateFullName: string   // for footer
  roleTitle: string | null    // null when no role context selected
  tenantName: string          // branding line in header
  language: string            // BCP 47 short code, e.g. 'pl' — displayed as uppercase badge
}

export function WelcomeLetterPDF({
  letter,
  candidateFullName,
  roleTitle,
  tenantName,
  language,
}: Props) {
  return (
    <Document title={`Welcome Letter — ${candidateFullName}`}>
      <Page size="A4" style={t.page}>

        {/* ── 1. Header card ── */}
        <View style={s.headerCard} wrap={false}>
          <View style={s.headerTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={t.h1}>Welcome — preparing for your interview</Text>
              <Text style={s.langBadge}>{language.toUpperCase()}</Text>
            </View>
            <Text style={s.tenantLabel}>{tenantName}</Text>
          </View>

          {/* greeting */}
          <Text style={{ ...t.h2, marginTop: 0 }}>{letter.greeting}</Text>

          {/* intro paragraph */}
          <Text style={t.text}>{letter.intro}</Text>

          {/* optional role context line */}
          {roleTitle !== null && (
            <Text style={s.roleLabel}>Role: {roleTitle}</Text>
          )}
        </View>

        <View style={t.divider} />

        {/* ── 2. Interview process ── */}
        <View wrap={false}>
          <Text style={t.h2}>{letter.interviewProcess.title}</Text>
        </View>
        {letter.interviewProcess.sections.map((section, i) => (
          <View key={i} style={s.processCard} wrap={false}>
            <Text style={t.h3}>{section.heading}</Text>
            <Text style={t.text}>{section.body}</Text>
          </View>
        ))}

        {/* ── 3. Karat section (conditional) ── */}
        {letter.karatSection !== null && (
          <View>
            <View wrap={false}>
              <Text style={t.h2}>{letter.karatSection.title}</Text>
            </View>
            <View style={t.card} wrap={false}>
              <View style={{ marginBottom: 8 }}>
                <Text style={t.label}>What it is</Text>
                <Text style={t.text}>{letter.karatSection.whatItIs}</Text>
              </View>
              <View style={{ marginBottom: 8 }}>
                <Text style={t.label}>What to expect</Text>
                <Text style={t.text}>{letter.karatSection.whatToExpect}</Text>
              </View>
              <Text style={{ ...t.small, color: colors.slate400 }}>
                Reference: {letter.karatSection.link}
              </Text>
            </View>
          </View>
        )}

        {/* ── 4. STAR format ── */}
        <View wrap={false}>
          <Text style={t.h2}>{letter.starFormat.title}</Text>
          <Text style={{ ...t.text, marginBottom: 8 }}>{letter.starFormat.description}</Text>
        </View>

        {/* STAR rows callout */}
        <View style={s.starCallout} wrap={false}>
          <View style={s.starRow}>
            <Text style={s.starLetter}>S —</Text>
            <View style={s.starBody}>
              <Text style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: colors.violet700, marginBottom: 1 }}>
                Situation
              </Text>
              <Text style={s.starBody}>{letter.starFormat.situation}</Text>
            </View>
          </View>
          <View style={s.starRow}>
            <Text style={s.starLetter}>T —</Text>
            <View style={s.starBody}>
              <Text style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: colors.violet700, marginBottom: 1 }}>
                Task
              </Text>
              <Text style={s.starBody}>{letter.starFormat.task}</Text>
            </View>
          </View>
          <View style={s.starRow}>
            <Text style={s.starLetter}>A —</Text>
            <View style={s.starBody}>
              <Text style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: colors.violet700, marginBottom: 1 }}>
                Action
              </Text>
              <Text style={s.starBody}>{letter.starFormat.action}</Text>
            </View>
          </View>
          <View style={{ ...s.starRow, marginBottom: 0 }}>
            <Text style={s.starLetter}>R —</Text>
            <View style={s.starBody}>
              <Text style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: colors.violet700, marginBottom: 1 }}>
                Result
              </Text>
              <Text style={s.starBody}>{letter.starFormat.result}</Text>
            </View>
          </View>
        </View>

        {/* Worked example sub-block */}
        <View style={s.workedExampleCard} wrap={false}>
          <Text style={t.label}>Worked example</Text>
          <Text style={t.text}>{letter.starFormat.workedExample}</Text>
        </View>

        {/* ── 5. Tips & tricks ── */}
        <View wrap={false}>
          <Text style={t.h2}>Tips &amp; Tricks</Text>
        </View>
        {letter.tipsAndTricks.map((tip, i) => (
          <View key={i} style={s.tipRow} wrap={false}>
            <Text style={s.tipNumber}>{i + 1}.</Text>
            <View style={s.tipContent}>
              <Text style={s.tipHeading}>{tip.heading}</Text>
              <Text style={t.text}>{tip.body}</Text>
            </View>
          </View>
        ))}

        {/* ── 6. Gaps to bridge (conditional) ── */}
        {letter.gapsToBridge.length > 0 && (
          <View>
            <View wrap={false}>
              <Text style={t.h2}>Areas to brush up on</Text>
            </View>
            {letter.gapsToBridge.map((gap, i) => (
              <View key={i} style={s.gapRow} wrap={false}>
                <Text style={s.gapBullet}>•</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.gapArea}>{gap.area}</Text>
                  <Text style={s.gapSuggestion}>{gap.suggestion}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── 7. Motivation ── */}
        <View style={s.motivationCard} wrap={false}>
          <Text style={s.motivationText}>{letter.motivation}</Text>
        </View>

        {/* ── 8. Signoff ── */}
        <View style={s.signoffContainer} wrap={false}>
          <Text style={s.signoffText}>{letter.signoff}</Text>
        </View>

        {/* ── Fixed footer ── */}
        <View style={t.footer} fixed>
          <Text style={t.small}>
            SkillAI · Confidential — prepared for {candidateFullName}
          </Text>
          <Text
            style={t.small}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
