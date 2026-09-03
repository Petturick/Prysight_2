import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

export default async function TeamPage() {
  const actor = await requirePermission('users.manage')
  const members = await prisma.companyMembership.findMany({ where: { companyId: actor.companyId, isActive: true }, include: { user: true }, orderBy: { createdAt: 'asc' } })
  return <section className="strong-panel overflow-hidden"><div className="border-b-2 border-[var(--border)] px-5 py-4"><h2 className="text-[15px] font-bold text-[#252a37]">Team</h2><p className="mt-1 text-[10px] text-[#8790a2]">Iedereen met toegang tot de actieve organisatie.</p></div><div className="divide-y divide-[var(--border)]">{members.map((member) => <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-[12px] font-bold text-[#252a37]">{member.user.name}</p><p className="mt-1 text-[10px] text-[#8790a2]">{member.user.email}</p></div><span className="rounded-full bg-[#f0f2f6] px-3 py-1 text-[9px] font-bold text-[#667085]">{member.user.isSuperAdmin ? 'SUPER ADMIN' : member.role}</span></div>)}</div></section>
}
