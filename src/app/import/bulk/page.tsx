export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { BulkProductImportWizard } from '@/components/BulkProductImportWizard'
import { requirePermission } from '@/lib/authz'

export default async function BulkImportPage() {
  await requirePermission('imports.run')

  return (
    <div className="space-y-5">
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Databeheer</p>
            <h1 className="mt-2">Bulk productfeed</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#66778a]">Importeer in één keer een complete productlijst. PrySight herkent de belangrijkste productvelden automatisch en ondersteunt ook horizontale prijsrapporten zoals Prisync.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/import" className="secondary-action">Standaard import</Link><Link href="/producten" className="secondary-action">Producten bekijken</Link></div>
        </div>
      </section>

      <BulkProductImportWizard />
    </div>
  )
}
