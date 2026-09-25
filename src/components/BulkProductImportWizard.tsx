'use client'

import { useState, useTransition } from 'react'
import { processBulkProductImportAction } from '@/app/actions/bulkProductImportActions'
import type { BulkProductRow, DetectedCompetitor } from '@/lib/bulk-product-import'

type Preview = {
  filename: string
  format: 'CSV' | 'XLSX'
  profile: 'prisync-horizontal' | 'generic-product-feed'
  productCount: number
  detectedCompetitors: DetectedCompetitor[]
  recognizedFields: string[]
  ignoredFields: string[]
  preview: BulkProductRow[]
  rows: BulkProductRow[]
  error?: string
}

type ImportResult = Awaited<ReturnType<typeof processBulkProductImportAction>>

export function BulkProductImportWizard() {
  const [data, setData] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/import/bulk', { method: 'POST', body })
      const payload = await response.json() as Preview
      if (!response.ok || payload.error) throw new Error(payload.error || 'Bestand kon niet worden herkend.')
      setData(payload)
    } catch (uploadError) {
      setData(null)
      setError(uploadError instanceof Error ? uploadError.message : 'Upload mislukt.')
    } finally {
      setUploading(false)
    }
  }

  function runImport() {
    if (!data) return
    setResult(null)
    startTransition(async () => {
      const imported = await processBulkProductImportAction({ filename: data.filename, format: data.format, profile: data.profile, rows: data.rows })
      setResult(imported)
    })
  }

  return (
    <div className="space-y-4">
      <section className="strong-panel">
        <div className="flex min-h-[220px] flex-col items-center justify-center p-6 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void upload(file) }}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#e8f2ff] text-[19px] font-semibold text-[#2457d6]">↑</div>
          <h2 className="mt-3 text-[14px] font-semibold text-[#25364b]">Sleep CSV of Excel hierheen</h2>
          <label className="primary-action mt-4 cursor-pointer" htmlFor="bulk-product-feed-file">{uploading ? 'Bezig met herkennen…' : 'Bestand kiezen'}</label>
          <input id="bulk-product-feed-file" type="file" accept=".csv,.xlsx" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
          {error ? <p className="mt-4 rounded-[10px] bg-[#fff0f2] px-4 py-2 text-[10px] font-bold text-[#b4233d]">{error}</p> : null}
        </div>
      </section>

      {data ? <section className="strong-panel overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[var(--border-strong)] bg-[#edf1f6] px-5 py-4">
          <div>
            <p className="eyebrow">Automatisch herkend</p>
            <h2 className="mt-1 text-[16px] font-black text-[#111827]">{data.filename}</h2>
            <p className="mt-1 text-[10px] font-semibold text-[#647087]">{data.profile === 'prisync-horizontal' ? 'Horizontaal prijsrapport' : 'Productfeed'} · {data.format}</p>
          </div>
          <button type="button" className="ps-button-green" disabled={isPending} onClick={runImport}>{isPending ? 'Importeren…' : `Importeer ${data.productCount} producten`}</button>
        </div>

        <div className="grid sm:grid-cols-5">
          <div className="p-4 sm:px-5"><p className="text-[9px] font-black uppercase text-[#6f7b91]">Producten</p><p className="mt-1 text-[24px] font-black text-[#111827]">{data.productCount}</p></div>
          <div className="p-4"><p className="text-[9px] font-black uppercase text-[#6f7b91]">Velden herkend</p><p className="mt-1 text-[24px] font-black text-[#2457d6]">{data.recognizedFields.length}</p></div>
          <div className="p-4"><p className="text-[9px] font-black uppercase text-[#6f7b91]">Concurrentdomeinen</p><p className="mt-1 text-[24px] font-black text-[#7c3aed]">{data.detectedCompetitors.length}</p></div>
          <div className="p-4"><p className="text-[9px] font-black uppercase text-[#6f7b91]">Na import</p><p className="mt-1 text-[14px] font-black text-[#2457d6]">AI suggesties</p><p className="mt-1 text-[9px] font-semibold text-[#647087]">per markt</p></div>
          <div className="p-4"><p className="text-[9px] font-black uppercase text-[#6f7b91]">Controle</p><p className="mt-1 text-[14px] font-black text-[#0d7a49]">Klaar voor import</p></div>
        </div>

        {data.detectedCompetitors.length ? <div className="border-t-2 border-[var(--border-strong)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
<h3 className="text-[12px] font-semibold text-[#111827]">Concurrentkolommen herkend</h3>
            <span className="ps-chip ps-chip-blue">{data.detectedCompetitors.length} gevonden</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{data.detectedCompetitors.slice(0, 12).map((competitor) => <span key={competitor.domain} className="rounded-[8px] bg-[#f0f3f7] px-2.5 py-1.5 text-[9px] font-bold text-[#4b5870]">{competitor.domain}</span>)}{data.detectedCompetitors.length > 12 ? <span className="rounded-[8px] bg-[#111827] px-2.5 py-1.5 text-[9px] font-bold text-white">+{data.detectedCompetitors.length - 12}</span> : null}</div>
        </div> : null}

        <div className="overflow-x-auto border-t-2 border-[var(--border-strong)]">
          <table className="min-w-full text-[10px]">
            <thead><tr><th className="px-4 py-3 text-left">Artikelnummer</th><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left">Categorie</th><th className="px-4 py-3 text-right">Eigen prijs</th><th className="px-4 py-3 text-left">Btw</th><th className="px-4 py-3 text-left">EAN</th><th className="px-4 py-3 text-left">Product URL</th></tr></thead>
            <tbody>{data.preview.map((row) => <tr key={row.articleNumber}><td className="px-4 py-3 font-black">{row.articleNumber}</td><td className="max-w-[320px] px-4 py-3 font-semibold">{row.productName}</td><td className="px-4 py-3">{row.productGroup}</td><td className="px-4 py-3 text-right">{row.ownPrice || '—'}</td><td className="px-4 py-3">{row.vatIncluded === 'true' ? 'Incl.' : row.vatIncluded === 'false' ? 'Excl.' : 'Controleren'}</td><td className="px-4 py-3">{row.ean || '—'}</td><td className="max-w-[220px] truncate px-4 py-3">{row.ownUrl || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </section> : null}

      {result ? <section className={`rounded-[14px] border-2 p-5 ${result.ok ? 'border-[#0d7a49] bg-[#e7f5ed]' : 'border-[#b4233d] bg-[#fff0f2]'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className={`text-[12px] font-black ${result.ok ? 'text-[#0d7a49]' : 'text-[#b4233d]'}`}>{result.message}</p><p className="mt-1 text-[10px] font-semibold text-[#647087]">{result.summary.products} producten · {result.summary.markets} marktregels · {result.summary.groups} productgroepen · {result.summary.suggestions} AI suggesties</p></div><span className={`ps-chip ${result.ok ? 'ps-chip-green' : 'ps-chip-red'}`}>{result.ok ? 'Succesvol' : 'Aandacht nodig'}</span></div>
        {result.errors.length ? <div className="mt-3 text-[10px] font-semibold text-[#8e1d32]">{result.errors.slice(0, 5).join(' · ')}</div> : null}
        {result.warnings.length ? <div className="mt-3 text-[10px] font-semibold text-[#7a5a18]">{result.warnings.slice(0, 5).join(' · ')}</div> : null}
      </section> : null}
    </div>
  )
}
