export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { saveCompetitorAdminAction } from '@/app/actions/adminActions'
import { CompetitorRowActions } from '@/components/CompetitorRowActions'
import { CompetitorBulkTable } from '@/components/CompetitorBulkTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function BeheerConcurrentenPage() {
  const actor = await requireAdmin()
  const result = await safeDatabaseQuery(() => Promise.all([
    prisma.competitor.findMany({ where: { companyId: actor.companyId }, include: { country: true, _count: { select: { offers: true } } }, orderBy: { name: 'asc' } }),
    prisma.companyCountry.findMany({ where: { companyId: actor.companyId, isActive: true, country: { isActive: true } }, include: { country: true }, orderBy: { country: { name: 'asc' } } }),
  ]), [[], []])
  const [competitors, companyCountries] = result.data
  const countries = companyCountries.map((membership) => membership.country)
  const canWrite = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('competitors.write')

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold text-[#172033]">Concurrenten beheren</h1><p className="mt-1 text-[12px] text-[#6b788b]">Pauzeer of verwijder een concurrent. Verwijderen wist ook de gekoppelde prijsbronnen en prijshistorie.</p></div>
        {actor.role === 'SUPER_ADMIN' ? <Link href="/instellingen/data#danger-zone" className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700">Alle concurrenten verwijderen</Link> : null}
      </div>
      <form action={saveCompetitorAdminAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <fieldset disabled={!result.available || countries.length === 0} className="contents disabled:opacity-50">
        <input name="name" placeholder="Naam" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <input name="website" placeholder="Website" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <select name="countryId" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required>
          {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
        </select>
        <input name="checkFrequencyHours" type="number" defaultValue={24} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Actief</label>
        <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-5">Concurrent opslaan</button>
        </fieldset>
      </form>
      {countries.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Activeer eerst minimaal één markt voordat je concurrenten toevoegt.</p> : null}
      <CompetitorBulkTable
        canWrite={canWrite && result.available}
        columns={[
          { key: 'naam', header: 'Naam' },
          { key: 'land', header: 'Land' },
          { key: 'website', header: 'Website' },
          { key: 'frequentie', header: 'Controlefrequentie' },
          { key: 'status', header: 'Status' },
          { key: 'actie', header: 'Actie' },
        ]}
        rows={competitors.map((competitor) => ({
          id: competitor.id,
          name: competitor.name,
          offerCount: competitor._count.offers,
          naam: competitor.name,
          land: competitor.country.name,
          website: competitor.website,
          frequentie: competitor.checkFrequencyHours >= 876000 ? 'Handmatig' : `Iedere ${competitor.checkFrequencyHours} uur`,
          status: competitor.isActive ? 'Actief' : 'Inactief',
          actie: <CompetitorRowActions id={competitor.id} name={competitor.name} isActive={competitor.isActive} offerCount={competitor._count.offers} canWrite={canWrite} />,
        }))}
      />
    </div>
  )
}
