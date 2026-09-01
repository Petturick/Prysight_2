'use client'

import { useMemo, useState, useTransition } from 'react'
import { processImportRowsAction } from '@/app/actions/importActions'
import { IMPORT_TARGET_FIELDS, inferImportMapping } from '@/lib/import-mapping'

type Row = Record<string, string>

type PreviewResponse = {
  headers: string[]
  preview: Row[]
  rows?: Row[]
  format: 'CSV' | 'XLSX'
  error?: string
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

  const mappedPreviewRows = useMemo(() => {
    return rows.slice(0, 5).map((row) =>
      Object.fromEntries(
        Object.entries(mapping)
          .filter(([, column]) => column)
          .map(([target, column]) => [target, row[column] ?? '']),
      ),
    )
  }, [mapping, rows])

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping])
  const usedColumns = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping])
  const unmappedSourceColumns = useMemo(() => headers.filter((header) => !usedColumns.has(header)), [headers, usedColumns])

  const warnings = useMemo(() => {
    const list: string[] = []
    if (!mapping.articleNumber && !mapping.ean) list.push('Koppel minimaal Artikelnummer of EAN zodat producten betrouwbaar kunnen worden herkend.')
    if (!mapping.productName) list.push('Productnaam is niet gekoppeld. Nieuwe producten krijgen dan het artikelnummer als naam.')
    if (!mapping.competitorPrice) list.push('Concurrentieprijs ontbreekt. Prijsvergelijking blijft voor deze import onvolledig.')
    if (!mapping.competitorName && !mapping.webshop) list.push('Concurrentnaam of webshop ontbreekt. Er kan dan geen aanbieder worden aangemaakt.')
    if (unmappedSourceColumns.length > 0) list.push(`${unmappedSourceColumns.length} bronkolom${unmappedSourceColumns.length === 1 ? '' : 'men'} zijn nog niet gekoppeld.`)
    return list
  }, [mapping, unmappedSourceColumns])

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
    setMapping(inferImportMapping(payload.headers))
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

  function setTargetMapping(target: string, sourceColumn: string) {
    setMapping((current) => {
      const next = { ...current }
      if (sourceColumn) {
        for (const key of Object.keys(next)) {
          if (key !== target && next[key] === sourceColumn) next[key] = ''
        }
      }
      next[target] = sourceColumn
      return next
    })
  }

  const canContinueToPreview = Boolean(mapping.articleNumber || mapping.ean)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3 text-sm font-medium text-slate-500">
          {[1, 2, 3, 4].map((value) => (
            <button
              key={value}
              type="button"
              disabled={value > step || (value > 1 && !rows.length)}
              onClick={() => value < step && setStep(value)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${step >= value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'} disabled:cursor-default`}
              aria-label={`Ga naar stap ${value}`}
            >
              {value}
            </button>
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">1. Upload bestand</h2>
            <p className="text-sm text-slate-500">Upload CSV of XLSX. Prysight herkent bekende kolomnamen automatisch en laat je de koppeling daarna controleren.</p>
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">2. Kolommen koppelen</h2>
                <p className="text-sm text-slate-500">Bestand: {filename}</p>
                <p className="mt-1 text-xs text-slate-500">Automatisch herkend: {mappedCount} van {headers.length} bronkolommen.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setStep(1)}>
                  Terug
                </button>
                <button
                  type="button"
                  disabled={!canContinueToPreview}
                  title={!canContinueToPreview ? 'Koppel minimaal Artikelnummer of EAN.' : undefined}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setStep(3)}
                >
                  Verder naar preview
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
              Prysight gebruikt dezelfde logica voor automatische herkenning als de feedmapping. Een bronkolom kan maar aan één doelveld tegelijk gekoppeld zijn, zodat dubbele of tegenstrijdige mappings worden voorkomen.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {IMPORT_TARGET_FIELDS.map((field) => (
                <label key={field.key} className="space-y-2 text-sm">
                  <span className="flex items-center justify-between gap-2 font-medium text-slate-700">
                    {field.label}
                    {mapping[field.key] ? <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Gekoppeld</span> : null}
                  </span>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(event) => setTargetMapping(field.key, event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Niet gekoppeld</option>
                    {headers.map((header) => {
                      const inUseElsewhere = usedColumns.has(header) && mapping[field.key] !== header
                      return (
                        <option key={header} value={header} disabled={inUseElsewhere}>
                          {header}{inUseElsewhere ? ' (al gekoppeld)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </label>
              ))}
            </div>

            {unmappedSourceColumns.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Nog niet gekoppelde bronkolommen</p>
                <p className="mt-1 break-words">{unmappedSourceColumns.join(', ')}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">3. Preview en controle</h2>
                <p className="text-sm text-slate-500">Controleer eerst de koppelingen en de eerste vijf regels voordat Prysight iets verwerkt.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setStep(2)}>
                  Terug naar kolommen
                </button>
                <button type="button" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white" onClick={() => setStep(4)}>
                  Bevestigen
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Controlepunten</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.length === 0 ? <li>Geen directe waarschuwingen gedetecteerd.</li> : warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {Object.keys(mappedPreviewRows[0] ?? {}).map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium text-slate-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedPreviewRows.map((row, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      {Object.entries(row).map(([key, value]) => (
                        <td key={key} className="px-3 py-2 text-slate-700">{value || '—'}</td>
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">4. Import bevestigen</h2>
                <p className="text-sm text-slate-500">De import maakt of werkt producten, concurrenten, prijzen en historie bij.</p>
              </div>
              <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setStep(3)}>
                Terug naar preview
              </button>
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
