'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { processImportRowsAction } from '@/app/actions/importActions'

type ImportMode = 'products' | 'competitors' | 'combined'
type Row = Record<string, string>

type PreviewResponse = {
  headers: string[]
  preview: Row[]
  rows?: Row[]
  format: 'CSV' | 'XLSX'
  error?: string
}

const targetFields = [
  { key: 'articleNumber', label: 'Artikelnummer', modes: ['products', 'competitors', 'combined'] },
  { key: 'ean', label: 'EAN', modes: ['products', 'combined'] },
  { key: 'productName', label: 'Productnaam', modes: ['products', 'combined'] },
  { key: 'productGroup', label: 'Productgroep', modes: ['products', 'combined'] },
  { key: 'country', label: 'Land', modes: ['products', 'competitors', 'combined'] },
  { key: 'webshop', label: 'Webshop', modes: ['combined'] },
  { key: 'engelsUrl', label: 'Eigen product URL', modes: ['products', 'combined'] },
  { key: 'ownPrice', label: 'Eigen prijs', modes: ['products', 'combined'] },
  { key: 'ownStock', label: 'Eigen voorraad', modes: ['products', 'combined'] },
  { key: 'competitorName', label: 'Concurrentnaam', modes: ['competitors', 'combined'] },
  { key: 'competitorUrl', label: 'Concurrent URL', modes: ['competitors', 'combined'] },
  { key: 'competitorPrice', label: 'Concurrentieprijs', modes: ['competitors', 'combined'] },
  { key: 'currency', label: 'Valuta', modes: ['products', 'competitors', 'combined'] },
  { key: 'competitorStock', label: 'Voorraad concurrent', modes: ['competitors', 'combined'] },
  { key: 'lastChecked', label: 'Laatste controle', modes: ['competitors', 'combined'] },
  { key: 'packagingUnit', label: 'Verpakkingseenheid', modes: ['products', 'competitors', 'combined'] },
] as const

