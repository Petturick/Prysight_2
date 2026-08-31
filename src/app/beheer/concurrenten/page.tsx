export const dynamic = 'force-dynamic'
import { deleteCompetitorAdminAction, saveCompetitorAdminAction } from '@/app/actions/adminActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function BeheerConcurrentenPage() {
  await requireAdmin()
  const result = await safeDatabaseQuery(() => Promise.all([
    prisma.competitor.findMany({ include: { country: true }, orderBy: { name: 'asc' } }),
    prisma.country.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]), [[], []])
  const [competitors, countries] = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <h1 className="text-3xl font-semibold">Concurrenten beheer</h1>
      <form action={saveCompetitorAdminAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <fieldset disabled={!result.available} className="contents disabled:opacity-50">
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
      <DataTable
        columns={[
          { key: 'naam', header: 'Naam' },
          { key: 'land', header: 'Land' },
          { key: 'website', header: 'Website' },
          { key: 'frequentie', header: 'Controlefrequentie' },
          { key: 'status', header: 'Status' },
          { key: 'actie', header: 'Actie' },
        ]}
        rows={competitors.map((competitor) => ({
          naam: competitor.name,
          land: competitor.country.name,
          website: competitor.website,
          frequentie: `${competitor.checkFrequencyHours} uur`,
          status: competitor.isActive ? 'Actief' : 'Inactief',
          actie: <form action={deleteCompetitorAdminAction}><input type="hidden" name="id" value={competitor.id} /><button className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700">Verwijderen</button></form>,
        }))}
      />
    </div>
  )
}
