import path from 'path'
import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import './fonts' // side-effect: registers Inter font family
import { synechron } from './styles'
import type { SynechronCvData } from '@/lib/ai/synechron-schema'

// Resolve PNG asset path — relative to project root (process.cwd()).
const LOGO_PATH = path.join(process.cwd(), 'src', 'lib', 'pdf', 'assets', 'synechron-logo.png')

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: synechron.darkGrey,
    paddingTop: 80, // room for top decorations + wordmark
    paddingBottom: 50, // room for footer + bottom decoration
    paddingHorizontal: 40,
    position: 'relative',
  },

  wordmark: {
    position: 'absolute',
    top: 24,
    right: 32,
    width: 100,
  },

  // Top-left yellow shape
  cornerYellowTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: synechron.yellow,
    width: 80,
    height: 30,
  },

  // Top-right grey shape
  cornerGreyTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: synechron.darkGrey,
    width: 60,
    height: 24,
    opacity: 0.85,
  },

  // Bottom-left grey shape
  cornerGreyBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: synechron.darkGrey,
    width: 50,
    height: 20,
    opacity: 0.85,
  },

  body: {
    flexDirection: 'row',
    gap: 16,
  },

  sidebar: {
    flex: 0.30,
    backgroundColor: synechron.lightGrey,
    padding: 12,
    borderRadius: 4,
  },

  main: {
    flex: 0.70,
    paddingLeft: 8,
  },

  sidebarHeading: {
    fontSize: 9,
    fontWeight: 700,
    color: synechron.darkGrey,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
  },

  sidebarSubHeading: {
    fontSize: 9,
    fontWeight: 600,
    color: synechron.darkGrey,
    marginTop: 4,
    marginBottom: 2,
  },

  candidateName: {
    fontSize: 22,
    fontWeight: 700,
    color: synechron.darkGrey,
    marginBottom: 2,
  },

  jobTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: synechron.darkGrey,
    marginBottom: 18,
  },

  mainHeading: {
    fontSize: 11,
    fontWeight: 700,
    color: synechron.darkGrey,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: synechron.yellow,
    paddingBottom: 2,
  },

  bullet: {
    fontSize: 10,
    marginBottom: 2,
    paddingLeft: 8,
    lineHeight: 1.4,
  },

  text: {
    fontSize: 10,
    marginBottom: 2,
    lineHeight: 1.4,
  },

  // Employment entry
  job: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: synechron.darkGrey,
  },
  jobHeader: {
    fontSize: 11,
    fontWeight: 600,
    color: synechron.darkGrey,
  },
  jobMeta: {
    fontSize: 9,
    color: '#666',
    marginBottom: 4,
  },
  jobLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: synechron.darkGrey,
    marginTop: 4,
    marginBottom: 2,
  },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
  },
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type EmploymentEntryType = NonNullable<SynechronCvData['employmentHistory']>[number]

function EmploymentEntry({ entry }: { entry: EmploymentEntryType }) {
  // Build the meta line (dates · client · team size · duration) skipping empties
  const metaParts = [entry.dates, entry.client, entry.teamSize, entry.duration].filter(
    (p): p is string => Boolean(p && p.trim())
  )

  const hasResponsibilities = entry.responsibilities && entry.responsibilities.length > 0
  const hasSkills = entry.skills && entry.skills.length > 0
  const hasHeader = entry.role || entry.company

  return (
    <View style={styles.job} wrap={false}>
      {hasHeader && (
        <Text style={styles.jobHeader}>
          {entry.role}
          {entry.role && entry.company ? ' — ' : ''}
          {entry.company}
        </Text>
      )}

      {metaParts.length > 0 && <Text style={styles.jobMeta}>{metaParts.join(' · ')}</Text>}

      {entry.description && entry.description.trim() && (
        <Text style={styles.text}>{entry.description}</Text>
      )}

      {hasResponsibilities && (
        <View>
          <Text style={styles.jobLabel}>Responsibilities</Text>
          {entry.responsibilities!.map((r, i) => (
            <Text key={i} style={styles.bullet}>
              • {r}
            </Text>
          ))}
        </View>
      )}

      {hasSkills && (
        <View>
          <Text style={styles.jobLabel}>Skills</Text>
          <Text style={styles.text}>{entry.skills!.join(', ')}</Text>
        </View>
      )}
    </View>
  )
}

