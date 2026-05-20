'use client'

import { useState, useActionState } from 'react'
import { Loader2, PencilIcon, ChevronDownIcon } from 'lucide-react'
import { updateCandidateDetails } from '@/actions/candidates'
import type { UpdateCandidateState } from '@/actions/candidates'
import { ComplianceSection, DEFAULT_COMPLIANCE_FIELDS } from './compliance-section'
import type { ComplianceFields } from './compliance-section'
import type { RightToWorkStatus, RightToWorkDocumentType, GdprProcessingConsentBy } from '@/db/schema/candidates'

interface CandidateDetails {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  agencyId: string | null
  country: string | null
  city: string | null
  languagesSpoken: string[]
  willingToRelocate: boolean | null
  candidateRate: string | null
  customerRate: string | null
  rateCurrency: string | null
  availabilityStatus?: 'available' | 'on_project' | 'unavailable' | null
  availableFrom?: string | null
  // Compliance fields — optional; populated when #191 migration is applied
  rightToWorkStatus?: RightToWorkStatus | null
  rightToWorkDocumentType?: RightToWorkDocumentType | null
  rightToWorkExpiry?: string | null
  shareCode?: string | null
  sponsorshipRequired?: boolean | null
  nationality?: string | null
  noticePeriodDays?: number | null
  gdprProcessingConsentAt?: string | null
  gdprProcessingConsentBy?: GdprProcessingConsentBy | null
}

interface Agency {
  id: string
  name: string
}

interface EditDetailsFormProps {
  candidate: CandidateDetails
  agencies: Agency[]
  audience?: 'recruiter' | 'customer' | 'manager'
}

