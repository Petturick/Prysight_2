import {
  assignCustomRoleAction,
  createCustomRoleAction,
  deleteCustomRoleAction,
  updateCustomRoleAction,
} from '@/app/actions/roleActions'
import { PERMISSIONS, requireSuperAdmin, type Permission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const permissionMeta: Record<Permission, { label: string; description: string }> = {
  'products.read': { label: 'Producten bekijken', description: 'Producten, prijzen en productdetails inzien' },
  'products.write': { label: 'Producten beheren', description: 'Producten toevoegen, wijzigen en verwijderen' },
  'competitors.read': { label: 'Concurrenten bekijken', description: 'Concurrenten en gekoppelde bronnen inzien' },
  'competitors.write': { label: 'Concurrenten beheren', description: 'Concurrenten en product URL bronnen toevoegen of wijzigen' },
  'feeds.read': { label: 'Feeds bekijken', description: 'Databronnen, mapping en synchronisatiestatus inzien' },
  'feeds.write': { label: 'Feeds beheren', description: 'Feeds koppelen, wijzigen en synchroniseren' },
  'imports.run': { label: 'Imports uitvoeren', description: 'Bestanden en productdata importeren' },
  'reports.read': { label: 'Rapportages bekijken', description: 'Inzichten en rapportages openen' },
  'alerts.manage': { label: 'Waarschuwingen beheren', description: 'Waarschuwingen beoordelen en afhandelen' },
  'pricing.manage': { label: 'Prijsstrategie beheren', description: 'Prijsregels en prijsinstellingen beheren' },
  'pricing.publish': { label: 'Prijswijzigingen publiceren', description: 'Prijswijzigingen goedkeuren en publiceren' },
  'users.manage': { label: 'Gebruikers beheren', description: 'Gebruikers en toegang binnen de organisatie beheren' },
  'settings.manage': { label: 'Instellingen beheren', description: 'Organisatie instellingen en configuratie beheren' },
  'billing.manage': { label: 'Licentie en facturatie', description: 'Licentie en facturatie beheren' },
}

type RoleRow = {
  id: string
  name: string
  description: string | null
  permissions: unknown
  assignedCount: number
}

type UserRow = {
  id: string
  name: string
  email: string
  customRoleId: string | null
  customRoleName: string | null
  isSuperAdmin: boolean
}

function permissionsOf(value: unknown): Permission[] {
  return Array.isArray(value)
    ? value.filter((item): item is Permission => typeof item === 'string' && (PERMISSIONS as readonly string[]).includes(item))
    : []
}

export default async function RollenPage() {
  const actor = await requireSuperAdmin()

  const [roles, users] = await Promise.all([
    prisma.$queryRaw<RoleRow[]>`
      SELECT cr.id, cr.name, cr.description, cr.permissions, COUNT(cm.id)::int AS "assignedCount"
      FROM custom_roles cr
      LEFT JOIN company_memberships cm ON cm.custom_role_id = cr.id AND cm.is_active = true
      WHERE cr.company_id = ${actor.companyId} AND cr.is_active = true
      GROUP BY cr.id
      ORDER BY cr.name ASC
    `,
    prisma.$queryRaw<UserRow[]>`
      SELECT u.id, u.name, u.email, cm.custom_role_id AS "customRoleId",
             cr.name AS "customRoleName", COALESCE(u.is_super_admin, false) AS "isSuperAdmin"
      FROM company_memberships cm
      JOIN users u ON u.id = cm.user_id
      LEFT JOIN custom_roles cr ON cr.id = cm.custom_role_id
      WHERE cm.company_id = ${actor.companyId} AND cm.is_active = true
      ORDER BY u.name ASC
    `,
  ])

  const rolePermissions = new Map(roles.map((role) => [role.id, new Set(permissionsOf(role.permissions))]))

  return (
    <div className="space-y-5">
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#252a37]">Rollen en rechten</h2>
            <p className="mt-1 text-[11px] leading-5 text-[#7a8798]">
              Beheer rollen op dezelfde manier als in Syntrx. Rechten staan in één matrix en alleen de Super Admin kan ze wijzigen.
            </p>
          </div>
          <span className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-[10px] font-semibold text-[#3d73d4]">
            Super Admin beheer
          </span>
        </div>

        <div className="border-b border-[var(--border)] bg-[#f8fafc] px-5 py-4">
          <form action={createCustomRoleAction} className="grid gap-3 lg:grid-cols-[220px_minmax(240px,1fr)_minmax(0,2fr)_auto] lg:items-end">
            <label className="text-[10px] font-semibold text-[#5d6b7d]">
              Nieuwe rol
              <input
                name="name"
                required
                minLength={2}
                placeholder="Bijvoorbeeld Pricing specialist"
                className="toolbar-control mt-1.5 w-full"
              />
            </label>
            <label className="text-[10px] font-semibold text-[#5d6b7d]">
              Omschrijving
              <input
                name="description"
                placeholder="Korte omschrijving"
                className="toolbar-control mt-1.5 w-full"
              />
            </label>
            <div>
              <p className="text-[10px] font-semibold text-[#5d6b7d]">Startrechten</p>
              <div className="mt-1.5 flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto rounded-[9px] border border-[#e1e7ee] bg-white p-2">
                {PERMISSIONS.map((permission) => (
                  <label key={permission} className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f7fa] px-2.5 py-1.5 text-[9px] font-semibold text-[#58677a]">
                    <input type="checkbox" name={permission} />
                    {permissionMeta[permission].label}
                  </label>
                ))}
              </div>
            </div>
            <button className="primary-action whitespace-nowrap">Rol aanmaken</button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-[11px]">
            <thead className="border-b border-[var(--border)] bg-[#fbfcfe]">
              <tr>
                <th className="sticky left-0 z-20 min-w-[260px] bg-[#fbfcfe] px-5 py-4 text-left">
                  <p className="font-semibold text-[#435267]">Recht</p>
                  <p className="mt-0.5 text-[9px] font-normal text-[#98a2b3]">Wat iemand binnen Prysight mag doen</p>
                </th>
                <th className="min-w-[145px] px-3 py-4 text-center">
                  <p className="font-semibold text-[#26364a]">Admin</p>
                  <p className="mt-0.5 text-[9px] font-normal text-[#98a2b3]">Vast volledig</p>
                </th>
                {roles.map((role) => (
                  <th key={role.id} className="min-w-[180px] px-3 py-3 text-center align-top">
                    <form id={`role-${role.id}`} action={updateCustomRoleAction}>
                      <input type="hidden" name="roleId" value={role.id} />
                      <input type="hidden" name="name" value={role.name} />
                      <input type="hidden" name="description" value={role.description ?? ''} />
                      <p className="font-semibold text-[#26364a]">{role.name}</p>
                      <p className="mt-0.5 text-[9px] font-normal text-[#98a2b3]">{role.assignedCount} gebruiker{role.assignedCount === 1 ? '' : 's'}</p>
                      <button className="mt-2 rounded-[7px] border border-[#dbe3ed] bg-white px-2.5 py-1.5 text-[9px] font-semibold text-[#486a9f] hover:bg-[#f6f9fd]">
                        Rechten opslaan
                      </button>
                    </form>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f3]">
              {PERMISSIONS.map((permission, index) => (
                <tr key={permission} className={index % 2 === 0 ? 'bg-white' : 'bg-[#fbfcfd]'}>
                  <td className={`sticky left-0 z-10 px-5 py-3 ${index % 2 === 0 ? 'bg-white' : 'bg-[#fbfcfd]'}`}>
                    <p className="font-semibold text-[#344054]">{permissionMeta[permission].label}</p>
                    <p className="mt-0.5 text-[9px] leading-4 text-[#98a2b3]">{permissionMeta[permission].description}</p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked readOnly disabled className="h-4 w-4 rounded border-[#cfd7e2]" />
                  </td>
                  {roles.map((role) => (
                    <td key={role.id} className="px-3 py-3 text-center">
                      <input
                        form={`role-${role.id}`}
                        type="checkbox"
                        name={permission}
                        defaultChecked={rolePermissions.get(role.id)?.has(permission) ?? false}
                        className="h-4 w-4 rounded border-[#cfd7e2] text-[#4f86e8] focus:ring-[#4f86e8]/20"
                        aria-label={`${permissionMeta[permission].label} voor ${role.name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {roles.length > 0 ? (
        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <div key={role.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-[#26364a]">{role.name}</p>
                  <p className="mt-1 text-[10px] leading-5 text-[#7a8798]">{role.description || 'Geen omschrijving'}</p>
                </div>
                <span className="rounded-full bg-[#f2f5fa] px-2 py-1 text-[9px] font-semibold text-[#667085]">{role.assignedCount}</span>
              </div>
              <form action={deleteCustomRoleAction} className="mt-3 border-t border-[#edf0f3] pt-3">
                <input type="hidden" name="roleId" value={role.id} />
                <button className="text-[10px] font-semibold text-[#b5474c]">Rol verwijderen</button>
              </form>
            </div>
          ))}
        </section>
      ) : null}

      <section className="strong-panel overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#252a37]">Gebruikers aan rollen koppelen</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8790a2]">Super Admin accounts blijven beschermd en houden altijd volledige platformrechten.</p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {users.map((user) => (
            <form action={assignCustomRoleAction} key={user.id} className="grid gap-3 px-5 py-3 md:grid-cols-[1fr_280px_auto] md:items-center">
              <input type="hidden" name="userId" value={user.id} />
              <div>
                <p className="text-[12px] font-semibold text-[#252a37]">{user.name}</p>
                <p className="mt-1 text-[10px] text-[#8790a2]">{user.email}{user.isSuperAdmin ? ', Super Admin' : ''}</p>
              </div>
              <select
                name="roleId"
                defaultValue={user.customRoleId ?? ''}
                disabled={user.isSuperAdmin}
                className="toolbar-control"
              >
                <option value="">Standaard organisatierol</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <button disabled={user.isSuperAdmin} className="secondary-action disabled:opacity-40">Opslaan</button>
            </form>
          ))}
        </div>
      </section>
    </div>
  )
}
