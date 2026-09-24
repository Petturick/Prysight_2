export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { approveMatchAction, rejectMatchAction } from '@/app/actions/matchActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requirePermission } from '@/lib/authz'
import { formatDate, formatNumber } from '@/lib/format'
import { profileStep } from '@/lib/performance-profile'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function matchStrength(score: number) {
  if (score >= 85) return { label: 'Sterke match', className: 'ps-chip-green', helper: 'Meerdere signalen ondersteunen dat dit hetzelfde product is.' }
  if (score >= 70) return { label: 'Waarschijnlijke match', className: 'ps-chip-blue', helper: 'De match is aannemelijk, controleer de bron voor gebruik.' }
  return { label: 'Handmatig controleren', className: 'ps-chip-amber', helper: 'Er is onvoldoende bewijs om deze match zonder controle te gebruiken.' }
}

function evidenceSummary(value: unknown) {
  if (!value || typeof value !== 'object') return 'Automatisch gevonden op basis van productgegevens.'
  const evidence = value as Record<string, unknown>
  const reason = typeof evidence.reason === 'string' ? evidence.reason : null
  const market = typeof evidence.market === 'string' ? evidence.market : null
  const mode = typeof evidence.searchMode === 'string' ? evidence.searchMode : null
  if (reason) return reason
  if (mode === 'EAN') return `Exact EAN gevonden${market ? ` voor markt ${market}` : ''}.`
  return 'Automatisch gevonden op basis van EAN en productcontext.'
}

export default async function ProductmatchesPage() {
  const actor = await requirePermission('competitors.read')
  const canReview = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('competitors.write')
  const result = await profileStep('/productmatches', 'review-matches', () => safeDatabaseQuery(() => prisma.productMatch.findMany({
    relationLoadStrategy: 'join',
    where: { companyId: actor.companyId, matchStatus: 'REVIEW' },
    select: {
      id: true, confidenceScore: true, matchStatus: true, matchEvidence: true, createdAt: true,
      product: { select: { id: true, articleNumber: true, name: true, ean: true } },
      competitorOffer: { select: { url: true, competitor: { select: { name: true, country: { select: { name: true } } } } } },
    },
    orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
  }), []), { companyId: actor.companyId }, 250)
  const matches = result.data

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Automatische concurrentherkenning</p>
            <h1 className="mt-1">Concurrent suggesties</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#6f7d90]">
              Prysight vindt kandidaten op basis van EAN, productcontext en markt. Je ziet waarom een koppeling is voorgesteld, zonder schijnprecisie in percentages.
            </p>
          </div>
          <div className="rounded-[12px] bg-[#eef4ff] px-4 py-3 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6c7f96]">Te beoordelen</p>
            <p className="mt-1 text-[24px] font-semibold text-[#244f9d]">{formatNumber(matches.length)}</p>
          </div>
        </div>
      </section>

      {matches.length === 0 ? (
        <section className="ps-panel px-6 py-14 text-center">
          <p className="text-[14px] font-semibold text-[#34495f]">Geen suggesties om te beoordelen</p>
          <p className="mt-1 text-[11px] text-[#7b8999]">Nieuwe producten met een EAN worden automatisch onderzocht.</p>
          <Link href="/producten" className="primary-action mt-4 inline-flex">Naar producten</Link>
        </section>
      ) : (
        <DataTable
          columns={[
            { key: 'product', header: 'Product' },
            { key: 'concurrent', header: 'Concurrent' },
            { key: 'score', header: 'Matchkwaliteit' },
            { key: 'bewijs', header: 'Waarom gevonden' },
            { key: 'aangemaakt', header: 'Gevonden' },
            { key: 'acties', header: 'Actie' },
          ]}
          rows={matches.map((match) => ({
            product: (
              <div className="min-w-[220px]">
                <Link href={`/producten/${match.product.id}#concurrenten-vinden`} className="font-semibold text-[#263b53] hover:text-[#2f6edb]">{match.product.name}</Link>
                <p className="mt-1 text-[10px] text-[#8190a1]">Artikel {match.product.articleNumber}{match.product.ean ? ` · EAN ${match.product.ean}` : ''}</p>
              </div>
            ),
            concurrent: (
              <div className="min-w-[150px]">
                <p className="font-semibold text-[#33485f]">{match.competitorOffer.competitor.name}</p>
                <p className="mt-1 text-[10px] text-[#8190a1]">{match.competitorOffer.competitor.country.name}</p>
                <a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[10px] font-semibold text-[#2f6edb]">Bron bekijken</a>
              </div>
            ),
            score: (() => {
              const strength = matchStrength(match.confidenceScore)
              return <div className="min-w-[150px]"><span className={`ps-chip ${strength.className}`}>{strength.label}</span><p className="mt-1 max-w-[220px] text-[10px] leading-4 text-[#8190a1]">{strength.helper}</p></div>
            })(),
            bewijs: <p className="max-w-[360px] text-[11px] leading-5 text-[#66778a]">{evidenceSummary(match.matchEvidence)}</p>,
            aangemaakt: <span className="text-[11px] text-[#66778a]">{formatDate(match.createdAt)}</span>,
            acties: canReview ? (
              <div className="flex min-w-[190px] flex-wrap gap-2">
                <form action={approveMatchAction.bind(null, match.id)}>
                  <button className="primary-action min-h-[34px] px-3 py-1.5 text-[10px]">Gebruiken</button>
                </form>
                <form action={rejectMatchAction.bind(null, match.id)}>
                  <button className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">Afwijzen</button>
                </form>
              </div>
            ) : <span className="text-[10px] text-[#8793a3]">Alleen lezen</span>,
          }))}
        />
      )}
    </div>
  )
}
