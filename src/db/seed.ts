/**
 * Database seed script
 * Run with: npm run db:seed
 *
 * Creates:
 *  - 1 tenant
 *  - 2 users (admin + recruiter)
 *  - 2 agencies
 *  - 1 role
 */

import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

const {
  tenants,
  users,
  agencies,
  roles,
} = schema

async function seed() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 })
  const db = drizzle(client, { schema })

  console.log('🌱 Seeding database…')

  // -- Tenant --
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'Acme Recruiting',
      slug: 'acme-recruiting',
      plan: 'free',
    })
    .onConflictDoNothing()
    .returning()

  if (!tenant) {
    console.log('⏭  Tenant already exists, skipping seed.')
    await client.end()
    return
  }

  const tenantId = tenant.id
  console.log(`   tenant: ${tenantId}`)

  // Set RLS context for all subsequent inserts
  await db.execute(sql`SELECT set_tenant_context(${tenantId}::uuid)`)

  // -- Users --
  const adminHash = await bcrypt.hash('admin1234', 12)
  const recruiterHash = await bcrypt.hash('recruiter1234', 12)

  const [adminUser] = await db
    .insert(users)
    .values({
      tenantId,
      email: 'admin@acme.com',
      name: 'Alice Admin',
      role: 'admin',
      passwordHash: adminHash,
    })
    .returning()

  await db.insert(users).values({
    tenantId,
    email: 'recruiter@acme.com',
    name: 'Bob Recruiter',
    role: 'recruiter',
    passwordHash: recruiterHash,
  })

  console.log(`   users: admin@acme.com / recruiter@acme.com`)

  // -- Agencies --
  await db.insert(agencies).values([
    {
      tenantId,
      name: 'TechTalent Ltd',
      contactEmail: 'hello@techtalent.io',
      isActive: true,
    },
    {
      tenantId,
      name: 'Global Staffing Co',
      contactEmail: 'info@globalstaffing.com',
      isActive: true,
    },
  ])

  console.log(`   agencies: TechTalent Ltd, Global Staffing Co`)

  // -- Role --
  await db.insert(roles).values({
    tenantId,
    title: 'Senior TypeScript Engineer',
    description:
      'We are looking for a senior TypeScript engineer to join our platform team. ' +
      'You will design and build scalable backend services and mentor junior engineers.',
    requirements:
      '- 5+ years of TypeScript/Node.js experience\n' +
      '- Strong understanding of async patterns and event-driven architecture\n' +
      '- Experience with PostgreSQL or similar relational databases\n' +
      '- Familiarity with Docker and CI/CD pipelines\n' +
      '- Excellent written and verbal communication',
    createdBy: adminUser.id,
    isActive: true,
  })

  console.log(`   role: Senior TypeScript Engineer`)
  console.log('✅ Seed complete.')

  await client.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
