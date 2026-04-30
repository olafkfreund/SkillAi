import path from 'path'
import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import './fonts' // side-effect: registers Inter + SplineSans font families
import { synechron } from './styles'
import type { SynechronCvData } from '@/lib/ai/synechron-schema'

// ---------------------------------------------------------------------------
// Asset paths (resolved at module load — paths are relative to project root,
// which is process.cwd() at PDF render time).
// ---------------------------------------------------------------------------

const ASSETS_DIR = path.join(process.cwd(), 'src', 'lib', 'pdf', 'assets')
const WORDMARK_PATH = path.join(ASSETS_DIR, 'synechron-wordmark.png')
const SIDEBAR_TEXTURE_PATH = path.join(ASSETS_DIR, 'synechron-sidebar-texture.png')

// ---------------------------------------------------------------------------
// Layout constants — A4 portrait. The sidebar bleeds to the left, top, and
// bottom edges. Page padding is set so main-column content starts to the
// right of the sidebar with a 36pt right margin.
// ---------------------------------------------------------------------------

const PAGE = {
  width: 595,
  height: 842,
} as const

const SIDEBAR = {
  width: 195,
  innerPaddingTop: 30,
  innerPaddingBottom: 30,
  innerPaddingLeft: 14,
  innerPaddingRight: 12,
} as const

const MAIN = {
  paddingTop: 36,
  paddingRight: 36,
  paddingBottom: 36,
  // The main column starts after the sidebar — page-level paddingLeft.
  paddingLeft: SIDEBAR.width + 16,
} as const

const FOOTER = {
  bottom: 18,
  right: 36,
} as const

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: 'SplineSans',
    fontSize: 10,
    color: synechron.text,
    backgroundColor: '#FFFFFF',
    paddingTop: MAIN.paddingTop,
    paddingBottom: MAIN.paddingBottom,
    paddingLeft: MAIN.paddingLeft,
    paddingRight: MAIN.paddingRight,
    position: 'relative',
  },

  // Fixed sidebar texture — appears on every page, full bleed left/top/bottom.
  sidebarFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR.width,
  },
  sidebarTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  // Page-1-only sidebar content. Absolutely positioned over the sidebar area
  // so it does NOT participate in main-column flow, but it is NOT marked
  // `fixed` so it appears on page 1 only.
  sidebarContent: {
    position: 'absolute',
    top: SIDEBAR.innerPaddingTop,
    left: SIDEBAR.innerPaddingLeft,
    width:
      SIDEBAR.width - SIDEBAR.innerPaddingLeft - SIDEBAR.innerPaddingRight,
  },

  // Sidebar typography
  sidebarHeading: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
    fontSize: 10.5,
    color: synechron.text,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sidebarHeadingFirst: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
    fontSize: 10.5,
    color: synechron.text,
    marginTop: 0,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sidebarOverallExperience: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
    fontSize: 10,
    color: synechron.text,
    textTransform: 'uppercase',
  },
  sidebarSkillRow: {
    fontFamily: 'SplineSans',
    fontSize: 9,
    color: synechron.text,
    lineHeight: 1.4,
    marginBottom: 3,
  },
  sidebarParagraph: {
    fontFamily: 'SplineSans',
    fontSize: 9,
    color: synechron.text,
    lineHeight: 1.4,
    marginBottom: 3,
  },
  sidebarBold: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
  },
  sidebarMuted: {
    fontFamily: 'SplineSans',
    fontSize: 9,
    color: synechron.text,
    opacity: 0.75,
    lineHeight: 1.4,
  },

  // Main column typography
  wordmark: {
    width: 140,
    height: 30,
    objectFit: 'contain',
  },
  candidateName: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
    fontSize: 22,
    color: synechron.text,
    marginTop: 10,
  },
  jobTitle: {
    fontFamily: 'SplineSans',
    fontSize: 12,
    color: synechron.text,
    marginTop: 2,
  },

  mainHeading: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
    fontSize: 10.5,
    color: synechron.text,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  paragraph: {
    fontFamily: 'SplineSans',
    fontSize: 9.5,
    color: synechron.text,
    lineHeight: 1.5,
    marginBottom: 3,
  },

  bulletRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  bulletSpacer: {
    width: 12,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontFamily: 'SplineSans',
    fontSize: 9.5,
    color: synechron.text,
    lineHeight: 1.5,
  },

  // Job entry block
  jobBlock: {
    marginBottom: 10,
  },
  jobRoleLine: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
    fontSize: 10.5,
    color: synechron.text,
  },
  jobCompanyLine: {
    fontFamily: 'SplineSans',
    fontSize: 10,
    color: synechron.text,
    marginTop: 1,
    marginBottom: 4,
  },
  jobDescription: {
    fontFamily: 'SplineSans',
    fontSize: 9.5,
    color: synechron.text,
    lineHeight: 1.5,
    marginBottom: 3,
  },
  keyAchievement: {
    fontFamily: 'SplineSans',
    fontSize: 9.5,
    color: synechron.text,
    lineHeight: 1.5,
    marginTop: 3,
    marginBottom: 3,
  },
  keyAchievementLabel: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
  },

  // Project entry
  projectBlock: {
    marginBottom: 8,
  },
  projectMetaLine: {
    fontFamily: 'SplineSans',
    fontSize: 9.5,
    color: synechron.text,
    marginBottom: 1,
  },
  projectMetaLabel: {
    fontFamily: 'SplineSans',
    fontWeight: 'bold',
  },

  // Footer (every page, fixed, bottom-right)
  footer: {
    position: 'absolute',
    bottom: FOOTER.bottom,
    right: FOOTER.right,
    fontFamily: 'SplineSans',
    fontSize: 9,
    color: synechron.text,
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/** Hanging-indent bullet — fixed-width spacer + flexed text. No glyph. */
function HangingBullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletSpacer} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

