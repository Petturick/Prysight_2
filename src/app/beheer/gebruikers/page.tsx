export const dynamic = 'force-dynamic'
import { UserRole } from '@/generated/prisma/client'
import { deleteUserAction, saveUserAction } from '@/app/actions/adminActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireSuperAdmin } from '@/lib/authz'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

type UserRow = {
  id: string
  email: string
  name: string
  role: UserRole
  isSuperAdmin: boolean
  membershipRole: string
  createdAt: Date
}

export default async function GebruikersBeheerPage() {
  const actor = await requireSuperAdmin()

  const result = await safeDatabaseQuery(
    () => prisma.$queryRaw<UserRow[]>`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role::text AS role,
        COALESCE(u.is_super_admin, false) AS "isSuperAdmin",
        cm.role::text AS "membershipRole",
        u.created_at AS "createdAt"
      FROM users u
      INNER JOIN company_memberships cm
        ON cm.user_id = u.id
       AND cm.company_id = ${actor.companyId}
       AND cm.is_active = true
      ORDER BY u.created_at ASC
    `,
    [],
  )
  const users = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Gebruikers beheer</h1>
        <p className="mt-2 text-sm text-[#667085]">Alleen super admins kunnen gebruikers, rollen en toegang beheren.</p>
      </div>
      <form action={saveUserAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <fieldset disabled={!result.available} className="contents disabled:opacity-50">
          <input name="email" placeholder="E-mailadres" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
          <input name="name" placeholder="Naam" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
          <input name="password" type="password" minLength={12} placeholder="Wachtwoord, minimaal 12 tekens" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
          <select name="role" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required>
            {Object.values(UserRole).map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-4">Gebruiker opslaan</button>
        </fieldset>
      </form>
      <DataTable
        columns={[
          { key: 'naam', header: 'Naam' },
          { key: 'email', header: 'E-mail' },
          { key: 'rol', header: 'Rol' },
          { key: 'aangemaakt', header: 'Aangemaakt' },
          { key: 'actie', header: 'Actie' },
        ]}
        rows={users.map((user) => ({
          naam: user.name,
          email: user.email,
          rol: user.isSuperAdmin ? 'SUPER ADMIN' : user.membershipRole,
          aangemaakt: formatDate(user.createdAt),
          actie: user.isSuperAdmin
            ? <span className="text-xs font-medium text-[#667085]">Beschermd account</span>
            : <form action={deleteUserAction}><input type="hidden" name="id" value={user.id} /><button className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700">Verwijderen</button></form>,
        }))}
      />
    </div>
  )
}
