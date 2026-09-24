export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Prisma } from '@/generated/prisma/client'
import { requireAuthenticatedUser } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ActionsPage() {
  const user = await requireAuthenticatedUser()
  const staleBefore = new Date()
  staleBefore.setHours(staleBefore.getHours() - 36)
  const failedSince = new Date()
  failedSince.setHours(failedSince.getHours() - 24)

  const result = await safeDatabaseQuery(async () => {
    const [alerts, reviewMatches, failedChecks, staleOffers, priceChangeRows] = await Promise.all([
      prisma.alert.count({ where: { companyId: user.companyId, isRead: false } }),
      prisma.productMatch.count({ where: { companyId: user.companyId, matchStatus: 'REVIEW' } }),
      prisma.priceCheck.count({ where: { companyId: user.companyId, checkedAt: { gte: failedSince }, isSuccess: false } }),
      prisma.competitorOffer.count({ where: { companyId: user.companyId, isActive: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleBefore } }] } }),
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`select count(*)::bigint as count from price_change_requests where company_id = ${user.companyId} and status in ('PENDING','APPROVED','FAILED')`),
    ])
    return { alerts, reviewMatches, failedChecks, staleOffers, priceChanges: Number(priceChangeRows[0]?.count ?? 0) }
  }, { alerts: 0, reviewMatches: 0, failedChecks: 0, staleOffers: 0, priceChanges: 0 })

  const tasks = [
    { label: 'Prijswijzigingen beoordelen', value: result.data.priceChanges, helper: 'Controleer aanvragen en publicaties voordat een prijs live gaat.', href: '/prijswijzigingen', priority: 1 },
    { label: 'Waarschuwingen bekijken', value: result.data.alerts, helper: 'Nieuwe marktbewegingen of prijsafwijkingen vragen een beslissing.', href: '/waarschuwingen', priority: 2 },
    { label: 'Matches bevestigen', value: result.data.reviewMatches, helper: 'Bevestig twijfelgevallen zodat prijsvergelijkingen betrouwbaar blijven.', href: '/productmatches', priority: 3 },
    { label: 'Mislukte controles oplossen', value: result.data.failedChecks, helper: 'Deze prijsmetingen zijn in de laatste 24 uur niet geslaagd.', href: '/monitoring', priority: 4 },
    { label: 'Verouderde bronnen nalopen', value: result.data.staleOffers, helper: 'Deze bronnen hebben langer dan 36 uur geen recente geldige meting.', href: '/monitoring', priority: 5 },
  ]

  const openTasks = tasks.filter((task) => task.value > 0).sort((a,b) => a.priority - b.priority)
  const total = openTasks.reduce((sum, task) => sum + task.value, 0)

  return <div className="space-y-5">
    <section className="strong-panel px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Werkvoorraad</p>
          <h1 className="mt-2">Acties</h1>
          <p className="mt-2 max-w-2xl text-[12px] leading-6 text-[#697386]">Geen dashboard om door te zoeken. Alleen de punten waar vandaag een beslissing of correctie nodig is.</p>
        </div>
        <div className={`min-w-[138px] rounded-[12px] px-4 py-3 text-left ${total ? 'bg-[#fff0f2] text-[#a8404d]' : 'bg-[#eaf8f0] text-[#1d7653]'}`}>
          <p className="text-[10px] font-semibold">Nu open</p>
          <p className="mt-1 text-[27px] font-bold">{formatNumber(total)}</p>
        </div>
      </div>
    </section>

    {openTasks[0] ? <Link href={openTasks[0].href} className="premium-decision-card flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold text-[#8290a1]">Eerstvolgende actie</p>
        <h2 className="mt-1 text-[15px] font-semibold text-[#25364b]">{openTasks[0].label}</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#718096]">{openTasks[0].helper}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="ps-chip ps-chip-red">{formatNumber(openTasks[0].value)} open</span>
        <span className="text-[11px] font-semibold text-[#3d73d4]">Open werkstroom →</span>
      </div>
    </Link> : null}

    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <div><h2 className="text-[16px] font-bold text-[#22344c]">Nu doen</h2><p className="mt-1 text-[11px] text-[#77869a]">Werk van boven naar beneden. PrySight zet de meest kritieke typen eerst.</p></div>
        {openTasks.length ? <span className="ps-chip ps-chip-red">{openTasks.length} werkstromen</span> : <span className="ps-chip ps-chip-green">Alles bijgewerkt</span>}
      </div>

      {openTasks.length ? <div className="divide-y divide-[#eef2f6]">
        {openTasks.map((task, index) => <Link key={task.label} href={task.href} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[#f8fbff] sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#edf5ff] text-[11px] font-bold text-[#2d70b9]">{index + 1}</span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[13px] font-bold text-[#293c54]">{task.label}</h3><span className="ps-chip ps-chip-red">{formatNumber(task.value)}</span></div><p className="mt-1 text-[11px] leading-5 text-[#76869a]">{task.helper}</p></div>
          <span className="hidden text-[11px] font-bold text-[#367fda] sm:block">Open →</span>
        </Link>)}
      </div> : <div className="px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf8f0] text-[20px] font-bold text-[#269965]">✓</div><h3 className="mt-4 text-[15px] font-bold text-[#26394f]">Geen open acties</h3><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-[#7b8999]">De monitoring heeft op dit moment geen uitzonderingen die directe opvolging nodig hebben.</p></div>}
    </section>

    <section>
      <div className="mb-3 px-1"><h2 className="text-[15px] font-bold text-[#26394f]">Verder werken</h2><p className="mt-1 text-[11px] text-[#7b8999]">Open alleen een specialistische werkstroom wanneer je die nodig hebt.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/prijsstrategie" className="surface-card p-4"><p className="text-[12px] font-bold text-[#2b3e56]">Prijsstrategie</p><p className="mt-1.5 text-[11px] leading-5 text-[#77869a]">Bekijk advies, marges en commerciële prijsruimte.</p><p className="mt-3 text-[10px] font-bold text-[#367fda]">Open →</p></Link>
        <Link href="/monitoring" className="surface-card p-4"><p className="text-[12px] font-bold text-[#2b3e56]">Monitoring</p><p className="mt-1.5 text-[11px] leading-5 text-[#77869a]">Controleer bronkwaliteit en laatste prijsmetingen.</p><p className="mt-3 text-[10px] font-bold text-[#367fda]">Open →</p></Link>
        <Link href="/rapportages" className="surface-card p-4"><p className="text-[12px] font-bold text-[#2b3e56]">Inzichten</p><p className="mt-1.5 text-[11px] leading-5 text-[#77869a]">Analyseer marktbewegingen en deel de uitkomst.</p><p className="mt-3 text-[10px] font-bold text-[#367fda]">Open →</p></Link>
      </div>
    </section>
  </div>
}
