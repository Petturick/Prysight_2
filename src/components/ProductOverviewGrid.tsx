'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export type ProductGridRow = {
  id: string
  articleNumber: string
  name: string
  ean: string
  group: string
  markets: string
  ownEx: string
  ownInc: string
  marketEx: string
  marketInc: string
  shipping: string
  delivered: string
  difference: string
  differencePct: number | null
  sources: number
  lastChecked: string
  status: string
  review: number
  detailHref: string
}

type Column = 'articleNumber' | 'name' | 'ean' | 'group' | 'markets' | 'ownEx' | 'ownInc' | 'marketEx' | 'marketInc' | 'shipping' | 'delivered' | 'difference' | 'sources' | 'lastChecked' | 'status'
const COLUMNS: Array<{ key: Column; label: string; align?: 'right' }> = [
  { key: 'articleNumber', label: 'Artikelnummer' },
  { key: 'name', label: 'Product' },
  { key: 'ean', label: 'EAN / GTIN' },
  { key: 'group', label: 'Productgroep' },
  { key: 'markets', label: 'Markten' },
  { key: 'ownEx', label: 'Eigen excl. btw', align: 'right' },
  { key: 'ownInc', label: 'Eigen incl. btw', align: 'right' },
  { key: 'marketEx', label: 'Laagste excl. btw', align: 'right' },
  { key: 'marketInc', label: 'Laagste incl. btw', align: 'right' },
  { key: 'shipping', label: 'Verzendkosten', align: 'right' },
  { key: 'delivered', label: 'Totaal incl. verzending', align: 'right' },
  { key: 'difference', label: 'Prijsverschil', align: 'right' },
  { key: 'sources', label: 'Bronnen', align: 'right' },
  { key: 'lastChecked', label: 'Laatste meting' },
  { key: 'status', label: 'Status' },
]
const DEFAULT_COLUMNS: Column[] = [
  'articleNumber', 'name', 'ean', 'markets', 'ownInc',
  'marketInc', 'difference', 'sources', 'status',
]

