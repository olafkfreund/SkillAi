import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'

/**
 * GET /api/health
 *
 * Unauthenticated health probe for Docker healthchecks and external monitors.
 * Issues a trivial DB query to confirm the database connection is alive.
 *
 * Returns:
 *   200 { status: 'ok',        db: 'ok',    uptime, timestamp } — healthy
 *   503 { status: 'unhealthy', db: 'error',          timestamp } — DB unreachable
 *
 * Never cached — monitors must always get a live result.
 */
export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString()

  try {
    await db.execute(sql`SELECT 1`)

    return NextResponse.json(
      {
        status: 'ok',
        db: 'ok',
        uptime: process.uptime(),
        timestamp,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch {
    return NextResponse.json(
      {
        status: 'unhealthy',
        db: 'error',
        timestamp,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }
}
