export type DatabaseRole = 'ADMIN' | 'ANALYST' | 'READONLY'
export type AppRole = DatabaseRole | 'SUPER_ADMIN'

export function isAdminRole(role: AppRole | null | undefined) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export function isSuperAdminRole(role: AppRole | null | undefined) {
  return role === 'SUPER_ADMIN'
}

export function roleLabel(role: AppRole | null | undefined) {
  if (role === 'SUPER_ADMIN') return 'Super admin'
  if (role === 'ADMIN') return 'Admin'
  if (role === 'ANALYST') return 'Analist'
  return 'Alleen lezen'
}