export function ProductOverviewGrid({
  rows,
  totalCount,
  countryId,
  canCrawl,
  canDelete,
  deleteAction,
  refreshPricesAction,
  refreshSinglePriceAction,
  filters,
}: {
  rows: ProductGridRow[]
  totalCount: number
  countryId?: string
  canCrawl: boolean
  canDelete: boolean
  deleteAction: (data: FormData) => Promise<void>
  refreshPricesAction: (data: FormData) => Promise<void>
  refreshSinglePriceAction: (data: FormData) => Promise<void>
  filters: {
    q?: string
    productGroupId?: string
    countryId?: string
    competitorId?: string
    identifierStatus?: string
  }
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [allResultsSelected, setAllResultsSelected] = useState(false)
  const [visible, setVisible] = useState<Column[]>(DEFAULT_COLUMNS)
  const [compact, setCompact] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sourceLookup, setSourceLookup] = useState<{ running: boolean; done: number; total: number; created: number; errors: number; message: string } | null>(null)
  const router = useRouter()
  const selectAllRef = useRef<HTMLInputElement>(null)
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selectedSet.has(id))
  const partlySelected = rowIds.some((id) => selectedSet.has(id)) && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partlySelected
  }, [partlySelected])

  function toggleColumn(key: Column) {
    const next = visible.includes(key)
      ? visible.filter((value) => value !== key)
      : COLUMNS.map((item) => item.key).filter((value) => visible.includes(value) || value === key)
    if (!next.includes('name')) return
    setVisible(next)
  }

  function toggleRow(id: string, checked: boolean) {
    if (allResultsSelected) {
      setAllResultsSelected(false)
      setSelected(checked ? rowIds : rowIds.filter((value) => value !== id))
      return
    }
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))
  }

  const chosenColumns = COLUMNS.filter((column) => visible.includes(column.key))
  const cellPadding = compact ? 'px-2.5 py-2' : 'px-3 py-3.5'

  async function discoverSources(ids: string[]) {
    if (sourceLookup?.running) return
    const products = rows.filter((row) => ids.includes(row.id) && row.ean.trim())
    if (!products.length) {
      setSourceLookup({ running: false, done: 0, total: 0, created: 0, errors: 0, message: 'Selecteer minimaal één product met EAN of GTIN.' })
      return
    }
    let created = 0
    let errors = 0
    setSourceLookup({ running: true, done: 0, total: products.length, created: 0, errors: 0, message: 'Product URLs en concurrenten worden gezocht…' })
    // Work through the selected page without launching dozens of concurrent searches.
    for (let index = 0; index < products.length; index++) {
      try {
        const response = await fetch(`/api/producten/${encodeURIComponent(products[index].id)}/discover`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countryId }),
        })
        const payload = await response.json() as { created?: number; error?: string; skipped?: boolean; reason?: string }
        if (!response.ok) throw new Error(payload.error || 'Zoeken mislukt')
        if (payload.skipped) errors += 1
        created += payload.created ?? 0
      } catch { errors += 1 }
      setSourceLookup({ running: true, done: index + 1, total: products.length, created, errors, message: `EAN bronnen controleren, ${index + 1} van ${products.length} verwerkt…` })
    }
    setSourceLookup({ running: false, done: products.length, total: products.length, created, errors, message: `${created} nieuwe URL suggesties om te beoordelen.${errors ? ` ${errors} producten konden niet worden gecontroleerd.` : ''}` })
    router.refresh()
  }

  function displayName(row: ProductGridRow) {
    const value = row.name.replace(/<[^>]*>/g, '').trim()
    return value && /[\p{L}\p{N}]/u.test(value) ? value : `Naam ontbreekt, artikel ${row.articleNumber}`
  }

  function renderValue(row: ProductGridRow, key: Column) {
    if (key === 'name') return (
      <div className="min-w-[150px] max-w-[245px]">
        <Link href={row.detailHref} className="block truncate font-semibold text-[#23364d] hover:text-[#346ed6]" title={displayName(row)}>{displayName(row)}</Link>
        {row.review > 0 ? <span className="mt-0.5 block text-[10px] font-semibold text-[#a16b16]">{row.review} URL suggesties</span> : null}
        {row.sources === 0 && row.review === 0 && row.ean ? <button type="button" onClick={() => void discoverSources([row.id])} disabled={sourceLookup?.running} className="mt-0.5 text-[10px] font-semibold text-[#346ed6] disabled:opacity-40">Zoek product en concurrent URLs</button> : null}
      </div>
    )
    if (key === 'difference') return <span className={row.differencePct === null ? 'text-[#8895a5]' : row.differencePct > 0 ? 'font-semibold text-[#b6414d]' : row.differencePct < 0 ? 'font-semibold text-[#20814d]' : 'font-semibold text-[#586a7e]'}>{row.difference}</span>
    if (key === 'status') return <span className={'whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ' + (row.status === 'Actueel' ? 'bg-[#eaf8f0] text-[#20814d]' : row.status === 'Controle mislukt' ? 'bg-[#fff0f1] text-[#aa3947]' : 'bg-[#fff4df] text-[#936519]')}>{row.status}</span>
    const value = String(row[key] ?? '')
    return <span className={'block whitespace-nowrap ' + (key === 'ean' || key === 'markets' ? 'text-[#758498]' : '')} title={value}>{value || '—'}</span>
  }

  const selectionCount = allResultsSelected ? totalCount : selected.length

  return (
    <form action={deleteAction} className="space-y-2">
      <input type="hidden" name="deleteScope" value={allResultsSelected ? 'filtered' : 'selected'} />
      <input type="hidden" name="filterQ" value={filters.q ?? ''} />
      <input type="hidden" name="filterProductGroupId" value={filters.productGroupId ?? ''} />
      <input type="hidden" name="filterCountryId" value={filters.countryId ?? ''} />
      <input type="hidden" name="filterCompetitorId" value={filters.competitorId ?? ''} />
      <input type="hidden" name="filterIdentifierStatus" value={filters.identifierStatus ?? ''} />
      <section className="ps-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7edf3] px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-[11px] font-semibold text-[#315fa7]">{selectionCount} geselecteerd</span>
            <span className="text-[10px] text-[#78889b]">{rows.length} op deze pagina, {totalCount} totaal</span>
            <button type="button" className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px]" disabled={!rows.length || allSelected || allResultsSelected} onClick={() => { setAllResultsSelected(false); setSelected(rowIds) }}>Selecteer pagina</button>
            <button type="button" className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px]" disabled={!totalCount || allResultsSelected} onClick={() => { setSelected([]); setAllResultsSelected(true) }}>Selecteer alle {totalCount}</button>
            <button type="button" className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px]" disabled={!selectionCount} onClick={() => { setSelected([]); setAllResultsSelected(false) }}>Deselecteer alles</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void discoverSources(selected)} disabled={allResultsSelected || !selected.some((id) => rows.some((row) => row.id === id && row.ean)) || sourceLookup?.running} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40">{sourceLookup?.running ? `URLs zoeken ${sourceLookup.done}/${sourceLookup.total}` : 'EAN en URLs zoeken'}</button>
            {canCrawl ? <button type="submit" formAction={refreshPricesAction} disabled={allResultsSelected || !selected.length} className="primary-action min-h-[34px] px-3 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40">Prijzen ophalen ({selected.length})</button> : null}
            {canDelete ? <button type="submit" disabled={!selectionCount} onClick={(event) => {
              const scope = allResultsSelected ? `alle ${totalCount} producten in de huidige selectie` : `${selected.length} geselecteerde producten`
              if (!window.confirm('Je verwijdert ' + scope + ' en hun koppelingen definitief. Doorgaan?')) event.preventDefault()
            }} className="ps-button-danger min-h-[34px] px-3 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40">Verwijderen ({selectionCount})</button> : null}
            <details className="relative">
              <summary className="secondary-action min-h-[34px] cursor-pointer list-none px-3 py-1.5 text-[10px]">Kolommen ({visible.length})</summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-[230px] rounded-xl border border-[#dbe3ed] bg-white p-3 shadow-xl">
                <p className="mb-2 text-[10px] font-semibold text-[#60738a]">Zichtbare kolommen</p>
                <div className="grid gap-2">
                  {COLUMNS.map((column) => <label key={column.key} className="flex cursor-pointer items-center gap-2 text-[11px] text-[#34495f]"><input type="checkbox" checked={visible.includes(column.key)} disabled={column.key === 'name'} onChange={() => toggleColumn(column.key)} className="h-4 w-4 accent-[#346ed6]" />{column.label}</label>)}
                </div>
                <button type="button" onClick={() => {
                  setVisible(DEFAULT_COLUMNS)
                }} className="mt-3 text-[10px] font-semibold text-[#346ed6]">Standaard herstellen</button>
              </div>
            </details>
            <button type="button" onClick={() => setCompact((value) => !value)} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">{compact ? 'Ruimer' : 'Compacter'}</button>
          </div>
        </div>
        {sourceLookup ? <div role="status" aria-live="polite" className="border-b border-[#e7edf3] bg-[#f3f8ff] px-4 py-2 text-[11px] font-medium text-[#315fa7]">{sourceLookup.message} {sourceLookup.created > 0 ? <Link href="/productmatches" className="ml-2 font-semibold underline">Bekijk suggesties</Link> : null}</div> : null}
        <div className="w-full overflow-x-auto" role="region" aria-label="Productenoverzicht" tabIndex={0}>
          <table className="w-full min-w-[1030px] table-auto border-separate border-spacing-0 text-left text-[11px]">
            <thead className="sticky top-0 z-20 bg-[#f6f8fb] text-[10px] font-semibold text-[#67788c]">
              <tr>
                <th className="sticky left-0 z-30 w-[42px] min-w-[42px] border-b border-r border-[#e4eaf1] bg-[#f6f8fb] px-3 py-2">
                  <input ref={selectAllRef} type="checkbox" checked={allSelected || allResultsSelected} onChange={(event) => { setAllResultsSelected(false); setSelected(event.target.checked ? rowIds : []) }} disabled={!rowIds.length} aria-label="Selecteer alle producten op deze pagina" className="h-4 w-4 cursor-pointer accent-[#346ed6]" />
                </th>
                {chosenColumns.map((column) => <th key={column.key} scope="col" className={cellPadding + ' whitespace-nowrap border-b border-r border-[#e4eaf1] bg-[#f6f8fb] ' + (column.align === 'right' ? 'text-right ' : '') + (column.key === 'name' ? 'sticky left-[42px] z-20 min-w-[170px] ' : '')}>{column.label}</th>)}
                <th className={cellPadding + ' whitespace-nowrap border-b border-[#e4eaf1] bg-[#f6f8fb] text-right'}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowSelected = allResultsSelected || selectedSet.has(row.id)
                return <Fragment key={row.id}>
                <tr className={rowSelected ? 'bg-[#eef5ff]' : 'bg-white hover:bg-[#f8fbff]'}>
                  <td className={'sticky left-0 z-10 w-[42px] min-w-[42px] border-b border-r border-[#edf1f5] px-3 ' + (rowSelected ? 'bg-[#eef5ff]' : 'bg-white')}>
                    <input type="checkbox" name="productIds" value={row.id} checked={rowSelected} onChange={(event) => toggleRow(row.id, event.target.checked)} aria-label={'Selecteer ' + row.articleNumber} className="h-4 w-4 cursor-pointer accent-[#346ed6]" />
                  </td>
                  {chosenColumns.map((column) => <td key={column.key} className={cellPadding + ' border-b border-r border-[#edf1f5] ' + (column.align === 'right' ? 'text-right tabular-nums ' : '') + (column.key === 'name' ? 'sticky left-[42px] z-10 ' + (rowSelected ? 'bg-[#eef5ff]' : 'bg-white') : '')}>{renderValue(row, column.key)}</td>)}
                  <td className={cellPadding + ' whitespace-nowrap border-b border-[#edf1f5] text-right'}>
                    <button type="button" onClick={() => setExpandedId((current) => current === row.id ? null : row.id)} aria-expanded={expandedId === row.id} className="mr-2 text-[10px] font-semibold text-[#346ed6]">{expandedId === row.id ? 'Minder' : 'Details'}</button>
                    <Link href={row.detailHref} className="secondary-action min-h-[30px] px-2.5 py-1.5 text-[10px]">Openen</Link>
                    {canCrawl && row.sources > 0 ? <button type="submit" name="singleProductId" value={row.id} formAction={refreshSinglePriceAction} className="ml-2 text-[10px] font-semibold text-[#346ed6]">Nu crawlen</button> : null}
                  </td>
                </tr>
                {expandedId === row.id ? <tr className="bg-[#f7faff]"><td colSpan={chosenColumns.length + 2} className="border-b border-[#dfe8f5] px-5 py-4">
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                    {([
                      ['Productgroep', row.group], ['Eigen excl. btw', row.ownEx], ['Eigen incl. btw', row.ownInc],
                      ['Laagste excl. btw', row.marketEx], ['Laagste incl. btw', row.marketInc], ['Verzendkosten', row.shipping],
                      ['Totaal incl. verzending', row.delivered], ['Prijsverschil', row.difference], ['Bronnen', String(row.sources)],
                      ['Laatste meting', row.lastChecked], ['EAN / GTIN', row.ean || 'Ontbreekt'],
                      ['Markten', row.markets], ['Status', row.status],
                    ] as Array<[string, string]>).map(([label, value]) => <div key={label}><p className="text-[10px] text-[#697a90]">{label}</p><p className="mt-1 text-[12px] font-semibold text-[#23364d]">{value}</p></div>)}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {row.ean ? <button type="button" onClick={() => void discoverSources([row.id])} disabled={sourceLookup?.running} className="secondary-action min-h-[30px] px-3 py-1 text-[11px] disabled:opacity-40">Zoek EAN en concurrent URLs</button> : <span className="text-[11px] text-[#a16b16]">EAN ontbreekt, vul deze eerst aan.</span>}
                    <Link href={row.detailHref} className="text-[11px] font-semibold text-[#346ed6]">Open product en prijssuggesties</Link>
                  </div>
                </td></tr> : null}
              </Fragment>
              })}
              {rows.length === 0 ? <tr><td colSpan={chosenColumns.length + 2} className="px-6 py-12 text-center text-[12px] text-[#78889b]">Geen producten gevonden, pas de filters aan of voeg een product toe.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[10px] text-[#7d8b9b]">Je kunt één pagina selecteren of alle resultaten van de huidige filters. Deselecteer alles maakt de volledige selectie direct leeg. Klik op Details voor productprijzen en broninformatie.</p>
      </section>
    </form>
  )
}
