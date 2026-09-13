export const dynamic = 'force-dynamic'
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
  return <div className="space-y-5"><section className="strong-panel p-5"><p className="eyebrow">Pricingmodus</p><h1 className="mt-2 text-[28px] font-semibold">Monitor, adviseer, laat goedkeuren of voer gecontroleerd uit</h1><p className="mt-2 text-[11px] leading-5 text-[#697386]">Productgroep is de standaard. Productafwijkingen zijn optioneel. Cooldown voorkomt te frequente prijswijzigingen; prijsregels en margegrenzen blijven altijd leidend.</p></section><section className="surface-card p-5"><h2 className="text-[14px] font-semibold">Productgroepen</h2>{groups.map((group) => { const s=byGroup.get(group.id); return <form action={saveProductSettingAction} key={group.id} className="grid gap-2 border-b border-[var(--border)] py-3 md:grid-cols-[1fr_170px_120px_auto]"><input type="hidden" name="productGroupId" value={group.id}/><span className="text-[11px] font-semibold">{group.name}</span><ModeFields mode={s?.mode === 'INHERIT' ? 'ADVISE' : s?.mode ?? 'ADVISE'} cooldown={s?.cooldownHours ?? 24}/></form>})}</section><section className="surface-card p-5"><h2 className="text-[14px] font-semibold">Productafwijkingen</h2>{products.map((product) => { const s=byProduct.get(product.id); return <form action={saveProductSettingAction} key={product.id} className="grid gap-2 border-b border-[var(--border)] py-3 md:grid-cols-[1fr_170px_120px_auto]"><input type="hidden" name="productId" value={product.id}/><span className="text-[10px] font-semibold">{product.articleNumber} · {product.name}</span><ModeFields inherit mode={s?.mode ?? 'INHERIT'} cooldown={s?.cooldownHours ?? 24}/></form>})}</section></div>
}
