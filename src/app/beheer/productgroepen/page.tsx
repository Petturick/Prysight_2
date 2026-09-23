export const dynamic = 'force-dynamic'

import { deleteProductGroupAction, mergeProductGroupAction, saveProductGroupAction } from '@/app/actions/adminActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { mergedGroupTarget, productGroupLabel } from '@/lib/product-groups'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ProductgroepenBeheerPage() {
  const actor = await requireAdmin()
  const result = await safeDatabaseQuery(() => prisma.productGroup.findMany({
    where: { companyId: actor.companyId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  }), [])
  const groups = result.data.filter((group) => !mergedGroupTarget(group.description))
  const targets = groups.filter((group) => group.isActive && productGroupLabel(group) !== 'Nog niet ingedeeld')

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 pb-8">
      {!result.available ? <DatabaseNotice /> : null}
      <header>
        <h1 className="text-[22px] font-semibold text-[#20344b]">Productgroepen</h1>
        <p className="mt-1 text-[12px] text-[#748296]">Geef groepen een herkenbare naam. De productgroep is optioneel bij productinvoer en heeft geen invloed op EAN herkenning.</p>
      </header>
      <section className="ps-panel p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold text-[#21364d]">Nieuwe productgroep</h2>
        <form action={saveProductGroupAction} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-[11px] font-semibold text-[#4f5869]">Naam
            <input name="name" required placeholder="Bijvoorbeeld Inklapbare bakken" className="toolbar-control mt-1.5 w-full" />
          </label>
          <label className="min-w-[200px] flex-1 text-[11px] font-semibold text-[#4f5869]">Beschrijving (optioneel)
            <input name="description" placeholder="Omschrijving van deze groep" className="toolbar-control mt-1.5 w-full" />
          </label>
          <input type="hidden" name="isActive" value="on" />
          <button type="submit" className="primary-action">Productgroep toevoegen</button>
        </form>
      </section>
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-[#21364d]">Bestaande productgroepen</h2>
        {groups.length === 0 ? <div className="ps-panel p-5 text-[12px] text-[#748296]">Er zijn nog geen productgroepen. Je kunt een product ook zonder productgroep toevoegen.</div> : null}
        {groups.map((group) => {
          const coded = /^\d+$/.test(group.name)
          const label = productGroupLabel(group)
          const mergeTargets = targets.filter((target) => target.id !== group.id)
          return (
            <article key={group.id} className="ps-panel space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[13px] font-semibold text-[#21364d]">{label}</h3>
                  <p className="text-[11px] text-[#748296]">{group._count.products} producten, {group.isActive ? 'actief' : 'inactief'}{coded ? `, broncode ${group.name}` : ''}</p>
                </div>
                {label === 'Nog niet ingedeeld' ? <span className="rounded-lg bg-[#fff4df] px-2.5 py-1 text-[10px] font-semibold text-[#92641f]">Naam ontbreekt</span> : null}
              </div>
              <form action={saveProductGroupAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={group.id} />
                <label className="min-w-[210px] flex-1 text-[11px] font-semibold text-[#4f5869]">{coded ? 'Naam voor deze broncode' : 'Naam'}
                  <input name="name" required defaultValue={coded ? label === 'Nog niet ingedeeld' ? '' : label : group.name} placeholder="Geef deze groep een duidelijke naam" className="toolbar-control mt-1.5 w-full" />
                </label>
                {!coded ? <label className="min-w-[180px] flex-1 text-[11px] font-semibold text-[#4f5869]">Beschrijving
                  <input name="description" defaultValue={group.description ?? ''} className="toolbar-control mt-1.5 w-full" />
                </label> : null}
                <label className="flex items-center gap-2 text-[11px] text-[#4f5869]"><input type="checkbox" name="isActive" defaultChecked={group.isActive} /> Actief</label>
                <button type="submit" className="primary-action">Opslaan</button>
              </form>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#e7edf3] pt-3">
                <form action={mergeProductGroupAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="sourceId" value={group.id} />
                  <label className="text-[11px] font-semibold text-[#4f5869]">Producten samenvoegen met
                    <select name="targetId" defaultValue="" required className="toolbar-control mt-1.5 min-w-[190px]">
                      <option value="" disabled>Andere productgroep</option>
                      {mergeTargets.map((target) => <option key={target.id} value={target.id}>{productGroupLabel(target)}</option>)}
                    </select>
                  </label>
                  <button type="submit" disabled={!mergeTargets.length} className="secondary-action disabled:opacity-40">Samenvoegen</button>
                </form>
                <form action={deleteProductGroupAction}>
                  <input type="hidden" name="id" value={group.id} />
                  <button type="submit" disabled={group._count.products > 0} className="text-[11px] font-semibold text-[#a12d40] disabled:cursor-not-allowed disabled:opacity-40" title={group._count.products ? 'Verplaats eerst de gekoppelde producten.' : 'Verwijder lege productgroep'}>Verwijderen</button>
                </form>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