function SidebarSection({ heading, items }: { heading: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <View>
      <Text style={styles.sidebarHeading}>{heading}</Text>
      {items.map((item, i) => (
        <Text key={i} style={styles.text}>
          • {item}
        </Text>
      ))}
    </View>
  )
}

function SidebarText({ heading, value }: { heading: string; value?: string | null }) {
  if (!value || !value.trim()) return null
  return (
    <View>
      <Text style={styles.sidebarHeading}>{heading}</Text>
      <Text style={styles.text}>{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export interface SynechronCvPDFProps {
  data: SynechronCvData
  synechronCandidateId?: string | null
}

export function SynechronCvPDF({ data, synechronCandidateId }: SynechronCvPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Wordmark — fixed top-right on every page */}
        <Image src={LOGO_PATH} style={styles.wordmark} fixed />

        {/* Corner decorations — fixed so they appear on every page */}
        <View style={styles.cornerYellowTL} fixed />
        <View style={styles.cornerGreyTR} fixed />
        <View style={styles.cornerGreyBL} fixed />

        {/* Page footer with optional SYNE-#### identifier */}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            synechronCandidateId
              ? `${synechronCandidateId} — ${pageNumber} / ${totalPages}`
              : `${pageNumber} / ${totalPages}`
          }
        />

        {/* Body: two-column */}
        <View style={styles.body}>
          {/* Sidebar (30%) */}
          <View style={styles.sidebar}>
            <SidebarText heading="Overall Experience" value={data.overallExperience} />
            <SidebarText heading="Relevant Experience" value={data.relevantExperience} />

            {data.skillsCategorised && data.skillsCategorised.length > 0 && (
              <View>
                <Text style={styles.sidebarHeading}>Skills</Text>
                {data.skillsCategorised.map((cat) => (
                  <View key={cat.category}>
                    <Text style={styles.sidebarSubHeading}>{cat.category}</Text>
                    <Text style={styles.text}>{cat.skills.join(', ')}</Text>
                  </View>
                ))}
              </View>
            )}

            <SidebarSection heading="Domains" items={data.domains} />
            <SidebarSection heading="Achievements" items={data.achievements} />

            {data.education && data.education.length > 0 && (
              <View>
                <Text style={styles.sidebarHeading}>Education</Text>
                {data.education.map((e, i) => (
                  <Text key={i} style={styles.text}>
                    {e.degree}, {e.institution}
                    {e.year ? ` (${e.year})` : ''}
                  </Text>
                ))}
              </View>
            )}

            <SidebarText heading="Visa" value={data.visa} />
            <SidebarSection
              heading="Training / Certifications"
              items={data.trainingCertifications}
            />
          </View>

          {/* Main (70%) */}
          <View style={styles.main}>
            {data.candidateName && (
              <Text style={styles.candidateName}>{data.candidateName}</Text>
            )}
            {data.jobTitle && <Text style={styles.jobTitle}>{data.jobTitle}</Text>}

            {data.synopsisBullets && data.synopsisBullets.length > 0 && (
              <View>
                <Text style={styles.mainHeading}>Synopsis</Text>
                {data.synopsisBullets.map((b, i) => (
                  <Text key={i} style={styles.bullet}>
                    • {b}
                  </Text>
                ))}
              </View>
            )}

            {data.employmentHistory && data.employmentHistory.length > 0 && (
              <View>
                <Text style={styles.mainHeading}>Employment History</Text>
                {data.employmentHistory.map((entry, i) => (
                  <EmploymentEntry key={i} entry={entry} />
                ))}
              </View>
            )}
          </View>
        </View>
      </Page>
    </Document>
  )
}