/** Same as HangingBullet but for sidebar (smaller font, tighter line). */
function SidebarParagraphLine({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sidebarParagraph}>{children}</Text>
}

// ---------------------------------------------------------------------------
// Sidebar (page 1 only)
// ---------------------------------------------------------------------------

function SidebarContent({ data }: { data: SynechronCvData }) {
  const overall = isNonEmpty(data.overallExperience) ? data.overallExperience : null
  const skills = data.skillsCategorised ?? []
  const certifications = data.trainingCertifications ?? []
  const achievements = data.achievements ?? []
  const education = data.education ?? []

  // Determine which section is the FIRST visible block — its heading should
  // not have a top margin so the sidebar starts cleanly.
  const overallVisible = !!overall
  const skillsVisible = skills.length > 0
  const certsVisible = certifications.length > 0
  const achievementsVisible = achievements.length > 0
  const educationVisible = education.length > 0

  return (
    <View style={styles.sidebarContent}>
      {overallVisible && (
        <Text style={styles.sidebarOverallExperience}>
          OVERALL EXPERIENCE : {overall}
        </Text>
      )}

      {skillsVisible && (
        <>
          <Text
            style={overallVisible ? styles.sidebarHeading : styles.sidebarHeadingFirst}
          >
            Technical Skills
          </Text>
          {skills.map((cat, i) => (
            <Text key={`${cat.category}-${i}`} style={styles.sidebarSkillRow}>
              <Text style={styles.sidebarBold}>{cat.category}: </Text>
              {cat.skills.join(', ')}
            </Text>
          ))}
        </>
      )}

      {certsVisible && (
        <>
          <Text
            style={
              overallVisible || skillsVisible
                ? styles.sidebarHeading
                : styles.sidebarHeadingFirst
            }
          >
            Training/Certifications
          </Text>
          {certifications.map((c, i) => (
            <SidebarParagraphLine key={`cert-${i}`}>{c}</SidebarParagraphLine>
          ))}
        </>
      )}

      {achievementsVisible && (
        <>
          <Text
            style={
              overallVisible || skillsVisible || certsVisible
                ? styles.sidebarHeading
                : styles.sidebarHeadingFirst
            }
          >
            Achievements
          </Text>
          {achievements.map((a, i) => (
            <SidebarParagraphLine key={`ach-${i}`}>{a}</SidebarParagraphLine>
          ))}
        </>
      )}

      {educationVisible && (
        <>
          <Text
            style={
              overallVisible ||
              skillsVisible ||
              certsVisible ||
              achievementsVisible
                ? styles.sidebarHeading
                : styles.sidebarHeadingFirst
            }
          >
            Education
          </Text>
          {education.map((e, i) => (
            <View key={`edu-${i}`} style={{ marginBottom: 4 }}>
              <Text style={[styles.sidebarParagraph, styles.sidebarBold]}>
                {e.degree}
              </Text>
              <Text style={styles.sidebarParagraph}>{e.institution}</Text>
              {isNonEmpty(e.year) && (
                <Text style={styles.sidebarMuted}>{e.year}</Text>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Employment + Project entries
// ---------------------------------------------------------------------------

type EmploymentEntry = NonNullable<SynechronCvData['employmentHistory']>[number]
type ProjectEntry = NonNullable<SynechronCvData['projects']>[number]

function EmploymentEntryBlock({ entry }: { entry: EmploymentEntry }) {
  const role = isNonEmpty(entry.role) ? entry.role : null
  const dates = isNonEmpty(entry.dates) ? entry.dates : null
  const company = isNonEmpty(entry.company) ? entry.company : null
  const location = isNonEmpty(entry.location) ? entry.location : null
  const description = isNonEmpty(entry.description) ? entry.description : null
  const responsibilities = entry.responsibilities ?? []
  const keyAchievement = isNonEmpty(entry.keyAchievement) ? entry.keyAchievement : null

  // Line 1: role | dates
  const line1Parts: string[] = []
  if (role) line1Parts.push(role)
  if (dates) line1Parts.push(dates)
  const line1 = line1Parts.join(' | ')

  // Line 2: company, location
  const line2Parts: string[] = []
  if (company) line2Parts.push(company)
  if (location) line2Parts.push(location)
  const line2 = line2Parts.join(', ')

  return (
    <View style={styles.jobBlock}>
      {line1 && <Text style={styles.jobRoleLine}>{line1}</Text>}
      {line2 && <Text style={styles.jobCompanyLine}>{line2}</Text>}

      {description && <Text style={styles.jobDescription}>{description}</Text>}

      {responsibilities.length > 0 &&
        responsibilities.map((r, i) => (
          <HangingBullet key={`resp-${i}`}>{r}</HangingBullet>
        ))}

      {keyAchievement && (
        <Text style={styles.keyAchievement}>
          <Text style={styles.keyAchievementLabel}>Key Achievement: </Text>
          {keyAchievement}
        </Text>
      )}
    </View>
  )
}

function ProjectEntryBlock({ entry }: { entry: ProjectEntry }) {
  const name = isNonEmpty(entry.name) ? entry.name : null
  const client = isNonEmpty(entry.client) ? entry.client : null
  const duration = isNonEmpty(entry.duration) ? entry.duration : null
  const projectRole = isNonEmpty(entry.role) ? entry.role : null
  const teamSize =
    entry.teamSize !== undefined && entry.teamSize !== null && String(entry.teamSize).trim() !== ''
      ? String(entry.teamSize)
      : null
  const environment = (() => {
    if (!entry.environment) return null
    if (Array.isArray(entry.environment)) {
      const filtered = entry.environment.filter((e) => isNonEmpty(e))
      return filtered.length > 0 ? filtered.join(', ') : null
    }
    return isNonEmpty(entry.environment) ? entry.environment : null
  })()
  const description = isNonEmpty(entry.description) ? entry.description : null
  const responsibilities = entry.responsibilities ?? []

  return (
    <View style={styles.projectBlock}>
      {name && (
        <Text style={[styles.projectMetaLine, styles.jobRoleLine]}>
          Project: {name}
        </Text>
      )}
      {client && (
        <Text style={styles.projectMetaLine}>
          <Text style={styles.projectMetaLabel}>Client: </Text>
          {client}
        </Text>
      )}
      {duration && (
        <Text style={styles.projectMetaLine}>
          <Text style={styles.projectMetaLabel}>Duration: </Text>
          {duration}
        </Text>
      )}
      {projectRole && (
        <Text style={styles.projectMetaLine}>
          <Text style={styles.projectMetaLabel}>Role: </Text>
          {projectRole}
        </Text>
      )}
      {teamSize && (
        <Text style={styles.projectMetaLine}>
          <Text style={styles.projectMetaLabel}>Team Size: </Text>
          {teamSize}
        </Text>
      )}
      {environment && (
        <Text style={styles.projectMetaLine}>
          <Text style={styles.projectMetaLabel}>Environment: </Text>
          {environment}
        </Text>
      )}

      {description && (
        <Text style={[styles.jobDescription, { marginTop: 3 }]}>{description}</Text>
      )}

      {responsibilities.length > 0 &&
        responsibilities.map((r, i) => (
          <HangingBullet key={`presp-${i}`}>{r}</HangingBullet>
        ))}
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
  // Derive job title — prefer explicit jobTitle, fall back to first employment role.
  const jobTitle = isNonEmpty(data.jobTitle)
    ? data.jobTitle
    : data.employmentHistory && data.employmentHistory.length > 0 && isNonEmpty(data.employmentHistory[0]?.role)
      ? data.employmentHistory[0]!.role!
      : null

  const synopsisBullets = data.synopsisBullets ?? []
  const employment = data.employmentHistory ?? []
  const projects = data.projects ?? []

  // Footer text: synechronId with hyphens stripped, e.g. SYNE-130693 → SYNE130693
  const footerText = synechronCandidateId
    ? String(synechronCandidateId).replace(/-/g, '')
    : ''

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Sidebar texture — fixed, repeats on every page */}
        <View style={styles.sidebarFixed} fixed>
          <Image src={SIDEBAR_TEXTURE_PATH} style={styles.sidebarTexture} />
        </View>

        {/* Sidebar content — page 1 only (non-fixed absolutely-positioned view) */}
        <SidebarContent data={data} />

        {/* Footer — fixed, every page, no page numbers */}
        {footerText !== '' && (
          <Text style={styles.footer} fixed>
            {footerText}
          </Text>
        )}

        {/* Main column header (page 1 only) */}
        <View>
          <Image src={WORDMARK_PATH} style={styles.wordmark} />
          {isNonEmpty(data.candidateName) && (
            <Text style={styles.candidateName}>{data.candidateName}</Text>
          )}
          {jobTitle && <Text style={styles.jobTitle}>{jobTitle}</Text>}
        </View>

        {/* Synopsis bullets */}
        {synopsisBullets.length > 0 && (
          <View style={{ marginTop: 16 }}>
            {synopsisBullets.map((b, i) => (
              <HangingBullet key={`syn-${i}`}>{b}</HangingBullet>
            ))}
          </View>
        )}

        {/* Employment history */}
        {employment.length > 0 && (
          <View>
            <Text style={styles.mainHeading}>Employment History</Text>
            {employment.map((entry, i) => (
              <EmploymentEntryBlock key={`emp-${i}`} entry={entry} />
            ))}
          </View>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <View>
            <Text style={styles.mainHeading}>Projects</Text>
            {projects.map((entry, i) => (
              <ProjectEntryBlock key={`proj-${i}`} entry={entry} />
            ))}
          </View>
        )}
      </Page>
    </Document>
  )
}