export function EditDetailsForm({ candidate, agencies, audience = 'recruiter' }: EditDetailsFormProps) {
  if (audience === 'manager') return null
  const [isOpen, setIsOpen] = useState(false)

  const boundAction = updateCandidateDetails.bind(null, candidate.id)
  const [state, action, pending] = useActionState<UpdateCandidateState | null, FormData>(
    boundAction,
    null
  )

  const [fields, setFields] = useState({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email ?? '',
    phone: candidate.phone ?? '',
    agencyId: candidate.agencyId ?? '',
    country: candidate.country ?? '',
    city: candidate.city ?? '',
    languagesSpoken: candidate.languagesSpoken?.join(', ') ?? '',
    willingToRelocate: candidate.willingToRelocate === true ? 'true' : candidate.willingToRelocate === false ? 'false' : '',
    candidateRate: candidate.candidateRate ?? '',
    customerRate: candidate.customerRate ?? '',
    rateCurrency: candidate.rateCurrency ?? 'GBP',
    availabilityStatus: candidate.availabilityStatus ?? 'available',
    availableFrom: candidate.availableFrom ?? '',
  })

  // Compliance fields — recruiter audience only
  const [complianceFields, setComplianceFields] = useState<ComplianceFields>({
    ...DEFAULT_COMPLIANCE_FIELDS,
    rightToWorkStatus: (candidate.rightToWorkStatus ?? '') as ComplianceFields['rightToWorkStatus'],
    rightToWorkDocumentType: (candidate.rightToWorkDocumentType ?? '') as ComplianceFields['rightToWorkDocumentType'],
    rightToWorkExpiry: candidate.rightToWorkExpiry ?? '',
    shareCode: candidate.shareCode ?? '',
    sponsorshipRequired: candidate.sponsorshipRequired ?? false,
    nationality: candidate.nationality ?? '',
    noticePeriodDays: candidate.noticePeriodDays != null ? String(candidate.noticePeriodDays) : '',
    gdprProcessingConsentAt: candidate.gdprProcessingConsentAt ?? '',
    gdprProcessingConsentBy: (candidate.gdprProcessingConsentBy ?? '') as ComplianceFields['gdprProcessingConsentBy'],
  })

  const fieldErrors = state && !state.success ? state.fieldErrors : {}

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mb-6">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <PencilIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
          <span className="font-semibold text-[var(--color-fg)]">Edit Details</span>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-[var(--color-fg-subtle)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <form
          action={(fd) => {
            fd.set('firstName', fields.firstName)
            fd.set('lastName', fields.lastName)
            fd.set('email', fields.email)
            fd.set('phone', fields.phone)
            fd.set('agencyId', fields.agencyId)
            // Forward compliance fields — recruiter audience only
            if (audience === 'recruiter') {
              fd.set('rightToWorkStatus', complianceFields.rightToWorkStatus)
              fd.set('rightToWorkDocumentType', complianceFields.rightToWorkDocumentType)
              fd.set('rightToWorkExpiry', complianceFields.rightToWorkExpiry)
              fd.set('shareCode', complianceFields.shareCode)
              fd.set('sponsorshipRequired', String(complianceFields.sponsorshipRequired))
              fd.set('nationality', complianceFields.nationality)
              fd.set('noticePeriodDays', complianceFields.noticePeriodDays)
              fd.set('gdprProcessingConsentAt', complianceFields.gdprProcessingConsentAt)
              fd.set('gdprProcessingConsentBy', complianceFields.gdprProcessingConsentBy)
            }
            action(fd)
          }}
          className="mt-5 space-y-4"
        >
          {state && !state.success && !state.fieldErrors && (
            <div
              role="alert"
              className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400"
            >
              {state.error}
            </div>
          )}

          {state?.success && (
            <div
              role="status"
              className="rounded-md bg-emerald-950 border border-emerald-800 px-4 py-3 text-sm text-emerald-400"
            >
              Details updated successfully.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
                First name <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                disabled={pending}
                value={fields.firstName}
                onChange={(e) => setFields((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50"
              />
              {fieldErrors?.firstName && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.firstName[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
                Last name <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                disabled={pending}
                value={fields.lastName}
                onChange={(e) => setFields((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50"
              />
              {fieldErrors?.lastName && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.lastName[0]}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
              Email <span className="text-[var(--color-fg-subtle)] font-normal">(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              disabled={pending}
              value={fields.email}
              onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
              placeholder="candidate@example.com"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         placeholder:text-[var(--color-fg-subtle)]
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50"
            />
            {fieldErrors?.email && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.email[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
              Phone <span className="text-[var(--color-fg-subtle)] font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              disabled={pending}
              value={fields.phone}
              onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+44 7700 900000"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         placeholder:text-[var(--color-fg-subtle)]
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50"
            />
          </div>

          {agencies.length > 0 && (
            <div>
              <label htmlFor="agencyId" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
                Agency <span className="text-[var(--color-fg-subtle)] font-normal">(optional)</span>
              </label>
              <select
                id="agencyId"
                name="agencyId"
                disabled={pending}
                value={fields.agencyId}
                onChange={(e) => setFields((f) => ({ ...f, agencyId: e.target.value }))}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50"
              >
                <option value="">— No agency —</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Location & Language */}
          <div className="border-t border-[var(--color-bg-input)] pt-3 mt-1 col-span-2">
            <p className="text-sm font-medium text-[var(--color-fg-muted)] mb-2">Location & Language</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label htmlFor="edit-country" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Country</label>
                <input id="edit-country" name="country" type="text" disabled={pending}
                  value={fields.country} onChange={(e) => setFields((f) => ({ ...f, country: e.target.value }))}
                  placeholder="United Kingdom"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
              </div>
              <div>
                <label htmlFor="edit-city" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">City</label>
                <input id="edit-city" name="city" type="text" disabled={pending}
                  value={fields.city} onChange={(e) => setFields((f) => ({ ...f, city: e.target.value }))}
                  placeholder="London"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-languages" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                  Languages <span className="text-[var(--color-fg-subtle)]">(comma-separated)</span>
                </label>
                <input id="edit-languages" name="languagesSpoken" type="text" disabled={pending}
                  value={fields.languagesSpoken} onChange={(e) => setFields((f) => ({ ...f, languagesSpoken: e.target.value }))}
                  placeholder="English, German"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
              </div>
              <div>
                <label htmlFor="edit-relocate" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Willing to Relocate</label>
                <select id="edit-relocate" name="willingToRelocate" disabled={pending}
                  value={fields.willingToRelocate} onChange={(e) => setFields((f) => ({ ...f, willingToRelocate: e.target.value }))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                  <option value="">— Not specified —</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </div>

          {/* Commercial Details */}
          <div className="border-t border-[var(--color-bg-input)] pt-3 mt-1 col-span-2">
            <p className="text-sm font-medium text-[var(--color-fg-muted)] mb-2">Commercial Details</p>
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="candidateRate" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                  Candidate Rate/day
                </label>
                <input
                  id="candidateRate"
                  name="candidateRate"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={pending}
                  value={fields.candidateRate}
                  onChange={(e) => setFields((f) => ({ ...f, candidateRate: e.target.value }))}
                  placeholder="650.00"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                             placeholder:text-[var(--color-fg-subtle)]
                             focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="customerRate" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                  Customer Rate/day
                </label>
                <input
                  id="customerRate"
                  name="customerRate"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={pending}
                  value={fields.customerRate}
                  onChange={(e) => setFields((f) => ({ ...f, customerRate: e.target.value }))}
                  placeholder="850.00"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                             placeholder:text-[var(--color-fg-subtle)]
                             focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="rateCurrency" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                  Currency
                </label>
                <select
                  id="rateCurrency"
                  name="rateCurrency"
                  disabled={pending}
                  value={fields.rateCurrency}
                  onChange={(e) => setFields((f) => ({ ...f, rateCurrency: e.target.value }))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="CHF">CHF</option>
                  <option value="SEK">SEK</option>
                  <option value="NOK">NOK</option>
                  <option value="DKK">DKK</option>
                </select>
              </div>
            </div>
          </div>

          {/* Availability */}
          <div className="border-t border-[var(--color-bg-input)] pt-3 mt-1 col-span-2">
            <p className="text-sm font-medium text-[var(--color-fg-muted)] mb-2">Availability</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="availabilityStatus" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                  Availability status
                </label>
                <select
                  id="availabilityStatus"
                  name="availabilityStatus"
                  disabled={pending}
                  value={fields.availabilityStatus}
                  onChange={(e) =>
                    setFields((f) => ({
                      ...f,
                      availabilityStatus: e.target.value as typeof f.availabilityStatus,
                      // Clear availableFrom when leaving on_project
                      availableFrom: e.target.value === 'on_project' ? f.availableFrom : '',
                    }))
                  }
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="available">Available</option>
                  <option value="on_project">On project</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
              <div>
                <label htmlFor="availableFrom" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                  Available from <span className="text-[var(--color-fg-subtle)]">(when on project)</span>
                </label>
                <input
                  id="availableFrom"
                  name="availableFrom"
                  type="date"
                  disabled={pending || fields.availabilityStatus !== 'on_project'}
                  value={fields.availableFrom}
                  onChange={(e) => setFields((f) => ({ ...f, availableFrom: e.target.value }))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Compliance & Eligibility — recruiter-only collapsible section */}
          <ComplianceSection
            audience={audience}
            disabled={pending}
            fields={complianceFields}
            onChange={setComplianceFields}
          />

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                         font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Saving…' : 'Save details'}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
