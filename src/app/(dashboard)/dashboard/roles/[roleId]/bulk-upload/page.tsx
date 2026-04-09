import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and } from 'drizzle-orm'
import { ArrowLeftIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { BulkUploadZone } from '@/components/candidates/bulk-upload-zone'

type Props = { params: Promise<{ roleId: string }> }

export default async function BulkUploadPage({ params }: Props) {
  const { roleId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roles.id, title: roles.title })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!role) notFound()

  return (
    <div className="max-w-2xl">
      <Link
        href={`/dashboard/roles/${roleId}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to {role.title}
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100 mb-2">Bulk Upload CVs</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Upload multiple CV files at once. Each file will be parsed and scored against{' '}
        <span className="text-zinc-300 font-medium">{role.title}</span> automatically.
      </p>

      <BulkUploadZone roleId={roleId} />
    </div>
  )
}
