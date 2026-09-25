export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { BulkProductImportWizard } from '@/components/BulkProductImportWizard'
import { requirePermission } from '@/lib/authz'

export default async function BulkImportPage() {
  await requirePermission('imports.run')

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2"><Link href="/import" className="secondary-action">Importeren</Link><Link href="/producten" className="secondary-action">Producten</Link></div>

      <BulkProductImportWizard />
    </div>
  )
}
