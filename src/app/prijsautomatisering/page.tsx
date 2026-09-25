export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { saveProductSettingAction } from '@/app/actions/productSettingsActions'
import { requirePermission } from '@/lib/authz'
import { getCompanyProductSettings } from '@/lib/product-settings'
import { prisma } from '@/lib/prisma'

const modeOptions = [['MONITOR','Monitor'],['ADVISE','Advise'],['APPROVE','Approve'],['AUTOMATIC','Automatic']] as const

function ModeFields({ mode, cooldown, inherit = false }: { mode: string; cooldown: number; inherit?: boolean }) {
  return <><select name="mode" defaultValue={mode} className="toolbar-control">{inherit ? <option value="INHERIT">Overnemen van productgroep</option> : null}{modeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><input name="cooldownHours" type="number" min="1" max="720" defaultValue={cooldown} className="toolbar-control" /><button className="secondary-action">Opslaan</button></>
}

export default async function Page() {
  const actor = await requirePermission('pricing.manage')
  const [groups, products, settings] = await Promise.all([
    prisma.productGroup.findMany({ where: { companyId: actor.companyId, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.product.findMany({ where: { companyId: actor.companyId, isActive: true }, select: { id:true, articleNumber:true, name:true, productGroupId:true }, orderBy: { name:'asc' }, take:300 }),
    getCompanyProductSettings(actor.companyId),
  ])
  const byGroup = new Map(settings.filter((x) => x.productGroupId).map((x) => [x.productGroupId!, x]))
  const byProduct = new Map(settings.filter((x) => x.productId).map((x) => [x.productId!, x]))
  return <div className="space-y-4">
    <div className="flex justify-end gap-2"><Link href="/prijsregels" className="secondary-action">Prijsregels</Link><Link href="/prijsuitleg" className="secondary-action">Prijsuitleg</Link><Link href="/prijswijzigingen" className="primary-action">Goedkeuringen</Link></div>
    <section className="surface-card overflow-hidden">
      <div className="border-b border-[#edf0f3] px-5 py-3.5"><h2 className="text-[14px] font-semibold">Productgroepen</h2></div>
      <div className="hidden grid-cols-[1fr_170px_120px_auto] gap-2 border-b border-[#edf0f3] bg-[#fafbfc] px-5 py-2 text-[10px] font-semibold text-[#7a8798] md:grid"><span>Productgroep</span><span>Modus</span><span>Cooldown uren</span><span /></div>
      <div className="px-5">{groups.map((group) => { const s=byGroup.get(group.id); return <form action={saveProductSettingAction} key={group.id} className="grid gap-2 border-b border-[var(--border)] py-3 md:grid-cols-[1fr_170px_120px_auto]"><input type="hidden" name="productGroupId" value={group.id}/><span className="text-[11px] font-semibold">{group.name}</span><ModeFields mode={s?.mode === 'INHERIT' ? 'ADVISE' : s?.mode ?? 'ADVISE'} cooldown={s?.cooldownHours ?? 24}/></form>})}</div>
    </section>
    <details className="surface-card overflow-hidden">
      <summary className="cursor-pointer list-none px-5 py-4 text-[14px] font-semibold">Productafwijkingen</summary>
      <div className="border-t border-[#edf0f3] px-5">{products.map((product) => { const s=byProduct.get(product.id); return <form action={saveProductSettingAction} key={product.id} className="grid gap-2 border-b border-[var(--border)] py-3 md:grid-cols-[1fr_170px_120px_auto]"><input type="hidden" name="productId" value={product.id}/><span className="text-[10px] font-semibold">{product.articleNumber} · {product.name}</span><ModeFields inherit mode={s?.mode ?? 'INHERIT'} cooldown={s?.cooldownHours ?? 24}/></form>})}</div>
    </details>
  </div>
}
