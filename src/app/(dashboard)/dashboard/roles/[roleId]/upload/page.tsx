import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, agencies } from '@/db/schema'
import { CandidateUploadForm } from '@/components/candidates/candidate-upload-form'

type Props = { params: Promise<{ roleId: string }> }

export default async function UploadCvPage({ params }: Props) {
  const { roleId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId))).limit(1)
  )
  if (!role) notFound()

  const agencyList = await withTenant(tenantId, async (tx) =>
    tx.select({ id: agencies.id, name: agencies.name }).from(agencies).where(eq(agencies.isActive, true))
  )

  return (
    <div className="max-w-xl">
      <Link
        href={`/dashboard/roles/${roleId}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to {role.title}
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100 mb-6">Upload CV</h1>
      <CandidateUploadForm roleId={roleId} agencies={agencyList} />
    </div>
  )
}
