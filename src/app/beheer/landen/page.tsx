export const dynamic = 'force-dynamic'
import { deleteCountryAction, saveCountryAction } from '@/app/actions/adminActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function LandenBeheerPage() {
  await requireAdmin()
  const result = await safeDatabaseQuery(() => prisma.country.findMany({ orderBy: { name: 'asc' } }), [])
  const countries = result.data
  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <h1 className="text-3xl font-semibold">Landen beheer</h1>
      <form action={saveCountryAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <fieldset disabled={!result.available} className="contents disabled:opacity-50">
        <input name="code" placeholder="Code" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <input name="name" placeholder="Naam" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <input name="vatRate" placeholder="BTW %" type="number" step="0.01" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <input name="currency" placeholder="Valuta" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" required />
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Actief</label>
        <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-5">Land opslaan</button>
        </fieldset>
      </form>
      <DataTable
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'naam', header: 'Naam' },
          { key: 'btw', header: 'BTW' },
          { key: 'valuta', header: 'Valuta' },
          { key: 'status', header: 'Status' },
          { key: 'acties', header: 'Acties' },
        ]}
        rows={countries.map((country) => ({
          code: country.code,
          naam: country.name,
          btw: `${formatNumber(Number(country.vatRate), 2)}%`,
          valuta: country.currency,
          status: country.isActive ? 'Actief' : 'Inactief',
          acties: <form action={deleteCountryAction}><input type="hidden" name="id" value={country.id} /><button className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700">Verwijderen</button></form>,
        }))}
      />
    </div>
  )
}
