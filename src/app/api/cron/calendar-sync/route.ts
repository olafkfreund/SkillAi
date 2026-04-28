// Cron endpoint — pull-side calendar sync.
//
// Called by an external scheduler (host crontab / GitHub Actions / k8s CronJob)
// every 15 minutes. Authenticates via a Bearer secret from CRON_SECRET env var.
//
// POST (or GET) /api/cron/calendar-sync
// Authorization: Bearer <CRON_SECRET>
//
// 200  → { totalConnections, processedConnections, syncedSlots,
//           rescheduledCount, cancelledCount, errors[] }
// 401  → { error: 'Unauthorized' }
// 500  → { error: 'Sync failed', message: '...' }  — only on unexpected throw

import { runCalendarSync } from '@/lib/calendar/sync-loop'

async function handler(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runCalendarSync()
    return Response.json(summary, { status: 200 })
  } catch (err) {
    console.error('[cron/calendar-sync] sync loop failed:', err)
    return Response.json(
      {
        error: 'Sync failed',
        message: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}

// Allow GET as well — some cron services use GET by default
export const GET = handler
export const POST = handler
