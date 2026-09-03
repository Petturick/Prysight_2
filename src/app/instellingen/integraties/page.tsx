import IntegratiesPage from '@/app/integraties/page'
import { requirePermission } from '@/lib/authz'

export default async function InstellingenIntegratiesPage() {
  await requirePermission('settings.manage')
  return <IntegratiesPage />
}
