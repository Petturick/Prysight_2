'use client'

import { useState } from 'react'
import { deleteAllCompetitorsAction, deleteAllProductsAction } from '@/app/actions/dataPurgeActions'

type DeleteMode = 'products' | 'competitors'

const configs = {
  products: {
    title: 'Alle producten verwijderen',
    phrase: 'VERWIJDER ALLE PRODUCTEN',
    description: 'Verwijdert alle producten van de actieve organisatie, inclusief productkoppelingen en marktdata die via het product worden verwijderd.',
  },
  competitors: {
    title: 'Alle concurrenten verwijderen',
    phrase: 'VERWIJDER ALLE CONCURRENTEN',
    description: 'Verwijdert alle concurrenten, bijbehorende concurrentaanbiedingen en productmatches van de actieve organisatie.',
  },
} as const

export function DataPurgeControls({
  productCount,
  competitorCount,
  activeFeedCount,
}: {
  productCount: number
  competitorCount: number
  activeFeedCount: number
}) {
  const [mode, setMode] = useState<DeleteMode | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [pauseFeeds, setPauseFeeds] = useState(true)

  const close = () => {
    setMode(null)
    setConfirmation('')
    setPauseFeeds(true)
  }

  const config = mode ? configs[mode] : null
  const count = mode === 'products' ? productCount : competitorCount
  const action = mode === 'products' ? deleteAllProductsAction : deleteAllCompetitorsAction
  const valid = Boolean(config && confirmation === config.phrase && count > 0)

  return (
    <section id="danger-zone" className="rounded-[14px] border border-[#edc7cd] bg-[#fffafa] p-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a83f4b]">Gevarenzone</p>
        <h2 className="mt-1 text-[17px] font-semibold text-[#7f2431]">Alles verwijderen</h2>
        <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#7d5960]">
          Gebruik dit alleen wanneer je de volledige dataset van de actieve organisatie wilt leegmaken. Elke actie vraagt een tweede expliciete bevestiging.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-[12px] border border-[#f0d6da] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold text-[#4a2830]">Alle producten</h3>
              <p className="mt-1 text-[11px] text-[#7d6870]">{productCount.toLocaleString('nl-NL')} producten aanwezig</p>
            </div>
            <button
              type="button"
              disabled={productCount === 0}
              onClick={() => { setMode('products'); setConfirmation('') }}
              className="rounded-[9px] border border-[#e7aeb8] bg-white px-3 py-2 text-[10px] font-semibold text-[#a12d40] transition hover:bg-[#fff1f3] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Alle producten verwijderen
            </button>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-[#8c7479]">
            Actieve feeds kunnen optioneel direct worden gepauzeerd zodat producten niet bij de volgende synchronisatie opnieuw worden aangemaakt.
          </p>
        </div>

        <div className="rounded-[12px] border border-[#f0d6da] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold text-[#4a2830]">Alle concurrenten</h3>
              <p className="mt-1 text-[11px] text-[#7d6870]">{competitorCount.toLocaleString('nl-NL')} concurrenten aanwezig</p>
            </div>
            <button
              type="button"
              disabled={competitorCount === 0}
              onClick={() => { setMode('competitors'); setConfirmation('') }}
              className="rounded-[9px] border border-[#e7aeb8] bg-white px-3 py-2 text-[10px] font-semibold text-[#a12d40] transition hover:bg-[#fff1f3] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Alle concurrenten verwijderen
            </button>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-[#8c7479]">
            Bijbehorende concurrentprijzen, aanbiedingen en productmatches worden mee verwijderd. Producten zelf blijven bestaan.
          </p>
        </div>
      </div>

      {mode && config ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-all-title">
          <div className="w-full max-w-[560px] rounded-[16px] bg-white p-5 shadow-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a83f4b]">Definitieve bevestiging</p>
            <h2 id="delete-all-title" className="mt-1 text-[20px] font-semibold text-[#2a2023]">{config.title}</h2>
            <p className="mt-2 text-[11px] leading-5 text-[#6f6266]">{config.description}</p>

            <div className="mt-4 rounded-[11px] bg-[#fff4f5] px-4 py-3 text-[11px] leading-5 text-[#8d3442]">
              Je staat op het punt <strong>{count.toLocaleString('nl-NL')}</strong> {mode === 'products' ? 'producten' : 'concurrenten'} definitief te verwijderen. Dit kan niet ongedaan worden gemaakt.
            </div>

            {mode === 'products' ? (
              <label className="mt-4 flex items-start gap-3 rounded-[11px] border border-[#e4e8ef] bg-[#fafbfc] p-3 text-[11px] leading-5 text-[#536174]">
                <input type="checkbox" checked={pauseFeeds} onChange={(event) => setPauseFeeds(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#a12d40]" />
                <span>
                  <strong>Actieve feeds pauzeren</strong>
                  <span className="block text-[10px] text-[#7c8796]">{activeFeedCount.toLocaleString('nl-NL')} actieve feed{activeFeedCount === 1 ? '' : 's'} worden gedeactiveerd zodat verwijderde producten niet direct terugkomen.</span>
                </span>
              </label>
            ) : null}

            <label className="mt-4 block text-[11px] font-semibold text-[#4f5d70]">
              Typ exact <span className="rounded bg-[#f4f5f7] px-1.5 py-0.5 font-mono text-[#7f2431]">{config.phrase}</span>
              <input
                autoFocus
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="toolbar-control mt-2 w-full"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <form action={action} className="mt-5 flex flex-wrap justify-end gap-2">
              <input type="hidden" name="confirmation" value={confirmation} />
              <input type="hidden" name="expectedCount" value={count} />
              {mode === 'products' && pauseFeeds ? <input type="hidden" name="pauseFeeds" value="on" /> : null}
              <button type="button" onClick={close} className="secondary-action">Annuleren</button>
              <button
                type="submit"
                disabled={!valid}
                className="rounded-[9px] bg-[#ad2e43] px-4 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#942438] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Definitief verwijderen
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
