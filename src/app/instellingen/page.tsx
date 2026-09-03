import { redirect } from 'next/navigation'
import { requireAuthenticatedUser } from '@/lib/authz'

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser()
  if (user.role === 'SUPER_ADMIN') redirect('/instellingen/organisaties')
  if (user.permissions.includes('users.manage')) redirect('/instellingen/team')
  if (user.permissions.includes('settings.manage')) redirect('/instellingen/rollen')
  if (user.permissions.includes('billing.manage')) redirect('/instellingen/licentie')
  redirect('/instellingen/profiel')
}
