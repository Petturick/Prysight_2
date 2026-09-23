'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { deleteSelectedCompetitorsAction } from '@/app/actions/competitorBulkActions'
import { DataTable } from '@/components/DataTable'

type Cell = ReactNode | string | number | null | undefined
type CompetitorTableRow = {
  id: string
  name: string
  offerCount: number
  [key: string]: Cell
}
type Column = { key: string; header: string; className?: string }
type Props = {
  rows: CompetitorTableRow[]
  columns: Column[]
  canWrite: boolean
  emptyText?: string
}

export function CompetitorBulkTable({ rows, columns, canWrite, emptyText }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentMarket = searchParams.toString()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const rowKeys = rows.map(row => row.id).join('|')
  useEffect(() => {
    setSelected(new Set())
    setConfirming(false)
    setConfirmation('')
    setError('')
    setSuccess('')
  }, [pathname, currentMarket, rowKeys])

  const selectedRows = useMemo(() => rows.filter(row => selected.has(row.id)), [rows, selected])
  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const offerCount = selectedRows.reduce((sum, row) => sum + row.offerCount, 0)
  const confirmText = `VERWIJDER ${selectedRows.length} CONCURRENTEN`
  const canDelete = canWrite && !deleting && selectedRows.length > 0 && confirmation === confirmText

  const toggle = (id: string) => {
    if (deleting) return
    setError('')
    setSuccess('')
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteSelected = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canDelete) return
    setDeleting(true)
    setError('')
    try {
      const result = await deleteSelectedCompetitorsAction(new FormData(event.currentTarget))
      setConfirming(false)
      setConfirmation('')
      setSelected(new Set())
      setSuccess(`${result.deleted} concurrent${result.deleted === 1 ? '' : 'en'} definitief verwijderd.`)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Verwijderen is mislukt. Probeer het opnieuw.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      {canWrite && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e0e8f2] bg-white px-4 py-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[#263b53]">
            <input
              type="checkbox"
              aria-label="Alle getoonde concurrenten selecteren"
              checked={allSelected}
              disabled={deleting}
              onChange={event => setSelected(event.target.checked ? new Set(rows.map(row => row.id)) : new Set())}
              className="h-4 w-4 accent-[#2f6edb]"
            />
            Alle getoonde concurrenten selecteren
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-[#687a90]">{selectedRows.length} van {rows.length} geselecteerd</span>
            {selectedRows.length > 0 ? (
              <>
                <button type="button" className="secondary-action min-h-0 px-3 py-2 text-[12px]" disabled={deleting} onClick={() => setSelected(new Set())}>Selectie wissen</button>
                <button type="button" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50" disabled={deleting || selectedRows.length > 1000} onClick={() => { setError(''); setConfirmation(''); setConfirming(true) }}>
                  {selectedRows.length} concurrenten verwijderen
                </button>
              </>
            ) : null}
          </div>
          {selectedRows.length > 1000 ? <p role="alert" className="w-full text-[12px] text-rose-700">Selecteer maximaal 1000 concurrenten tegelijk.</p> : null}
        </div>
      ) : null}

      {success ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">{success}</p> : null}
      {error && !confirming ? <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-[12px] text-rose-800">{error}</p> : null}

      <DataTable
        columns={canWrite ? [{ key: 'selectie', header: 'Selecteer' }, ...columns] : columns}
        rows={rows.map(row => ({
          ...row,
          selectie: canWrite ? (
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              disabled={deleting}
              aria-label={`Selecteer concurrent ${row.name}`}
              className="h-4 w-4 cursor-pointer accent-[#2f6edb]"
            />
          ) : null,
        }))}
        emptyText={emptyText}
      />

      {confirming && selectedRows.length > 0 && canWrite ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111c2d]/60 p-4" role="presentation">
          <form role="dialog" aria-modal="true" aria-labelledby="competitor-delete-title" onSubmit={deleteSelected} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="competitor-delete-title" className="text-[18px] font-semibold text-[#24364e]">Concurrenten definitief verwijderen</h2>
            <p className="text-[13px] leading-6 text-[#465771]">
              Je verwijdert {selectedRows.length} concurrenten met samen {offerCount} prijsbronnen, inclusief bijbehorende productkoppelingen, metingen en prijshistorie. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[12px] text-[#465771]">
              {selectedRows.map(row => <div key={row.id} className="py-1">{row.name}, {row.offerCount} prijsbronnen</div>)}
            </div>
            {selectedRows.map(row => (
              <div key={row.id}>
                <input type="hidden" name="competitorIds" value={row.id} />
                <input type="hidden" name="expectedNames" value={row.name} />
                <input type="hidden" name="expectedOffers" value={row.offerCount} />
              </div>
            ))}
            <label className="block space-y-2 text-[12px] font-medium text-[#465771]">
              <span>Typ <strong>{confirmText}</strong> om te bevestigen</span>
              <input name="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" autoFocus className="toolbar-control w-full" />
            </label>
            {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={deleting} onClick={() => { setConfirming(false); setConfirmation(''); setError('') }} className="secondary-action">Annuleren</button>
              <button type="submit" disabled={!canDelete} className="rounded-lg bg-rose-700 px-4 py-2 text-[12px] font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40">
                {deleting ? 'Bezig met verwijderen…' : `${selectedRows.length} concurrenten verwijderen`}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
