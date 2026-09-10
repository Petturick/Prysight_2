export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ActionsPage() {
  const user = await requireAuthenticatedUser()
  const staleBefore = new Date(Date.now() - 36 * 60 * 60 * 1000)
  const failedSince = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const result = await safeDatabaseQuery(async () => {
    const [alerts, reviewMatches, failedChecks, staleOffers] = await Promise.all([
      prisma.alert.count({ where: { companyId: user.companyId, isRead: false } }),
      prisma.productMatch.count({ where: { companyId: user.companyId, matchStatus: 'REVIEW' } }),
      prisma.priceCheck.count({ where: { companyId: user.companyId, checkedAt: { gte: failedSince }, isSuccess: false } }),
      prisma.competitorOffer.count({ where: { companyId: user.companyId, isActive: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleBefore } }] } }),
    ])
    return { alerts, reviewMatches, failedChecks, staleOffers }
  }, { alerts: 0, reviewMatches: 0, failedChecks: 0, staleOffers: 0 })
  const total = result.data.alerts + result.data.reviewMatches + result.data.failedChecks + result.data.staleOffers
  const cards = [
    { label: 'Waarschuwingen', value: result.data.alerts, helper: 'Nieuwe prijsafwijkingen en signalen', href: '/waarschuwingen', urgent: result.data.alerts > 0 },
    { label: 'Matches controleren', value: result.data.reviewMatches, helper: 'Automatische matches vragen bevestiging', href: '/productmatches', urgent: result.data.reviewMatches > 0 },
    { label: 'Mislukte controles', value: result.data.failedChecks, helper: 'Prijsmetingen mislukt in de laatste 24 uur', href: '/monitoring', urgent: result.data.failedChecks > 0 },
    { label: 'Verouderde bronnen', value: result.data.staleOffers, helper: 'Bronnen zonder recente geldige controle', href: '/monitoring', urgent: result.data.staleOffers > 0 },
  ]
  return <div className="space-y-5">
    <section className="strong-panel px-5 py-5 sm:px-6"><p className="eyebrow">Vandaag</p><div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[29px] font-semibold tracking-[-.035em] text-[#161a26]">Acties</h1><p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Alles wat nu aandacht nodig heeft staat hier, zodat je niet door losse technische schermen hoeft te zoeken.</p></div><div className={`rounded-[10px] px-4 py-3 ${total ? 'bg-[#fff3f0] text-[#a8493d]' : 'bg-[#eef8f3] text-[#1d7653]'}`}><p className="text-[10px] font-semibold">Open acties</p><p className="mt-1 text-[25px] font-bold">{formatNumber(total)}</p></div></div></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <Link key={card.label} href={card.href} className="surface-card p-5 transition hover:-translate-y-px hover:shadow-[0_7px_18px_rgba(31,49,77,.06)]"><div className="flex items-start justify-between gap-3"><p className="text-[11px] font-semibold text-[#384961]">{card.label}</p><span className={`h-2.5 w-2.5 rounded-full ${card.urgent ? 'bg-[#ef6b6d]' : 'bg-[#2eaa76]'}`} /></div><p className="mt-3 text-[30px] font-bold tracking-[-.04em] text-[#17233a]">{formatNumber(card.value)}</p><p className="mt-1 min-h-10 text-[10px] leading-5 text-[#7b899b]">{card.helper}</p><span className="mt-4 inline-flex text-[10px] font-semibold text-[#3977db]">Openen →</span></Link>)}</section>
    <section className="grid gap-4 lg:grid-cols-2"><Link href="/prijsstrategie" className="surface-card p-5"><p className="eyebrow">Beslissen</p><h2 className="mt-2 text-[15px] font-semibold text-[#24344d]">Prijsstrategie</h2><p className="mt-2 text-[11px] leading-5 text-[#6d7b8e]">Bekijk advies en commerciële prijsruimte nadat de marktdata betrouwbaar is bevestigd.</p><p className="mt-4 text-[10px] font-semibold text-[#3977db]">Open prijsstrategie →</p></Link><Link href="/rapportages" className="surface-card p-5"><p className="eyebrow">Terugkijken</p><h2 className="mt-2 text-[15px] font-semibold text-[#24344d]">Rapportages</h2><p className="mt-2 text-[11px] leading-5 text-[#6d7b8e]">Deel de belangrijkste marktbewegingen en opvolgpunten zonder operationele details.</p><p className="mt-4 text-[10px] font-semibold text-[#3977db]">Open rapportages →</p></Link></section>
  </div>
}
