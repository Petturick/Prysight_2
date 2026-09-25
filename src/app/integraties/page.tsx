export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { MagentoIntegrationPanel } from '@/components/MagentoIntegrationPanel'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getSafeDatabaseStatus } from '@/lib/database-url'
import { formatDate } from '@/lib/format'
import { getMagentoIntegrationSummary } from '@/lib/magento-pricing'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function Status({ ready, label }: { ready: boolean; label?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${ready ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>{label ?? (ready ? 'Actief' : 'Configuratie nodig')}</span>
}

export default async function IntegrationsPage() {
  const actor = await requireAuthenticatedUser()
  const canManage = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('settings.manage')
  const monitorReady = Boolean(process.env.PRICE_MONITOR_API_KEY)
  const feedReady = Boolean(process.env.DATA_FEED_API_KEY)
  const webhookReady = Boolean(process.env.ALERT_WEBHOOK_URL)
  const databaseStatus = getSafeDatabaseStatus()

  const [magentoSummary, syntrxResult] = await Promise.all([
    getMagentoIntegrationSummary(actor.companyId),
    safeDatabaseQuery(
      () => prisma.feedSource.findFirst({
        where: { companyId: actor.companyId, sourceType: 'SYNTRX', isActive: true },
        orderBy: { lastRunAt: 'desc' },
      }),
      null,
    ),
  ])

  const syntrx = syntrxResult.data
  const databaseReady = databaseStatus.configured && syntrxResult.available

  const supportingCards = [
    {
      title: 'Automatische prijscontroles',
      kicker: 'Prijsmonitoring',
      description: 'Gematchte concurrent product URLs kunnen periodiek worden gecontroleerd. Geldige prijzen, voorraad en historie worden direct opgeslagen.',
      ready: monitorReady,
      detail: 'Dezelfde controlelaag wordt gebruikt door de knop Prijzen nu controleren op productniveau.',
      href: '/producten',
      linkLabel: 'Open productonderzoek',
    },
    {
      title: 'Productfeed API',
      kicker: 'Externe systemen',
      description: 'ERP, PIM of een andere bron kan eigen producten, prijzen, voorraad en marktinformatie via een beveiligde JSON feed synchroniseren.',
      ready: feedReady,
      detail: 'POST naar /api/integraties/product-feed met Bearer DATA_FEED_API_KEY en de companyId van de doelorganisatie.',
      href: '/feeds',
      linkLabel: 'Open Feedbeheer',
    },
    {
      title: 'Prysight database',
      kicker: 'Datalaag',
      description: 'Feeds, Syntrx, Magento en handmatige invoer schrijven naar dezelfde tenant gescheiden kernstructuur.',
      ready: databaseReady,
      detail: databaseReady ? `Databaseverbinding actief via ${databaseStatus.mode === 'supavisor' ? 'Supavisor' : 'serververbinding'}.` : 'Database runtime configuratie vraagt nog aandacht.',
      href: '/dashboard',
      linkLabel: 'Open dashboard',
    },
    {
      title: 'Alert webhook',
      kicker: 'Automatisering',
      description: 'Nieuwe prijs, voorraad en opportunity signalen kunnen naar een externe workflow, Teams, Slack of mailservice worden doorgestuurd.',
      ready: webhookReady,
      detail: 'De webhook ontvangt gestructureerde JSON met type, titel, melding en gekoppelde IDs.',
      href: '/waarschuwingen',
      linkLabel: 'Bekijk waarschuwingen',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2"><Link href="/feeds" className="secondary-action">Feeds</Link><Link href="/prijswijzigingen" className="primary-action">Prijsuitvoering</Link></div>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Directe productstroom</p>
              <h2 className="mt-1.5 text-[15px] font-semibold text-[#252a37]">Syntrx PIM</h2>
            </div>
            <Status ready={Boolean(syntrx)} label={syntrx ? 'Gekoppeld' : 'Nog niet gekoppeld'} />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#697386]">Activeer Prysight in Syntrx, de eerste geldige synchronisatie koppelt de bron automatisch.</p>
          <div className="mt-4 rounded-[11px] bg-[#f6f8fb] px-3 py-3 text-[10px] leading-5 text-[#6f7b91]">
            {syntrx ? <>Laatste synchronisatie {formatDate(syntrx.lastRunAt)}, {syntrx.lastItemCount} regels, status {syntrx.lastRunStatus}.</> : <>Nog geen geldige Syntrx overdracht ontvangen voor deze organisatie.</>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="https://app.syntrx.eu/integrations" target="_blank" rel="noreferrer" className="primary-action">Open Syntrx integraties</a>
            <Link href="/integraties" className="secondary-action">Status vernieuwen</Link>
          </div>
          <details className="mt-3 text-[10px] text-[#8790a2]"><summary className="cursor-pointer font-semibold">Technische details</summary><p className="mt-2">Doelendpoint, https://prysight.netlify.app/api/integraties/syntrx</p></details>
        </article>

        <article className="surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Gecontroleerde uitvoering</p>
              <h2 className="mt-1.5 text-[15px] font-semibold text-[#252a37]">Magento 2</h2>
            </div>
            <Status ready={magentoSummary.ready} label={magentoSummary.ready ? 'Gekoppeld' : 'Niet gekoppeld'} />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#697386]">Koppel Magento met een Integration Access Token, writeback wordt pas actief na een geslaagde API test.</p>
          <MagentoIntegrationPanel initialSummary={magentoSummary} canManage={canManage} />
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {supportingCards.map((card) => <div key={card.title} className="surface-card flex min-h-[170px] flex-col p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-[14px] font-semibold text-[#252a37]">{card.title}</h2><Status ready={card.ready} /></div><p className="mt-3 text-[11px] leading-5 text-[#697386]">{card.description}</p><div className="mt-auto pt-4"><details className="text-[10px] text-[#7d8799]"><summary className="cursor-pointer font-semibold">Details</summary><p className="mt-2 leading-5">{card.detail}</p></details><Link href={card.href} className="mt-3 inline-flex text-[10px] font-semibold text-[var(--blue)]">{card.linkLabel} →</Link></div></div>)}
      </section>

      <details className="surface-card overflow-hidden"><summary className="cursor-pointer list-none px-5 py-4 text-[13px] font-semibold text-[#252a37]">Writeback beveiliging</summary><p className="border-t border-[#edf0f3] px-5 py-4 text-[11px] leading-5 text-[#697386]">Prijsadvies, aanvraag, hercontrole, goedkeuring, live prijscontrole, publicatie en verificatie. Rollback wordt geblokkeerd zodra de prijs buiten Prysight is gewijzigd.</p></details>
    </div>
  )
}
