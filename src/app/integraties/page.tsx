export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'
import { formatDate } from '@/lib/format'

function Status({ ready, label }: { ready: boolean; label?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${ready ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>{label ?? (ready ? 'Actief' : 'Configuratie nodig')}</span>
}

export default async function IntegrationsPage() {
  const actor = await requireAuthenticatedUser()
  const monitorReady = Boolean(process.env.PRICE_MONITOR_API_KEY)
  const feedReady = Boolean(process.env.DATA_FEED_API_KEY)
  const webhookReady = Boolean(process.env.ALERT_WEBHOOK_URL)
  const databasePassword = process.env.PRICING_DB_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD
  const databaseProjectId = process.env.PRICING_DB_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID
  const databaseReady = Boolean(databasePassword && databaseProjectId)
  const syntrxResult = await safeDatabaseQuery(
    () => prisma.feedSource.findFirst({
      where: { companyId: actor.companyId, sourceType: 'SYNTRX', isActive: true },
      orderBy: { lastRunAt: 'desc' },
    }),
    null,
  )
  const syntrx = syntrxResult.data

  const cards = [
    {
      title: 'Syntrx PIM',
      kicker: 'Directe productstroom',
      description: 'Producten kunnen rechtstreeks vanuit Syntrx naar Prysight worden gesynchroniseerd. De status hieronder hoort uitsluitend bij de actieve organisatie.',
      ready: Boolean(syntrx),
      detail: syntrx ? `Laatste synchronisatie ${formatDate(syntrx.lastRunAt)}, ${syntrx.lastItemCount} regels, status ${syntrx.lastRunStatus}.` : 'Nog geen actieve Syntrx bron gekoppeld aan deze organisatie.',
      href: '/feeds',
      linkLabel: 'Bekijk databronnen',
    },
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
      description: 'ERP, Magento, PIM of een andere bron kan eigen producten, prijzen, voorraad en marktinformatie via een beveiligde JSON feed synchroniseren.',
      ready: feedReady,
      detail: 'POST naar /api/integraties/product-feed met Bearer DATA_FEED_API_KEY en de companyId van de doelorganisatie. Bestaande standaardintegraties blijven compatibel.',
      href: '/feeds',
      linkLabel: 'Open Feedbeheer',
    },
    {
      title: 'Prysight database',
      kicker: 'Datalaag',
      description: 'De applicatie gebruikt de toegewezen Supabase database via de server side databaseverbinding. Feeds, Syntrx en handmatige invoer schrijven naar dezelfde tenant gescheiden kernstructuur.',
      ready: databaseReady && syntrxResult.available,
      detail: databaseReady ? 'Database runtime configuratie gevonden.' : 'Database runtime configuratie vraagt nog aandacht.',
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
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Integraties</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Datastromen zonder afhankelijkheid</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Elke integratie en bron wordt gekoppeld aan de actieve organisatie. Zo blijven productdata, monitoring en exports gescheiden wanneer meerdere klanten Prysight gebruiken.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/feeds" className="secondary-action">Feedbeheer</Link><Link href="/producten" className="primary-action">Productonderzoek</Link></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">{cards.map((card) => <div key={card.title} className="surface-card flex min-h-[225px] flex-col p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">{card.kicker}</p><h2 className="mt-1.5 text-[14px] font-semibold text-[#252a37]">{card.title}</h2></div><Status ready={card.ready} /></div><p className="mt-3 text-[11px] leading-6 text-[#697386]">{card.description}</p><div className="mt-auto pt-4"><p className="rounded-[11px] bg-[#f6f8fb] px-3 py-3 text-[9px] leading-5 text-[#7d8799]">{card.detail}</p><Link href={card.href} className="mt-3 inline-flex text-[10px] font-semibold text-[var(--blue)]">{card.linkLabel} →</Link></div></div>)}</section>

      <section className="surface-card p-5">
        <h2 className="text-[14px] font-semibold text-[#252a37]">Veilige writeback laag</h2>
        <p className="mt-2 max-w-4xl text-[11px] leading-6 text-[#697386]">Automatische prijswijziging naar Magento of ERP blijft bewust afgeschermd totdat kostprijs, minimale marge, maximumprijs, bevoegdheden en goedkeuringsregels als harde guardrails beschikbaar zijn. Prysight kan nu onderzoeken en adviseren zonder ongecontroleerd verkoopprijzen terug te schrijven.</p>
      </section>
    </div>
  )
}
