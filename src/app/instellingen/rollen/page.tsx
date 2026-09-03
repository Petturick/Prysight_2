import { assignCustomRoleAction, createCustomRoleAction, deleteCustomRoleAction } from '@/app/actions/roleActions'
import { PERMISSIONS, requirePermission, type Permission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const labels: Record<Permission, string> = {
  'products.read': 'Producten bekijken', 'products.write': 'Producten toevoegen en wijzigen',
  'competitors.read': 'Concurrenten bekijken', 'competitors.write': 'Concurrenten toevoegen en wijzigen',
  'feeds.read': 'Feeds bekijken', 'feeds.write': 'Feeds beheren en synchroniseren',
  'imports.run': 'Imports uitvoeren', 'reports.read': 'Rapportages bekijken',
  'alerts.manage': 'Waarschuwingen beheren', 'pricing.manage': 'Prijsstrategie beheren',
  'users.manage': 'Gebruikers beheren', 'settings.manage': 'Organisatie instellingen beheren',
  'billing.manage': 'Licentie en facturatie beheren',
}
type RoleRow = { id: string; name: string; description: string | null; permissions: unknown; assignedCount: number }
type UserRow = { id: string; name: string; email: string; customRoleId: string | null; customRoleName: string | null; isSuperAdmin: boolean }
function permissionsOf(value: unknown): Permission[] { return Array.isArray(value) ? value.filter((x): x is Permission => typeof x === 'string' && (PERMISSIONS as readonly string[]).includes(x)) : [] }

export default async function RollenPage() {
  const actor = await requirePermission('settings.manage')
  const [roles, users] = await Promise.all([
    prisma.$queryRaw<RoleRow[]>`SELECT cr.id, cr.name, cr.description, cr.permissions, COUNT(cm.id)::int AS "assignedCount" FROM custom_roles cr LEFT JOIN company_memberships cm ON cm.custom_role_id = cr.id AND cm.is_active = true WHERE cr.company_id = ${actor.companyId} AND cr.is_active = true GROUP BY cr.id ORDER BY cr.name ASC`,
    prisma.$queryRaw<UserRow[]>`SELECT u.id, u.name, u.email, cm.custom_role_id AS "customRoleId", cr.name AS "customRoleName", COALESCE(u.is_super_admin, false) AS "isSuperAdmin" FROM company_memberships cm JOIN users u ON u.id = cm.user_id LEFT JOIN custom_roles cr ON cr.id = cm.custom_role_id WHERE cm.company_id = ${actor.companyId} AND cm.is_active = true ORDER BY u.name ASC`,
  ])
  return <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form action={createCustomRoleAction} className="strong-panel p-5"><h2 className="text-[15px] font-bold text-[#252a37]">Nieuwe rol</h2><p className="mt-1 text-[10px] leading-5 text-[#8790a2]">Maak rollen passend bij de werkelijke verantwoordelijkheden binnen een organisatie.</p><div className="mt-4 space-y-3"><input name="name" required minLength={2} placeholder="Bijvoorbeeld Pricing specialist" className="toolbar-control w-full" /><textarea name="description" rows={3} placeholder="Omschrijving" className="toolbar-control w-full" /></div><div className="mt-4 grid gap-2">{PERMISSIONS.map((permission) => <label key={permission} className="flex items-center gap-3 rounded-[10px] border-2 border-[var(--border)] bg-white px-3 py-2.5 text-[11px] font-semibold text-[#475467]"><input type="checkbox" name={permission} />{labels[permission]}</label>)}</div><button className="primary-action mt-4 w-full">Rol aanmaken</button></form>
  <div className="space-y-4"><section className="strong-panel p-5"><h2 className="text-[15px] font-bold text-[#252a37]">Gebruikers en rollen</h2><div className="mt-4 divide-y divide-[var(--border)]">{users.map((user) => <form action={assignCustomRoleAction} key={user.id} className="grid gap-3 py-3 md:grid-cols-[1fr_260px_auto] md:items-center"><input type="hidden" name="userId" value={user.id} /><div><p className="text-[12px] font-bold text-[#252a37]">{user.name}</p><p className="text-[10px] text-[#8790a2]">{user.email}{user.isSuperAdmin ? ', super admin' : ''}</p></div><select name="roleId" defaultValue={user.customRoleId ?? ''} disabled={user.isSuperAdmin} className="toolbar-control"><option value="">Standaard organisatierol</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><button disabled={user.isSuperAdmin} className="secondary-action disabled:opacity-40">Opslaan</button></form>)}</div></section>
  <section className="grid gap-3 lg:grid-cols-2">{roles.map((role) => <div key={role.id} className="strong-panel p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-[13px] font-bold text-[#252a37]">{role.name}</h3><p className="mt-1 text-[10px] text-[#8790a2]">{role.description || 'Geen omschrijving'}</p></div><span className="rounded-full bg-[#f0f2f6] px-2 py-1 text-[9px] font-bold text-[#667085]">{role.assignedCount} gebruikers</span></div><div className="mt-3 flex flex-wrap gap-1.5">{permissionsOf(role.permissions).map((p) => <span key={p} className="rounded-[8px] bg-[var(--blue-soft)] px-2 py-1 text-[9px] font-bold text-[var(--blue)]">{labels[p]}</span>)}</div><form action={deleteCustomRoleAction} className="mt-4 border-t border-[var(--border)] pt-3"><input type="hidden" name="roleId" value={role.id} /><button className="text-[10px] font-bold text-[#b42318]">Rol verwijderen</button></form></div>)}</section></div></div>
}
