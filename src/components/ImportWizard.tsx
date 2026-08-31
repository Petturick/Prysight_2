'use client'

import { useMemo, useState, useTransition } from 'react'
import { processImportRowsAction } from '@/app/actions/importActions'

const targetFields = [
  { key: 'articleNumber', label: 'Artikelnummer' },
  { key: 'ean', label: 'EAN' },
  { key: 'productName', label: 'Productnaam' },
  { key: 'productGroup', label: 'Productgroep' },
  { key: 'country', label: 'Land' },
  { key: 'webshop', label: 'Webshop' },
  { key: 'engelsUrl', label: 'Engels URL' },
  { key: 'ownPrice', label: 'Eigen prijs' },
  { key: 'ownStock', label: 'Eigen voorraad' },
  { key: 'competitorName', label: 'Concurrentnaam' },
  { key: 'competitorUrl', label: 'Concurrent URL' },
  { key: 'competitorPrice', label: 'Concurrentieprijs' },
  { key: 'currency', label: 'Valuta' },
  { key: 'competitorStock', label: 'Voorraad concurrent' },
  { key: 'lastChecked', label: 'Laatste controle' },
  { key: 'packagingUnit', label: 'Verpakkingseenheid' },
] as const

type Row = Record<string, string>

type PreviewResponse = {
  headers: string[]
  preview: Row[]
  rows?: Row[]
  format: 'CSV' | 'XLSX'
  error?: string
}

function inferMapping(headers: string[]) {
  return Object.fromEntries(
    targetFields.map((field) => {
      const found = headers.find((header) => header.toLowerCase().includes(field.label.toLowerCase().split(' ')[0].toLowerCase()))
      return [field.key, found ?? '']
    }),
  ) as Record<(typeof targetFields)[number]['key'], string>
}

export function ImportWizard() {
  const [step, setStep] = useState(1)
  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState<'CSV' | 'XLSX'>('CSV')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ message: string; warnings: string[]; errors: string[] } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const preview = useMemo(() => rows.slice(0, 5), [rows])
  const warnings = useMemo(() => {
    const list: string[] = []
    if (!mapping.articleNumber) list.push('Artikelnummer is niet gekoppeld; matching valt terug op naam/EAN.')
    if (!mapping.competitorPrice) list.push('Concurrentieprijs ontbreekt; prijsvergelijking blijft onvolledig.')
    if (!mapping.competitorName) list.push('Concurrentnaam ontbreekt; import kan geen aanbieder aanmaken.')
    return list
  }, [mapping])

  async function handleFileChange(file: File) {
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/import', {
      method: 'POST',
      body: formData,
    })

    const payload = (await response.json()) as PreviewResponse
    if (!response.ok || payload.error) {
      setUploadError(payload.error ?? 'Bestand kon niet worden gelezen.')
      return
    }

    const parsedRows = payload.rows ?? payload.preview
    setFilename(file.name)
    setFormat(payload.format)
    setHeaders(payload.headers)
    setRows(parsedRows)
    setMapping(inferMapping(payload.headers))
    setStep(2)
    setResult(null)
  }

  function mappedRows() {
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(mapping)
          .filter(([, column]) => column)
          .map(([target, column]) => [target, row[column] ?? '']),
      ),
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3 text-sm font-medium text-slate-500">
          {[1, 2, 3, 4].map((value) => (
            <div key={value} className="flex items-center gap-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${step >= value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`}>{value}</span>
            </div>
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">1. Upload bestand</h2>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="block w-full rounded-xl border border-dashed border-slate-300 p-4"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFileChange(file)
              }}
            />
            {uploadError ? <p className="text-sm text-rose-700">{uploadError}</p> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">2. Kolommen koppelen</h2>
                <p className="text-sm text-slate-500">Bestand: {filename}</p>
              </div>
              <button type="button" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white" onClick={() => setStep(3)}>
                Verder naar preview
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {targetFields.map((field) => (
                <label key={field.key} className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">{field.label}</span>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Niet gekoppeld</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">3. Preview en controle</h2>
                <p className="text-sm text-slate-500">Controleer de eerste regels, waarschuwingen en mogelijke gaten.</p>
              </div>
              <button type="button" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white" onClick={() => setStep(4)}>
                Bevestigen
              </button>
            </div>
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Waarschuwingen</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.length === 0 ? <li>Geen directe waarschuwingen gedetecteerd.</li> : warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {Object.keys(mappedRows()[0] ?? {}).map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium text-slate-500">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((_, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      {Object.entries(mappedRows()[index] ?? {}).map(([key, value]) => (
                        <td key={key} className="px-3 py-2 text-slate-700">
                          {value || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">4. Import bevestigen</h2>
              <p className="text-sm text-slate-500">De import maakt of werkt producten, concurrenten, prijzen en historie bij.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  const response = await processImportRowsAction({ filename, format, mapping, rows: mappedRows() })
                  setResult(response)
                })
              }
              disabled={isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? 'Importeren…' : 'Start import'}
            </button>
            {result ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">{result.message}</p>
                {result.warnings.length > 0 ? <ul className="mt-2 list-disc pl-5">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                {result.errors.length > 0 ? <ul className="mt-2 list-disc pl-5 text-rose-700">{result.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
