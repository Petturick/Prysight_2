import { UserRole } from '@/generated/prisma/client'
import { deleteUserAction, saveUserAction } from '@/app/actions/adminActions'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

type UserRow = { id: string; email: string; name: string; role: UserRole; isSuperAdmin: boolean; membershipRole: string; createdAt: Date }

export default async function GebruikersPage() {
  const actor = await requirePermission('users.manage')
  const users = await prisma.$queryRaw<UserRow[]>`
    SELECT u.id, u.email, u.name, u.role::text AS role, COALESCE(u.is_super_admin, false) AS "isSuperAdmin", cm.role::text AS "membershipRole", u.created_at AS "createdAt"
    FROM users u INNER JOIN company_memberships cm ON cm.user_id = u.id AND cm.company_id = ${actor.companyId} AND cm.is_active = true
    ORDER BY u.created_at ASC
  `
  return <div className="space-y-5"><form action={saveUserAction} className="strong-panel grid gap-3 p-5 md:grid-cols-4"><div className="md:col-span-4"><h2 className="text-[15px] font-bold text-[#252a37]">Gebruiker toevoegen</h2><p className="mt-1 text-[10px] text-[#8790a2]">Gebruikers worden uitsluitend aan de actieve organisatie gekoppeld.</p></div><input name="email" type="email" placeholder="E mail" className="toolbar-control" required /><input name="name" placeholder="Naam" className="toolbar-control" required /><input name="password" type="password" minLength={12} placeholder="Wachtwoord" className="toolbar-control" required /><select name="role" className="toolbar-control">{Object.values(UserRole).map((role) => <option key={role} value={role}>{role}</option>)}</select><button className="primary-action md:col-span-4">Gebruiker opslaan</button></form>
  <section className="strong-panel overflow-hidden"><div className="border-b-2 border-[var(--border)] px-5 py-4"><h2 className="text-[15px] font-bold text-[#252a37]">Gebruikers</h2></div><div className="divide-y divide-[var(--border)]">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-[12px] font-bold text-[#252a37]">{user.name}</p><p className="mt-1 text-[10px] text-[#8790a2]">{user.email}, {user.isSuperAdmin ? 'SUPER ADMIN' : user.membershipRole}</p></div>{user.isSuperAdmin ? <span className="rounded-full bg-[var(--blue-soft)] px-3 py-1 text-[9px] font-bold text-[var(--blue)]">Beschermd account</span> : <form action={deleteUserAction}><input type="hidden" name="id" value={user.id} /><button className="secondary-action">Toegang verwijderen</button></form>}</div>)}</div></section></div>
}
