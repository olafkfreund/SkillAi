/**
 * Database migration runner — called by docker/entrypoint.sh on every container start.
 * Uses drizzle-orm/migrator (production dep, available in standalone build).
 * Drizzle tracks applied migrations in __drizzle_migrations — safe to re-run on restart.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set')
  process.exit(1)
}

// migrationsFolder is relative to this script's location in the container:
// script lives at /app/scripts/migrate.mjs
// migrations live at /app/migrations/
const migrationsFolder = join(__dirname, '../migrations')

const sql = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(sql)

console.log('Running database migrations...')
console.log(`Migrations folder: ${migrationsFolder}`)

try {
  await migrate(db, { migrationsFolder })
  console.log('Migrations complete.')
} catch (err) {
  console.error('Migration failed:', err)
  process.exit(1)
} finally {
  await sql.end()
}
