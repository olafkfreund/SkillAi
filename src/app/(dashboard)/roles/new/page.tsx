import { RoleForm } from '@/components/roles/role-form'

export const metadata = { title: 'New Role — SkillAI' }

export default function NewRolePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Create role</h1>
      <RoleForm />
    </div>
  )
}
