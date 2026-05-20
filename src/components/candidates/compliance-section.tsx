'use client'

/**
 * ComplianceSection — Compliance & Eligibility collapsible form section.
 *
 * Recruiter-only: returns null for any other audience.
 * Used by both CandidateUploadForm (create) and EditDetailsForm (edit).
 *
 * Usage:
 *   <ComplianceSection
 *     audience="recruiter"
 *     disabled={pending}
 *     fields={complianceFields}
 *     onChange={setComplianceFields}
 *   />
 */

import { useState } from 'react'
import { ChevronDownIcon, ShieldCheckIcon } from 'lucide-react'
import type { RightToWorkStatus, RightToWorkDocumentType, GdprProcessingConsentBy } from '@/db/schema/candidates'

export interface ComplianceFields {
  rightToWorkStatus: RightToWorkStatus | ''
  rightToWorkDocumentType: RightToWorkDocumentType | ''
  rightToWorkExpiry: string
  shareCode: string
  sponsorshipRequired: boolean
  nationality: string
  noticePeriodDays: string
  gdprProcessingConsentAt: string
  gdprProcessingConsentBy: GdprProcessingConsentBy | ''
}

export const DEFAULT_COMPLIANCE_FIELDS: ComplianceFields = {
  rightToWorkStatus: '',
  rightToWorkDocumentType: '',
  rightToWorkExpiry: '',
  shareCode: '',
  sponsorshipRequired: false,
  nationality: '',
  noticePeriodDays: '',
  gdprProcessingConsentAt: '',
  gdprProcessingConsentBy: '',
}

interface ComplianceSectionProps {
  audience?: 'recruiter' | 'customer' | 'manager'
  disabled?: boolean
  fields: ComplianceFields
  onChange: (fields: ComplianceFields) => void
}

// Input className shared across all text/select/date inputs in this section
const inputCls =
  'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] ' +
  'text-[var(--color-fg)] px-3 py-2 text-sm placeholder:text-[var(--color-fg-subtle)] ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
  'disabled:opacity-50'

const labelCls = 'block text-xs font-medium text-[var(--color-fg-muted)] mb-1'
const helpCls = 'mt-1 text-xs text-[var(--color-fg-subtle)]'

