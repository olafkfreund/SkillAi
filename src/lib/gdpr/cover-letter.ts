/**
 * GDPR Article 15 DSAR cover letter generator.
 *
 * Pure function — no I/O, no DB access. Returns a plain ASCII README.txt
 * body that is bundled into every DSAR ZIP export.
 */

type CoverLetterParams = {
  candidateName: string
  candidateId: string
  exportDate: string   // ISO-8601 timestamp
  files: string[]      // list of filenames that were included in the archive
}

export function getDsarCoverLetter({
  candidateName,
  candidateId,
  exportDate,
  files,
}: CoverLetterParams): string {
  const fileDescriptions: Record<string, string> = {
    'candidate.json': 'Your candidate record including parsed CV text, contact details, status, agency assignment, and day rate',
    'scores.json': 'All AI scoring runs against any role this candidate was evaluated for, including per-dimension scores and AI reasoning',
    'notes.json': 'Recruiter notes associated with this candidate profile',
    'enrichment.json': 'Web intelligence data gathered about this candidate (e.g. GitHub profile, public web mentions)',
    'cv-profile.json': 'Structured CV profile extracted by AI from the uploaded CV document',
    'audit-log.json': 'Audit trail of system events related to this candidate (uploads, status changes, logins that accessed this record)',
    'sent-emails.json': 'Record of emails sent to this candidate via the platform',
    'interview-packs.json': 'AI-generated interview question packs and code challenges created for this candidate',
    'interview-slots.json': 'Interview scheduling slots booked for this candidate',
    'interview-transcripts.json': 'Interview transcript files uploaded and any AI analysis results',
    'approvals.json': 'Hiring manager approval decisions recorded for this candidate',
    'synechron-cv.json': 'Structured CV data extracted in Synechron format',
  }

  // File index — one line per file included in the archive
  const fileIndex = files
    .filter((f) => f !== 'README.txt')
    .map((f) => {
      const desc = fileDescriptions[f] ?? 'Associated data file'
      return `  - ${f}: ${desc}`
    })
    .join('\n')

  return [
    'GDPR Article 15 -- Right of Access -- Subject Access Request Export',
    '====================================================================',
    '',
    'This archive was generated in response to a Subject Access Request (SAR) under',
    'Article 15 of the General Data Protection Regulation (GDPR). It contains all',
    'personal data held about the data subject in the SkillAI recruiting platform.',
    '',
    'DATA SUBJECT INFORMATION',
    '------------------------',
    `  Name       : ${candidateName}`,
    `  Record ID  : ${candidateId}`,
    `  Export date: ${exportDate}`,
    '',
    'FILES IN THIS ARCHIVE',
    '---------------------',
    fileIndex,
    '',
    'YOUR RIGHTS',
    '-----------',
    'Under GDPR you have the right to:',
    '  - Rectification (Article 16): correct inaccurate personal data',
    '  - Erasure (Article 17): request deletion of your personal data',
    '  - Restriction of processing (Article 18)',
    '  - Data portability (Article 20)',
    '  - Object to processing (Article 21)',
    '',
    'CONTACT',
    '-------',
    'For questions about this export, to exercise any of the above rights, or to',
    'raise a concern about how your data is processed, please contact:',
    '  privacy@your-organisation.example',
    '',
    'You also have the right to lodge a complaint with your national data protection',
    'supervisory authority.',
    '',
    '====================================================================',
    'End of cover letter.',
  ].join('\n')
}
