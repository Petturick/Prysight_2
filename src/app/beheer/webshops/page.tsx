export const dynamic = 'force-dynamic'
import { deleteWebshopAction, saveWebshopAction } from '@/app/actions/adminActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function WebshopsBeheerPage() {
  await requireAdmin()
  const result = await safeDatabaseQuery(() => Promise.all([
    prisma.webshop.findMany({ include: { country: true, competitor: true }, orderBy: { name: 'asc' } }),
    prisma.country.findMany({ orderBy: { name: 'asc' } }),
    prisma.competitor.findMany({ orderBy: { name: 'asc' } }),
  ]), [[], [], []])
  const [webshops, countries, competitors] = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <h1 className="text-3xl font-semibold">Webshops beheer</h1>
      <form action={saveWebshopAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <fieldset disabled={!result.available} className="contents disabled:opacity-50">
        <input name="name" placeholder="Naam" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <input name="url" placeholder="URL" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <select name="countryId" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required>
          {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
        </select>
        <select name="competitorId" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">Geen gekoppelde concurrent</option>
          {competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Actief</label>
        <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-5">Webshop opslaan</button>
        </fieldset>
      </form>
      <DataTable
        columns={[
          { key: 'naam', header: 'Naam' },
          { key: 'land', header: 'Land' },
          { key: 'url', header: 'URL' },
          { key: 'concurrent', header: 'Concurrent' },
          { key: 'status', header: 'Status' },
          { key: 'actie', header: 'Actie' },
        ]}
        rows={webshops.map((webshop) => ({
          naam: webshop.name,
          land: webshop.country.name,
          url: webshop.url,
          concurrent: webshop.competitor?.name ?? '—',
          status: webshop.isActive ? 'Actief' : 'Inactief',
          actie: <form action={deleteWebshopAction}><input type="hidden" name="id" value={webshop.id} /><button className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700">Verwijderen</button></form>,
        }))}
      />
    </div>
  )
}
