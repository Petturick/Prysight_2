import { activateCompanyCountryAction } from '@/app/actions/onboardingActions'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

export default async function MarketsSettingsPage() {
  const user = await requirePermission('settings.manage')
  const [countries, active] = await Promise.all([
    prisma.country.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.companyCountry.findMany({ where: { companyId: user.companyId, isActive: true }, include: { country: true } }),
  ])
  const activeIds = new Set(active.map((item) => item.countryId))
  return <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
    <section className="strong-panel p-5"><p className="eyebrow">Actieve markten</p><h2 className="mt-2 text-[15px] font-bold text-[#252a37]">Waar wil je vergelijken</h2><p className="mt-2 text-[11px] leading-5 text-[#6b778a]">Alleen geactiveerde landen tellen mee voor imports, concurrenten en licentielimieten.</p><div className="mt-4 space-y-2">{active.length ? active.map((item) => <div key={item.id} className="flex items-center justify-between rounded-[10px] bg-[#f5f8fb] px-4 py-3"><div><p className="text-[11px] font-semibold text-[#2d3c52]">{item.country.name}</p><p className="mt-0.5 text-[9px] text-[#8693a5]">{item.country.code} · {item.country.currency}</p></div>{item.isDefault ? <span className="rounded-full bg-[#e8f1ff] px-2.5 py-1 text-[9px] font-semibold text-[#3977db]">Standaard</span> : <span className="text-[9px] font-semibold text-[#2d9669]">Actief</span>}</div>) : <div className="rounded-[10px] border border-dashed border-[#d7dfe9] p-5 text-center text-[11px] text-[#7b899b]">Nog geen markt geactiveerd.</div>}</div></section>
    <section className="strong-panel p-5"><p className="eyebrow">Markt toevoegen</p><h2 className="mt-2 text-[15px] font-bold text-[#252a37]">Beschikbare landen</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{countries.map((country) => { const enabled = activeIds.has(country.id); return <div key={country.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e2e7ee] bg-white px-4 py-3"><div><p className="text-[11px] font-semibold text-[#2d3c52]">{country.name}</p><p className="mt-0.5 text-[9px] text-[#8794a6]">{country.code} · {country.currency}</p></div>{enabled ? <span className="text-[9px] font-semibold text-[#2d9669]">Geactiveerd</span> : <form action={activateCompanyCountryAction}><input type="hidden" name="countryId" value={country.id} /><button className="secondary-action">Activeren</button></form>}</div>})}</div></section>
  </div>
}
