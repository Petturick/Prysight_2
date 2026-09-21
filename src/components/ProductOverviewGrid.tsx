'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
  difference: string
  differencePct: number | null
  sources: number
  lastChecked: string
  status: string
  review: number
  detailHref: string
}

type SelectionScope = {
  q?: string
  productGroupId?: string
  countryId?: string
  competitorId?: string
  identifierStatus?: string
}

type Column = 'articleNumber' | 'name' | 'ean' | 'group' | 'markets' | 'ownEx' | 'ownInc' | 'marketEx' | 'marketInc' | 'difference' | 'sources' | 'lastChecked' | 'status'
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
  { key: 'difference', label: 'Prijsverschil', align: 'right' },
  { key: 'sources', label: 'Bronnen', align: 'right' },
  { key: 'lastChecked', label: 'Laatste meting' },
  { key: 'status', label: 'Status' },
]
const DEFAULT_COLUMNS: Column[] = [
  'articleNumber', 'name', 'ean', 'markets', 'ownEx', 'ownInc',
  'marketInc', 'difference', 'sources', 'lastChecked', 'status',
]

function InlineEditableCell({
  productId,
  field,
  value,
  canEdit,
  updateAction,
  className = '',
}: {
  productId: string
  field: 'articleNumber' | 'name' | 'ean'
  value: string
  canEdit: boolean
  updateAction: (data: FormData) => Promise<void>
  className?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  async function save() {
    if (saving) return
    if (draft.trim() === value.trim()) {
      setEditing(false)
      setError(null)
      return
    }
    setSaving(true)
    setError(null)
    const data = new FormData()
    data.set('productId', productId)
    data.set('field', field)
    data.set('value', draft)
    try {
      await updateAction(data)
      setEditing(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Wijziging kon niet worden opgeslagen.')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) return <span className={className} title={value}>{value || '—'}</span>

  if (editing) {
    return (
      <div className="min-w-[120px]">
        <input
          autoFocus
          value={draft}
          inputMode={field === 'ean' ? 'numeric' : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') {
              setDraft(value)
              setError(null)
              setEditing(false)
            }
          }}
          disabled={saving}
          className="h-8 w-full min-w-[120px] rounded-md border border-[#96b8ee] bg-white px-2 text-[11px] font-medium text-[#263b52] outline-none shadow-[0_0_0_2px_rgba(79,134,232,.08)]"
        />
        {error ? <p className="mt-1 max-w-[220px] whitespace-normal text-[9px] font-semibold text-[#b33b47]">{error}</p> : null}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value)
        setError(null)
        setEditing(true)
      }}
      className={`block max-w-full cursor-text truncate rounded px-1 py-0.5 text-left hover:bg-[#edf4ff] hover:text-[#2f6edb] ${className}`}
      title={value ? `${value}, klik om te wijzigen` : 'Klik om in te vullen'}
    >
      {value || '—'}
    </button>
  )
}