export function ComplianceSection({ audience, disabled = false, fields, onChange }: ComplianceSectionProps) {
  // Gate: only recruiter sees compliance data
  if (audience !== 'recruiter') return null

  const [open, setOpen] = useState(false)

  function set<K extends keyof ComplianceFields>(key: K, value: ComplianceFields[K]) {
    onChange({ ...fields, [key]: value })
  }

  return (
    <div className="border-t border-[var(--color-bg-input)] pt-4 mt-2">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="compliance-section-body"
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
          <span className="text-sm font-medium text-[var(--color-fg-muted)]">
            Compliance &amp; Eligibility
          </span>
          <span className="text-xs text-[var(--color-fg-subtle)]">(optional)</span>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-[var(--color-fg-subtle)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div id="compliance-section-body" className="mt-4 space-y-5">

          {/* ── Right to Work ─────────────────────────────────────── */}
          <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
              Right to Work
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Status */}
              <div>
                <label htmlFor="rtw-status" className={labelCls}>
                  Status
                </label>
                <select
                  id="rtw-status"
                  name="rightToWorkStatus"
                  disabled={disabled}
                  value={fields.rightToWorkStatus}
                  onChange={(e) => set('rightToWorkStatus', e.target.value as RightToWorkStatus | '')}
                  className={inputCls}
                >
                  <option value="">— Not checked —</option>
                  <option value="checked">Checked — verified</option>
                  <option value="pending">Pending — awaiting documents</option>
                  <option value="fail">Fail — no right to work</option>
                  <option value="exempted">
                    Exempted — e.g. UK/EEA pre-settled, settled status
                  </option>
                  <option value="not_required">Not required — internal / EEA citizen</option>
                </select>
                {fields.rightToWorkStatus === 'exempted' && (
                  <p className={helpCls}>
                    Exempted applies to candidates with UK Settled Status, Pre-Settled Status, or
                    EEA citizenship where no active check is required under current guidance.
                  </p>
                )}
              </div>

              {/* Document type */}
              <div>
                <label htmlFor="rtw-doc-type" className={labelCls}>
                  Document type
                </label>
                <select
                  id="rtw-doc-type"
                  name="rightToWorkDocumentType"
                  disabled={disabled}
                  value={fields.rightToWorkDocumentType}
                  onChange={(e) =>
                    set('rightToWorkDocumentType', e.target.value as RightToWorkDocumentType | '')
                  }
                  className={inputCls}
                >
                  <option value="">— None selected —</option>
                  <option value="passport_uk">UK Passport</option>
                  <option value="passport_eu">EU Passport</option>
                  <option value="passport_other">Other Passport</option>
                  <option value="brp">Biometric Residence Permit (BRP)</option>
                  <option value="share_code">Online Share Code</option>
                  <option value="visa">Visa / Entry clearance</option>
                  <option value="settled_status">UK Settled Status (EUSS)</option>
                  <option value="presettled_status">UK Pre-Settled Status (EUSS)</option>
                  <option value="other">Other document</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Expiry date */}
              <div>
                <label htmlFor="rtw-expiry" className={labelCls}>
                  Document / visa expiry
                  <span className="ml-1 text-[var(--color-fg-subtle)] font-normal">(if time-limited)</span>
                </label>
                <input
                  id="rtw-expiry"
                  name="rightToWorkExpiry"
                  type="date"
                  disabled={disabled}
                  value={fields.rightToWorkExpiry}
                  onChange={(e) => set('rightToWorkExpiry', e.target.value)}
                  className={inputCls}
                />
                <p className={helpCls}>
                  Leave blank for indefinite leave to remain, settled status, or UK/EU passports.
                </p>
              </div>

              {/* Share code */}
              <div>
                <label htmlFor="rtw-share-code" className={labelCls}>
                  UK Online Right-to-Work Share Code
                </label>
                <input
                  id="rtw-share-code"
                  name="shareCode"
                  type="text"
                  disabled={disabled}
                  value={fields.shareCode}
                  onChange={(e) => set('shareCode', e.target.value.toUpperCase())}
                  placeholder="W12-3AB-C45"
                  maxLength={20}
                  aria-describedby="share-code-help"
                  className={inputCls}
                />
                <p id="share-code-help" className={helpCls}>
                  9-character code issued by the Home Office: format{' '}
                  <code className="font-mono">WWW-WWW-WWW</code> (letters &amp; digits, no spaces).
                  Obtained from{' '}
                  <span className="underline decoration-dotted">
                    view.right-to-work.service.gov.uk
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>

          {/* ── Eligibility Signals ────────────────────────────────── */}
          <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
              Eligibility Signals
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Nationality */}
              <div>
                <label htmlFor="compliance-nationality" className={labelCls}>
                  Nationality
                </label>
                <input
                  id="compliance-nationality"
                  name="nationality"
                  type="text"
                  disabled={disabled}
                  value={fields.nationality}
                  onChange={(e) => set('nationality', e.target.value)}
                  placeholder="British"
                  maxLength={100}
                  className={inputCls}
                />
              </div>

              {/* Notice period */}
              <div>
                <label htmlFor="notice-period-days" className={labelCls}>
                  Notice period (days)
                </label>
                <input
                  id="notice-period-days"
                  name="noticePeriodDays"
                  type="number"
                  min={0}
                  max={365}
                  disabled={disabled}
                  value={fields.noticePeriodDays}
                  onChange={(e) => set('noticePeriodDays', e.target.value)}
                  placeholder="30"
                  className={inputCls}
                />
                <p className={helpCls}>
                  Calendar days from acceptance to start date. Leave blank if unknown.
                </p>
              </div>
            </div>

            {/* Sponsorship required toggle */}
            <div className="flex items-start gap-3 pt-1">
              <button
                type="button"
                role="switch"
                id="sponsorship-required"
                aria-checked={fields.sponsorshipRequired}
                disabled={disabled}
                onClick={() => set('sponsorshipRequired', !fields.sponsorshipRequired)}
                className={[
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                  'focus:ring-offset-[var(--color-bg-app)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  fields.sponsorshipRequired ? 'bg-blue-600' : 'bg-[var(--color-border)]',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0',
                    'transition duration-200 ease-in-out',
                    fields.sponsorshipRequired ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
              {/* Hidden field so the value is submitted in FormData */}
              <input
                type="hidden"
                name="sponsorshipRequired"
                value={fields.sponsorshipRequired ? 'true' : 'false'}
              />
              <div>
                <label
                  htmlFor="sponsorship-required"
                  className="text-sm font-medium text-[var(--color-fg)] cursor-pointer"
                >
                  Visa sponsorship required
                </label>
                <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                  Candidate would need a Skilled Worker / Tier 2 sponsorship to take this role.
                </p>
              </div>
            </div>
          </div>

          {/* ── GDPR Consent ───────────────────────────────────────── */}
          <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
              GDPR Processing Consent
            </p>
            <p className="text-xs text-[var(--color-fg-subtle)]">
              Record when and how consent to process this candidate&apos;s personal data was obtained,
              per GDPR Article 6(1)(a). Required for any candidate whose data was not received via a
              legitimate-interest route (e.g. direct application).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Consent date */}
              <div>
                <label htmlFor="gdpr-consent-at" className={labelCls}>
                  Consent recorded on
                </label>
                <input
                  id="gdpr-consent-at"
                  name="gdprProcessingConsentAt"
                  type="date"
                  disabled={disabled}
                  value={fields.gdprProcessingConsentAt}
                  onChange={(e) => set('gdprProcessingConsentAt', e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Consent by — radio group */}
              <div>
                <p className={`${labelCls} mb-2`}>Consent provided by</p>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      { value: 'candidate', label: 'Candidate (self-consent)' },
                      { value: 'recruiter', label: 'Recruiter (verbal / email)' },
                      { value: 'agency', label: 'Agency (contract clause)' },
                    ] as { value: GdprProcessingConsentBy; label: string }[]
                  ).map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-fg)]"
                    >
                      <input
                        type="radio"
                        name="gdprProcessingConsentBy"
                        value={value}
                        disabled={disabled}
                        checked={fields.gdprProcessingConsentBy === value}
                        onChange={() => set('gdprProcessingConsentBy', value)}
                        className="h-4 w-4 border-[var(--color-border)] text-blue-600
                                   focus:ring-2 focus:ring-blue-500
                                   focus:ring-offset-[var(--color-bg-elevated)]
                                   disabled:opacity-50"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
