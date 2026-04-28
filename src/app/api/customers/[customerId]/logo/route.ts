import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { extname } from 'path'
import fs from 'fs/promises'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { customers } from '@/db/schema'
import { getLogoAbsolutePath } from '@/lib/branding/store'
import { uploadCustomerLogo } from '@/actions/customer-logo'

// ---------------------------------------------------------------------------
// MIME type map for serving logo files
// ---------------------------------------------------------------------------

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const uuidSchema = z.string().uuid()

// ---------------------------------------------------------------------------
// GET — serve the customer logo file
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  // 2. Validate customerId
  const { customerId } = await params
  const parsed = uuidSchema.safeParse(customerId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  // 3. Fetch customer — RLS + explicit tenantId filter enforces cross-tenant isolation
  const [customer] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: customers.id, logoPath: customers.logoPath, tenantId: customers.tenantId })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1)
  )

  if (!customer) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // 4. Cross-tenant guard (belt-and-suspenders beyond RLS)
  if (customer.tenantId !== tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 5. No logo set
  if (!customer.logoPath) {
    return NextResponse.json({ error: 'no_logo' }, { status: 404 })
  }

  // 6. Resolve absolute path
  const abs = getLogoAbsolutePath(customer.logoPath)

  // 7. Read file from disk
  let buffer: Buffer
  try {
    buffer = await fs.readFile(abs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json({ error: 'file_missing' }, { status: 410 })
    }
    console.error('[customer-logo/GET] Failed to read logo file:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // 8. Content-Type from extension
  const ext = extname(customer.logoPath).toLowerCase()
  const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream'

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, max-age=300',
    },
  })
}

// ---------------------------------------------------------------------------
// POST — upload or replace the customer logo (delegates to server action)
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2. Validate customerId
  const { customerId } = await params
  const parsed = uuidSchema.safeParse(customerId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  // 3. Parse multipart body
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }

  // Ensure customerId is in the FormData (the action reads it from there)
  formData.set('customerId', customerId)

  // 4. Delegate to the server action — it handles auth, validation, and DB writes
  const result = await uploadCustomerLogo(formData)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
