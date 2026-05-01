/**
 * Notification dispatcher — routes high-score and manager-decision events to
 * configured Slack / Teams webhooks.
 *
 * Design principles (mirrors src/lib/email/notify-recruiter-of-customer-update.ts):
 *  - Never throws. All failure paths are swallowed and logged via console.warn.
 *  - All dispatches are fire-and-forget — callers use .catch(() => {}).
 *  - Audit log writes are themselves fire-and-forget (.catch(() => {})).
 *  - Names are loaded internally from the DB so call sites stay minimal.
 */

import { eq, and, inArray } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, roles, tenantSettings } from '@/db/schema'
import { decrypt } from '@/lib/crypto'
import { writeAuditLog } from '@/lib/audit'
import { sendSlack } from './slack'
import { sendTeams } from './teams'

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const SETTING_KEYS = {
  slackWebhook: 'slack_webhook_url',
  teamsWebhook: 'teams_webhook_url',
  highScoreEnabled: 'notify_high_score_enabled',
  managerDecisionEnabled: 'notify_manager_decision_enabled',
  scoreThreshold: 'notify_score_threshold',
} as const

// ---------------------------------------------------------------------------
// Public argument types
// ---------------------------------------------------------------------------

export type HighScoreArgs = {
  tenantId: string
  candidateId: string
  roleId: string
  overallScore: number
}

export type ManagerDecisionArgs = {
  tenantId: string
  decision: 'approved' | 'rejected'
  candidateId: string
  roleId: string
  managerName: string | null
  comment: string | null
}

export type NotificationTestResult = {
  slack: { configured: boolean; ok: boolean; error?: string }
  teams: { configured: boolean; ok: boolean; error?: string }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads all 5 notification-related keys from tenant_settings in a single
 * query and returns a map of key → value.
 */
async function loadNotificationSettings(tenantId: string): Promise<Map<string, string>> {
  const keys = Object.values(SETTING_KEYS) as string[]
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          inArray(tenantSettings.key, keys)
        )
      )
  )
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.key, row.value)
  }
  return map
}

/**
 * Safely decrypts an encrypted webhook URL.
 * Returns null on any decryption failure (missing key, malformed value, etc.).
 */