export function ProductOverviewGrid({
  rows,
  totalCount,
  canCrawl,
  canDelete,
  canEdit,
  selectionScope,
  deleteAction,
  refreshPricesAction,
  refreshSinglePriceAction,
  updateFieldAction,
}: {
  rows: ProductGridRow[]
  totalCount: number
  canCrawl: boolean
  canDelete: boolean
  canEdit: boolean
  selectionScope: SelectionScope
  deleteAction: (data: FormData) => Promise<void>
  refreshPricesAction: (data: FormData) => Promise<void>
  refreshSinglePriceAction: (data: FormData) => Promise<void>
  updateFieldAction: (data: FormData) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [selectAllResults, setSelectAllResults] = useState(false)
  const [excluded, setExcluded] = useState<string[]>([])
  const [visible, setVisible] = useState<Column[]>(DEFAULT_COLUMNS)
  const [compact, setCompact] = useState(true)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const excludedSet = useMemo(() => new Set(excluded), [excluded])
  const rowSelected = (id: string) => selectAllResults ? !excludedSet.has(id) : selectedSet.has(id)
  const selectedOnPage = rowIds.filter(rowSelected).length
  const allPageSelected = rowIds.length > 0 && selectedOnPage === rowIds.length
  const partlySelected = selectedOnPage > 0 && !allPageSelected
  const selectedCount = selectAllResults ? Math.max(totalCount - excluded.length, 0) : selected.length

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
    if (selectAllResults) {
      setExcluded((current) => checked
        ? current.filter((value) => value !== id)
        : [...new Set([...current, id])])
      return
    }
    setSelected((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((value) => value !== id))
  }

  function selectPage() {
    setSelectAllResults(false)
    setExcluded([])
    setSelected(rowIds)
  }

  function clearSelection() {
    setSelectAllResults(false)
    setExcluded([])
    setSelected([])
  }

  function selectEveryResult() {
    setSelectAllResults(true)
    setExcluded([])
    setSelected([])
  }

  const chosenColumns = COLUMNS.filter((column) => visible.includes(column.key))
  const cellPadding = compact ? 'px-3 py-2' : 'px-3 py-3.5'

  function renderValue(row: ProductGridRow, key: Column) {
    if (key === 'name') return (
      <div className="min-w-[190px] max-w-[380px]">
        <InlineEditableCell productId={row.id} field="name" value={row.name} canEdit={canEdit} updateAction={updateFieldAction} className="font-semibold text-[#23364d]" />
        {row.review > 0 ? <span className="mt-0.5 block text-[9px] font-semibold text-[#a16b16]">{row.review} suggesties te beoordelen</span> : null}
      </div>
    )
    if (key === 'articleNumber') return <InlineEditableCell productId={row.id} field="articleNumber" value={row.articleNumber} canEdit={canEdit} updateAction={updateFieldAction} className="font-semibold text-[#40556e]" />
    if (key === 'ean') return <InlineEditableCell productId={row.id} field="ean" value={row.ean} canEdit={canEdit} updateAction={updateFieldAction} className="text-[#758498]" />
    if (key === 'difference') return <span className={row.differencePct === null ? 'text-[#8895a5]' : row.differencePct > 0 ? 'font-semibold text-[#b6414d]' : row.differencePct < 0 ? 'font-semibold text-[#20814d]' : 'font-semibold text-[#586a7e]'}>{row.difference}</span>
    if (key === 'status') return <span className={'whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ' + (row.status === 'Actueel' ? 'bg-[#eaf8f0] text-[#20814d]' : row.status === 'Controle mislukt' ? 'bg-[#fff0f1] text-[#aa3947]' : 'bg-[#fff4df] text-[#936519]')}>{row.status}</span>
    const value = String(row[key] ?? '')
    return <span className={'block whitespace-nowrap ' + (key === 'markets' ? 'text-[#758498]' : '')} title={value}>{value || '—'}</span>
  }

  return (
    <form action={deleteAction} className="space-y-2">
      <input type="hidden" name="selectionMode" value={selectAllResults ? 'all' : 'explicit'} />
      <input type="hidden" name="selectionQ" value={selectionScope.q ?? ''} />
      <input type="hidden" name="selectionProductGroupId" value={selectionScope.productGroupId ?? ''} />
      <input type="hidden" name="selectionCountryId" value={selectionScope.countryId ?? ''} />
      <input type="hidden" name="selectionCompetitorId" value={selectionScope.competitorId ?? ''} />
      <input type="hidden" name="selectionIdentifierStatus" value={selectionScope.identifierStatus ?? ''} />
      {excluded.map((id) => <input key={id} type="hidden" name="excludedProductIds" value={id} />)}

      <section className="ps-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7edf3] px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-[11px] font-semibold text-[#315fa7]">{selectedCount} geselecteerd</span>
            <span className="text-[10px] text-[#78889b]">{rows.length} op deze pagina, {totalCount} totaal</span>
            <button type="button" className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px]" disabled={!rows.length || (allPageSelected && !selectAllResults)} onClick={selectPage}>Selecteer pagina</button>
            {totalCount > rows.length ? <button type="button" className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px]" disabled={selectAllResults && excluded.length === 0} onClick={selectEveryResult}>Selecteer alle {totalCount}</button> : null}
            <button type="button" className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px]" disabled={!selectedCount} onClick={clearSelection}>Deselecteer</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCrawl ? <button type="submit" formAction={refreshPricesAction} disabled={!selectedCount} className="primary-action min-h-[34px] px-3 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40">Prijzen ophalen ({selectedCount})</button> : null}
            {canDelete ? <button type="submit" disabled={!selectedCount} onClick={(event) => {
              if (!window.confirm(`Je verwijdert ${selectedCount} geselecteerde producten en hun koppelingen definitief. Doorgaan?`)) event.preventDefault()
            }} className="ps-button-danger min-h-[34px] px-3 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40">Verwijderen ({selectedCount})</button> : null}
            <details className="relative">
              <summary className="secondary-action min-h-[34px] cursor-pointer list-none px-3 py-1.5 text-[10px]">Kolommen ({visible.length})</summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-[230px] rounded-xl border border-[#dbe3ed] bg-white p-3 shadow-xl">
                <p className="mb-2 text-[10px] font-semibold text-[#60738a]">Zichtbare kolommen</p>
                <div className="grid gap-2">
                  {COLUMNS.map((column) => <label key={column.key} className="flex cursor-pointer items-center gap-2 text-[11px] text-[#34495f]"><input type="checkbox" checked={visible.includes(column.key)} disabled={column.key === 'name'} onChange={() => toggleColumn(column.key)} className="h-4 w-4 accent-[#346ed6]" />{column.label}</label>)}
                </div>
                <button type="button" onClick={() => setVisible(DEFAULT_COLUMNS)} className="mt-3 text-[10px] font-semibold text-[#346ed6]">Standaard herstellen</button>
              </div>
            </details>
            <button type="button" onClick={() => setCompact((value) => !value)} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">{compact ? 'Ruimer' : 'Compacter'}</button>
          </div>
        </div>

        {selectAllResults ? <div className="border-b border-[#d6e5fb] bg-[#f4f8ff] px-4 py-2 text-[10px] font-semibold text-[#3566b0]">Alle {selectedCount} producten binnen de huidige filters zijn geselecteerd, ook op andere pagina's.{excluded.length ? ` ${excluded.length} product${excluded.length === 1 ? '' : 'en'} uitgesloten.` : ''}</div> : null}

        <div className="max-h-[68vh] overflow-auto overscroll-contain" role="region" aria-label="Productenoverzicht" tabIndex={0}>
          <table className="w-max min-w-full border-separate border-spacing-0 text-left text-[11px]">
            <thead className="sticky top-0 z-20 bg-[#f6f8fb] text-[10px] font-semibold text-[#67788c]">
              <tr>
                <th className="sticky left-0 z-30 w-[42px] min-w-[42px] border-b border-r border-[#e4eaf1] bg-[#f6f8fb] px-3 py-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(event) => {
                      if (event.target.checked) selectPage()
                      else clearSelection()
                    }}
                    disabled={!rowIds.length}
                    aria-label="Selecteer alle producten op deze pagina"
                    className="h-4 w-4 cursor-pointer accent-[#346ed6]"
                  />
                </th>
                {chosenColumns.map((column) => <th key={column.key} scope="col" className={cellPadding + ' whitespace-nowrap border-b border-r border-[#e4eaf1] bg-[#f6f8fb] ' + (column.align === 'right' ? 'text-right ' : '') + (column.key === 'name' ? 'sticky left-[42px] z-20 min-w-[220px] ' : '')}>{column.label}</th>)}
                <th className={cellPadding + ' whitespace-nowrap border-b border-[#e4eaf1] bg-[#f6f8fb] text-right'}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = rowSelected(row.id)
                return <tr key={row.id} className={isSelected ? 'bg-[#eef5ff]' : 'bg-white hover:bg-[#f8fbff]'}>
                  <td className={'sticky left-0 z-10 w-[42px] min-w-[42px] border-b border-r border-[#edf1f5] px-3 ' + (isSelected ? 'bg-[#eef5ff]' : 'bg-white')}>
                    {!selectAllResults ? <input type="checkbox" name="productIds" value={row.id} checked={isSelected} onChange={(event) => toggleRow(row.id, event.target.checked)} aria-label={'Selecteer ' + row.articleNumber} className="h-4 w-4 cursor-pointer accent-[#346ed6]" /> : <input type="checkbox" checked={isSelected} onChange={(event) => toggleRow(row.id, event.target.checked)} aria-label={'Selecteer ' + row.articleNumber} className="h-4 w-4 cursor-pointer accent-[#346ed6]" />}
                  </td>
                  {chosenColumns.map((column) => <td key={column.key} className={cellPadding + ' border-b border-r border-[#edf1f5] ' + (column.align === 'right' ? 'text-right tabular-nums ' : '') + (column.key === 'name' ? 'sticky left-[42px] z-10 ' + (isSelected ? 'bg-[#eef5ff]' : 'bg-white') : '')}>{renderValue(row, column.key)}</td>)}
                  <td className={cellPadding + ' whitespace-nowrap border-b border-[#edf1f5] text-right'}>
                    <Link href={row.detailHref} className="secondary-action min-h-[30px] px-2.5 py-1.5 text-[10px]">Openen</Link>
                    {canCrawl && row.sources > 0 ? <button type="submit" name="singleProductId" value={row.id} formAction={refreshSinglePriceAction} className="ml-2 text-[10px] font-semibold text-[#346ed6]">Nu crawlen</button> : null}
                  </td>
                </tr>
              })}
              {rows.length === 0 ? <tr><td colSpan={chosenColumns.length + 2} className="px-6 py-12 text-center text-[12px] text-[#78889b]">Geen producten gevonden, pas de filters aan of voeg een product toe.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[10px] text-[#7d8b9b]">Klik op artikelnummer, productnaam of EAN om direct te wijzigen. Selecteer alle resultaten om ook producten op andere pagina's mee te nemen.</p>
      </section>
    </form>
  )
}