const aliases: Record<string, string[]> = {
  articleNumber: ['artikelnummer', 'artikel', 'sku', 'sku new', 'sku_new', 'product id'],
  ean: ['ean', 'gtin', 'barcode'],
  productName: ['productnaam', 'product name', 'naam', 'name', 'titel', 'title'],
  productGroup: ['productgroep', 'product group', 'categorie', 'category'],
  country: ['land', 'country', 'country code', 'market', 'markt'],
  webshop: ['webshop', 'shop', 'store'],
  engelsUrl: ['engels url', 'eigen url', 'own url', 'product url'],
  ownPrice: ['eigen prijs', 'own price', 'prijs'],
  ownStock: ['eigen voorraad', 'own stock'],
  competitorName: ['concurrentnaam', 'concurrent', 'competitor name', 'competitor'],
  competitorUrl: ['concurrent url', 'competitor url', 'offer url'],
  competitorPrice: ['concurrentieprijs', 'competitor price', 'market price'],
  currency: ['valuta', 'currency'],
  competitorStock: ['voorraad concurrent', 'competitor stock'],
  lastChecked: ['laatste controle', 'last checked', 'checked at'],
  packagingUnit: ['verpakkingseenheid', 'packaging unit', 'unit'],
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function inferMapping(headers: string[]) {
  return Object.fromEntries(targetFields.map((field) => {
    const candidates = aliases[field.key] ?? [field.label]
    const match = headers.find((header) => candidates.some((candidate) => {
      const normalizedHeader = normalize(header)
      const normalizedCandidate = normalize(candidate)
      return normalizedHeader === normalizedCandidate || normalizedHeader.includes(normalizedCandidate)
    }))
    return [field.key, match ?? '']
  })) as Record<string, string>
}

function templateHeaders(mode: ImportMode) {
  if (mode === 'products') return ['Artikelnummer', 'EAN', 'Productnaam', 'Productgroep', 'Land', 'Eigen product URL', 'Eigen prijs', 'Eigen voorraad', 'Valuta', 'Verpakkingseenheid']
  if (mode === 'competitors') return ['Artikelnummer', 'Land', 'Concurrentnaam', 'Concurrent URL', 'Concurrentieprijs', 'Valuta', 'Voorraad concurrent', 'Laatste controle', 'Verpakkingseenheid']
  return ['Artikelnummer', 'EAN', 'Productnaam', 'Productgroep', 'Land', 'Eigen product URL', 'Eigen prijs', 'Eigen voorraad', 'Concurrentnaam', 'Concurrent URL', 'Concurrentieprijs', 'Valuta', 'Voorraad concurrent', 'Laatste controle', 'Verpakkingseenheid']
}

export function ImportWizard() {
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<ImportMode>('products')
  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState<'CSV' | 'XLSX'>('CSV')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ message: string; warnings: string[]; errors: string[] } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleFields = useMemo(() => targetFields.filter((field) => (field.modes as readonly string[]).includes(mode)), [mode])
  const mappedRows = useMemo(() => rows.map((row) => Object.fromEntries(Object.entries(mapping).filter(([, column]) => Boolean(column)).map(([target, column]) => [target, row[column] ?? '']))), [mapping, rows])
  const preview = mappedRows.slice(0, 5)
  const warnings = useMemo(() => {
    const items: string[] = []
    if (!mapping.articleNumber) items.push('Artikelnummer ontbreekt, bestaande producten kunnen niet betrouwbaar worden gekoppeld.')
    if ((mode === 'products' || mode === 'combined') && !mapping.productName) items.push('Productnaam ontbreekt, nieuwe producten krijgen dan het artikelnummer als naam.')
    if ((mode === 'competitors' || mode === 'combined') && !mapping.competitorName) items.push('Concurrentnaam ontbreekt, de aanbieder kan niet worden aangemaakt of herkend.')
    if ((mode === 'competitors' || mode === 'combined') && !mapping.competitorUrl) items.push('Concurrent URL ontbreekt, automatische controle vanaf de productpagina is dan niet mogelijk.')
    return items
  }, [mapping, mode])

  async function handleFileChange(file: File) {
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/import', { method: 'POST', body: formData })
    const payload = (await response.json()) as PreviewResponse
    if (!response.ok || payload.error) {
      setUploadError(payload.error ?? 'Bestand kon niet worden gelezen.')
      return
    }
    setFilename(file.name)
    setFormat(payload.format)
    setHeaders(payload.headers)
    setRows(payload.rows ?? payload.preview)
    setMapping(inferMapping(payload.headers))
    setStep(2)
    setResult(null)
  }

  function downloadTemplate() {
    const blob = new Blob([`${templateHeaders(mode).join(';')}\n`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = mode === 'products' ? 'prysight-producten-template.csv' : mode === 'competitors' ? 'prysight-concurrent-urls-template.csv' : 'prysight-volledige-import-template.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const importSucceeded = Boolean(result && result.errors.length === 0)

  return (
    <div className="strong-panel overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-[#8a93a5]">
          {[1, 2, 3, 4].map((value) => <div key={value} className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${step >= value ? 'bg-[#202536] text-white' : 'bg-[#f1f3f6]'}`}>{value}</span><span>{value === 1 ? 'Bron' : value === 2 ? 'Kolommen' : value === 3 ? 'Controle' : 'Import'}</span>{value < 4 ? <span>›</span> : null}</div>)}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {step === 1 ? <div className="space-y-5">
          <div><h2 className="text-[16px] font-semibold text-[#252a37]">Wat wil je importeren</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Kies het type bron, daarna zie je alleen de relevante velden.</p></div>
          <div className="grid gap-3 md:grid-cols-3">
            {([['products', 'Producten', 'Productdata, eigen prijzen, voorraad en markten.'], ['competitors', 'Concurrent URLs', 'Koppel concurrenten en product URLs in bulk aan bestaande artikelen.'], ['combined', 'Volledige import', 'Productdata en concurrentiedata samen in één bestand.']] as const).map(([value, title, description]) => <button key={value} type="button" onClick={() => { setMode(value); setResult(null) }} className={`rounded-[14px] border p-4 text-left transition ${mode === value ? 'border-[var(--blue)] bg-[var(--blue-soft)] shadow-sm' : 'border-[var(--border)] bg-white hover:border-[#b7c0cf] hover:bg-[#fafbfc]'}`}><p className="text-[12px] font-semibold text-[#252a37]">{title}</p><p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">{description}</p></button>)}
          </div>
          <div className="rounded-[14px] border border-dashed border-[#c9ced8] bg-[#fafbfc] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[12px] font-semibold text-[#252a37]">CSV of Excel</p><p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Prysight herkent onder meer SKU, SKU_NEW, artikelnummer, EAN, GTIN, markt, concurrent en URL automatisch.</p></div><button type="button" onClick={downloadTemplate} className="secondary-action">Voorbeeldtemplate</button></div>
            <input type="file" accept=".csv,.xlsx" className="mt-4 block w-full rounded-xl border border-[var(--border)] bg-white p-3 text-[11px]" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFileChange(file) }} />
            {uploadError ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">{uploadError}</p> : null}
          </div>
        </div> : null}

        {step === 2 ? <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-[16px] font-semibold text-[#252a37]">Kolommen controleren</h2><p className="mt-1 text-[11px] text-[#8a93a5]">{filename}, {rows.length} regels, {headers.length} kolommen gedetecteerd.</p></div><div className="flex gap-2"><button type="button" className="secondary-action" onClick={() => setStep(1)}>Ander bestand</button><button type="button" className="primary-action" onClick={() => setStep(3)}>Preview</button></div></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleFields.map((field) => <label key={field.key} className="space-y-1.5 text-[11px]"><span className="font-semibold text-[#697386]">{field.label}</span><select value={mapping[field.key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))} className="toolbar-control w-full"><option value="">Niet gekoppeld</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        </div> : null}

        {step === 3 ? <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-[16px] font-semibold text-[#252a37]">Preview en validatie</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Controleer de eerste regels voordat de database wordt gewijzigd.</p></div><div className="flex gap-2"><button type="button" className="secondary-action" onClick={() => setStep(2)}>Terug</button><button type="button" className="primary-action" onClick={() => setStep(4)}>Bevestigen</button></div></div>
          <div className={`rounded-[14px] p-4 text-[11px] ${warnings.length ? 'bg-[var(--amber-soft)] text-[var(--amber)]' : 'bg-[var(--green-soft)] text-[var(--green)]'}`}><p className="font-semibold">{warnings.length ? `${warnings.length} aandachtspunten` : 'Mapping ziet er compleet uit'}</p>{warnings.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</div>
          <div className="overflow-x-auto rounded-[14px] border border-[var(--border)]"><table className="min-w-full text-[11px]"><thead className="bg-[#f7f8fa]"><tr>{Object.keys(preview[0] ?? {}).map((header) => <th key={header} className="px-3 py-2 text-left">{header}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr key={index} className="border-t border-[var(--border)]">{Object.entries(row).map(([key, value]) => <td key={key} className="whitespace-nowrap px-3 py-2">{value || '—'}</td>)}</tr>)}</tbody></table></div>
        </div> : null}

        {step === 4 ? <div className="space-y-5">
          <div><h2 className="text-[16px] font-semibold text-[#252a37]">Import uitvoeren</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Prysight verwerkt {rows.length} regels volgens de gekozen importmodus.</p></div>
          {!importSucceeded ? <div className="flex flex-wrap gap-2"><button type="button" className="secondary-action" onClick={() => setStep(3)} disabled={isPending}>Terug</button><button type="button" disabled={isPending} className="primary-action disabled:cursor-not-allowed disabled:opacity-50" onClick={() => startTransition(async () => setResult(await processImportRowsAction({ filename, format, mode, mapping, rows: mappedRows })))}>{isPending ? 'Importeren, niet sluiten…' : `Start import van ${rows.length} regels`}</button></div> : null}
          {result ? <div className={`rounded-[14px] border p-4 text-[11px] ${result.errors.length ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="font-semibold text-[#252a37]">{result.message}</p>{result.warnings.length ? <ul className="mt-2 list-disc pl-5 text-[#697386]">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}{result.errors.length ? <ul className="mt-2 list-disc pl-5 text-rose-700">{result.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}</div> : null}
          {importSucceeded ? <div className="flex flex-wrap gap-2"><Link href="/producten" className="primary-action">Bekijk producten</Link><Link href="/concurrenten" className="secondary-action">Bekijk concurrenten</Link><button type="button" className="secondary-action" onClick={() => { setStep(1); setRows([]); setHeaders([]); setMapping({}); setFilename(''); setResult(null) }}>Nieuwe import</button></div> : null}
        </div> : null}
      </div>
    </div>
  )
}