function safeDecrypt(encrypted: string | undefined): string | null {
  if (!encrypted) return null
  try {
    return decrypt(encrypted)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// dispatchHighScoreNotification
// ---------------------------------------------------------------------------

/**
 * Fires Slack + Teams notifications when a candidate scores above the
 * configured threshold on a role.
 *
 * Loads candidate name and role title internally — call sites pass only IDs
 * and the numeric score.
 *
 * Safe to call fire-and-forget: dispatchHighScoreNotification(...).catch(() => {})
 */
export async function dispatchHighScoreNotification(args: HighScoreArgs): Promise<void> {
  try {
    const settings = await loadNotificationSettings(args.tenantId)

    // Respect the per-tenant enable toggle (defaults to enabled when not set)
    const enabled = settings.get(SETTING_KEYS.highScoreEnabled)
    if (enabled === 'false') return

    // Threshold gate
    const threshold = parseInt(settings.get(SETTING_KEYS.scoreThreshold) ?? '85', 10)
    if (args.overallScore < threshold) return

    // Decrypt webhook URLs
    const slackUrl = safeDecrypt(settings.get(SETTING_KEYS.slackWebhook))
    const teamsUrl = safeDecrypt(settings.get(SETTING_KEYS.teamsWebhook))

    if (!slackUrl && !teamsUrl) return // nothing configured

    // Load candidate name + role title in a single joined query
    const [row] = await withTenant(args.tenantId, async (tx) =>
      tx
        .select({
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          roleTitle: roles.title,
        })
        .from(candidates)
        .innerJoin(roles, eq(roles.tenantId, candidates.tenantId))
        .where(
          and(
            eq(candidates.id, args.candidateId),
            eq(roles.id, args.roleId)
          )
        )
        .limit(1)
    )

    if (!row) return // candidate or role no longer exists

    const candidateName = `${row.candidateFirstName} ${row.candidateLastName}`.trim()
    const roleTitle = row.roleTitle

    // Compose messages
    const slackText = `⭐ ${candidateName} scored ${args.overallScore} for ${roleTitle}`
    const teamsTitle = `High score: ${candidateName}`
    const teamsText = `Scored ${args.overallScore} for ${roleTitle}`
    const teamsColor = '2EB67D' // green

    // Fire both in parallel — failures are independent
    const results = await Promise.allSettled([
      slackUrl ? sendSlack(slackUrl, slackText) : Promise.resolve(null),
      teamsUrl ? sendTeams(teamsUrl, { title: teamsTitle, text: teamsText, themeColor: teamsColor }) : Promise.resolve(null),
    ])

    // Audit each result
    const channels = ['slack', 'teams'] as const
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i]
      const configured = channel === 'slack' ? Boolean(slackUrl) : Boolean(teamsUrl)
      if (!configured) continue

      const settled = results[i]
      if (settled.status === 'rejected') {
        console.warn(`[notifications] ${channel} high-score dispatch threw:`, settled.reason)
        writeAuditLog(args.tenantId, {
          action: 'notification.webhook_failed',
          entityType: 'candidate',
          entityId: args.candidateId,
          metadata: {
            channel,
            error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            candidateId: args.candidateId,
            roleId: args.roleId,
          },
        }).catch(() => {})
        continue
      }

      const result = settled.value
      if (result === null) continue // channel not configured

      if (!result.ok) {
        console.warn(`[notifications] ${channel} high-score delivery failed:`, result.error)
        writeAuditLog(args.tenantId, {
          action: 'notification.webhook_failed',
          entityType: 'candidate',
          entityId: args.candidateId,
          metadata: {
            channel,
            error: result.error,
            candidateId: args.candidateId,
            roleId: args.roleId,
          },
        }).catch(() => {})
      } else {
        writeAuditLog(args.tenantId, {
          action: 'notification.high_score_sent',
          entityType: 'candidate',
          entityId: args.candidateId,
          entityLabel: `${candidateName} → ${roleTitle}`,
          metadata: {
            channel,
            overallScore: args.overallScore,
            roleId: args.roleId,
          },
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[notifications] dispatchHighScoreNotification failed:', err)
  }
}

// ---------------------------------------------------------------------------
// dispatchManagerDecisionNotification
// ---------------------------------------------------------------------------

/**
 * Fires Slack + Teams notifications when a hiring manager approves or rejects
 * a candidate.
 *
 * Loads candidate name and role title internally — call sites pass only IDs,
 * the decision, manager name, and optional comment.
 *
 * Safe to call fire-and-forget: dispatchManagerDecisionNotification(...).catch(() => {})
 */
export async function dispatchManagerDecisionNotification(args: ManagerDecisionArgs): Promise<void> {
  try {
    const settings = await loadNotificationSettings(args.tenantId)

    // Respect the per-tenant enable toggle (defaults to enabled when not set)
    const enabled = settings.get(SETTING_KEYS.managerDecisionEnabled)
    if (enabled === 'false') return

    // Decrypt webhook URLs
    const slackUrl = safeDecrypt(settings.get(SETTING_KEYS.slackWebhook))
    const teamsUrl = safeDecrypt(settings.get(SETTING_KEYS.teamsWebhook))

    if (!slackUrl && !teamsUrl) return // nothing configured

    // Load candidate name + role title in a single joined query
    const [row] = await withTenant(args.tenantId, async (tx) =>
      tx
        .select({
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          roleTitle: roles.title,
        })
        .from(candidates)
        .innerJoin(roles, eq(roles.tenantId, candidates.tenantId))
        .where(
          and(
            eq(candidates.id, args.candidateId),
            eq(roles.id, args.roleId)
          )
        )
        .limit(1)
    )

    if (!row) return // candidate or role no longer exists

    const candidateName = `${row.candidateFirstName} ${row.candidateLastName}`.trim()
    const roleTitle = row.roleTitle

    // Compose messages
    const emoji = args.decision === 'approved' ? '✅' : '❌'
    const commentSuffix = args.comment ? ` — "${args.comment}"` : ''
    const slackText = `${emoji} Hiring manager ${args.decision} ${candidateName} for ${roleTitle}${commentSuffix}`
    const teamsTitle = `${emoji} Manager ${args.decision}: ${candidateName}`
    const teamsText = `${candidateName} ${args.decision} for ${roleTitle}${commentSuffix}`
    const teamsColor = args.decision === 'approved' ? '2EB67D' : 'E01E5A'

    // Fire both in parallel
    const results = await Promise.allSettled([
      slackUrl ? sendSlack(slackUrl, slackText) : Promise.resolve(null),
      teamsUrl ? sendTeams(teamsUrl, { title: teamsTitle, text: teamsText, themeColor: teamsColor }) : Promise.resolve(null),
    ])

    // Audit each result
    const channels = ['slack', 'teams'] as const
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i]
      const configured = channel === 'slack' ? Boolean(slackUrl) : Boolean(teamsUrl)
      if (!configured) continue

      const settled = results[i]
      if (settled.status === 'rejected') {
        console.warn(`[notifications] ${channel} manager-decision dispatch threw:`, settled.reason)
        writeAuditLog(args.tenantId, {
          action: 'notification.webhook_failed',
          entityType: 'candidate',
          entityId: args.candidateId,
          metadata: {
            channel,
            error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            candidateId: args.candidateId,
            roleId: args.roleId,
          },
        }).catch(() => {})
        continue
      }

      const result = settled.value
      if (result === null) continue // channel not configured

      if (!result.ok) {
        console.warn(`[notifications] ${channel} manager-decision delivery failed:`, result.error)
        writeAuditLog(args.tenantId, {
          action: 'notification.webhook_failed',
          entityType: 'candidate',
          entityId: args.candidateId,
          metadata: {
            channel,
            error: result.error,
            candidateId: args.candidateId,
            roleId: args.roleId,
          },
        }).catch(() => {})
      } else {
        writeAuditLog(args.tenantId, {
          action: 'notification.approval_sent',
          entityType: 'candidate',
          entityId: args.candidateId,
          entityLabel: `${candidateName} → ${roleTitle}`,
          metadata: {
            channel,
            decision: args.decision,
            roleId: args.roleId,
            managerName: args.managerName,
          },
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[notifications] dispatchManagerDecisionNotification failed:', err)
  }
}

// ---------------------------------------------------------------------------
// testWebhookDelivery
// ---------------------------------------------------------------------------

/**
 * Posts a test message to both configured webhooks and returns the per-channel
 * result. Used by the settings UI "Send test message" button.
 *
 * Successful test deliveries are NOT audited (would be noisy). Only failures
 * are audited via notification.webhook_failed.
 */
export async function testWebhookDelivery(tenantId: string): Promise<NotificationTestResult> {
  const settings = await loadNotificationSettings(tenantId)

  const slackUrl = safeDecrypt(settings.get(SETTING_KEYS.slackWebhook))
  const teamsUrl = safeDecrypt(settings.get(SETTING_KEYS.teamsWebhook))

  const testMessage = '✓ SkillAI test message — your webhook is wired up'

  const [slackResult, teamsResult] = await Promise.allSettled([
    slackUrl ? sendSlack(slackUrl, testMessage) : Promise.resolve(null),
    teamsUrl ? sendTeams(teamsUrl, { title: 'SkillAI test', text: testMessage }) : Promise.resolve(null),
  ])

  const slack = resolveTestResult(slackUrl, slackResult)
  const teams = resolveTestResult(teamsUrl, teamsResult)

  // Audit failures only
  if (slackUrl && !slack.ok) {
    writeAuditLog(tenantId, {
      action: 'notification.webhook_failed',
      entityType: 'settings',
      metadata: { channel: 'slack', error: slack.error, test: true },
    }).catch(() => {})
  }
  if (teamsUrl && !teams.ok) {
    writeAuditLog(tenantId, {
      action: 'notification.webhook_failed',
      entityType: 'settings',
      metadata: { channel: 'teams', error: teams.error, test: true },
    }).catch(() => {})
  }

  return { slack, teams }
}

function resolveTestResult(
  url: string | null,
  settled: PromiseSettledResult<{ ok: true } | { ok: false; error: string } | null>
): { configured: boolean; ok: boolean; error?: string } {
  if (!url) return { configured: false, ok: false }
  if (settled.status === 'rejected') {
    const error = settled.reason instanceof Error ? settled.reason.message : String(settled.reason)
    return { configured: true, ok: false, error }
  }
  const result = settled.value
  if (result === null) return { configured: false, ok: false }
  if (!result.ok) return { configured: true, ok: false, error: result.error }
  return { configured: true, ok: true }
}
