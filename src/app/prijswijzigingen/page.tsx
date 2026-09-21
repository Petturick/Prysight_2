export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  applyApprovedPriceChangeAction,
  approvePriceChangeRequestAction,
  rejectPriceChangeRequestAction,
  rollbackAppliedPriceChangeAction,
} from '@/app/actions/priceChangeActions'
import { requirePermission } from '@/lib/authz'
import { formatCurrency, formatDate } from '@/lib/format'
import { isMagentoPricingConfigured } from '@/lib/magento-pricing'
import { listPriceChangeRequests, type PriceChangeStatus } from '@/lib/price-change-workflow'

const statusLabels: Record<PriceChangeStatus, string> = {
  PENDING: 'Wacht op goedkeuring',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  APPLYING: 'Wordt gepubliceerd',
  APPLIED: 'Gepubliceerd',
  FAILED: 'Publicatie mislukt',
  ROLLED_BACK: 'Teruggedraaid',
}

function statusClass(status: PriceChangeStatus) {
  if (status === 'APPLIED') return 'border-[#9cc7ad] bg-[#e7f4ec] text-[#17603a]'
  if (status === 'APPROVED') return 'border-[#afc5e7] bg-[#edf3fb] text-[#355a91]'
  if (status === 'PENDING' || status === 'APPLYING') return 'border-[#e1c98d] bg-[#fbf4df] text-[#77591b]'
  if (status === 'FAILED') return 'border-[#e0a5ad] bg-[#fae8eb] text-[#8b2f3d]'
  return 'border-[#d6dbe3] bg-[#f4f6f8] text-[#566071]'
}

export default async function PriceChangesPage() {
  const actor = await requirePermission('pricing.manage')
  const requests = await listPriceChangeRequests(actor.companyId, 200)
  const magentoReady = await isMagentoPricingConfigured(actor.companyId)
  const canPublish = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('pricing.publish')
  const pending = requests.filter((item) => item.status === 'PENDING').length
  const approved = requests.filter((item) => item.status === 'APPROVED').length
  const failed = requests.filter((item) => item.status === 'FAILED').length
  const applied = requests.filter((item) => item.status === 'APPLIED').length

  return (
    <div className="space-y-5">
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsuitvoering</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Goedkeuren, publiceren en terugdraaien</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Iedere externe prijswijziging krijgt eerst een vastgelegde aanvraag. PrySight controleert vóór publicatie opnieuw de commerciële guardrails en vergelijkt de actuele Magento-prijs met de oorspronkelijke snapshot.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/prijsstrategie" className="secondary-action">Prijsadviezen</Link><Link href="/prijsregels" className="secondary-action">Prijsregels</Link></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Wacht op akkoord', pending, 'Aanvragen die beoordeeld moeten worden'],
          ['Goedgekeurd', approved, 'Klaar voor gecontroleerde publicatie'],
          ['Mislukt', failed, 'Technische of veiligheidsblokkade'],
          ['Live gepubliceerd', applied, 'Kan nog gecontroleerd worden teruggedraaid'],
          ['Magento', magentoReady ? 'Gereed' : 'Niet gekoppeld', magentoReady ? 'Writeback configuratie voor deze organisatie volledig' : 'Publicatie blijft technisch geblokkeerd'],
        ].map(([label, value, helper]) => <div key={String(label)} className="surface-card-flat p-4"><p className="text-[10px] font-black uppercase tracking-[0.06em] text-[#6f7b91]">{label}</p><p className="mt-2 text-[24px] font-black text-[#171b28]">{String(value)}</p><p className="mt-1 text-[10px] leading-5 text-[#8790a2]">{helper}</p></div>)}
      </section>

      {!canPublish ? <section className="rounded-[12px] border-2 border-[#afc5e7] bg-[#edf3fb] p-4"><p className="text-[12px] font-black text-[#355a91]">Gescheiden publicatierecht actief</p><p className="mt-1 text-[11px] leading-5 text-[#526d95]">Je kunt prijsadviezen aanvragen en de status volgen. Goedkeuren, afwijzen, publiceren en rollback vereisen het aparte recht <strong>Prijswijzigingen publiceren</strong>.</p></section> : null}
      {!magentoReady ? <section className="rounded-[12px] border-2 border-[#e1c98d] bg-[#fbf4df] p-4"><p className="text-[12px] font-black text-[#6f5218]">Magento writeback staat veilig uit</p><p className="mt-1 text-[11px] leading-5 text-[#7b6534]">Aanvragen kunnen wel worden aangemaakt en beheerd. Publiceren blijft geblokkeerd totdat Magento 2 onder <Link href="/integraties" className="font-black underline">Integraties</Link> succesvol is getest en gekoppeld.</p></section> : null}

      <section className="space-y-3">
        {requests.length === 0 ? <div className="surface-card p-8 text-center"><p className="text-[13px] font-semibold text-[#34445b]">Nog geen prijswijzigingen</p><p className="mt-2 text-[11px] text-[#7b889a]">Maak vanuit Prijsstrategie een aanvraag van een actieadvies.</p></div> : requests.map((item) => {
          const target = item.approvedPrice ?? item.recommendedPrice
          return <article key={item.id} className="surface-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[#e6eaf0] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${statusClass(item.status)}`}>{statusLabels[item.status]}</span><span className="text-[10px] font-semibold text-[#8790a2]">{item.countryCode ?? item.countryName ?? 'Algemeen'}</span></div>
                <h2 className="mt-2 text-[14px] font-black text-[#202b3b]">{item.articleNumber} · {item.productName}</h2>
                <p className="mt-1 text-[10px] text-[#8790a2]">Aangevraagd {formatDate(item.createdAt)}{item.requestedByName ? ` door ${item.requestedByName}` : ''}</p>
              </div>
              <div className="grid min-w-[320px] grid-cols-3 gap-2 text-right">
                <div><p className="text-[9px] font-bold uppercase text-[#8790a2]">Huidig</p><p className="mt-1 text-[14px] font-black text-[#27364a]">{formatCurrency(item.currentPrice, item.currency)}</p></div>
                <div><p className="text-[9px] font-bold uppercase text-[#8790a2]">Advies</p><p className="mt-1 text-[14px] font-black text-[#355a91]">{formatCurrency(item.recommendedPrice, item.currency)}</p></div>
                <div><p className="text-[9px] font-bold uppercase text-[#8790a2]">Doel</p><p className="mt-1 text-[14px] font-black text-[#17603a]">{formatCurrency(target, item.currency)}</p></div>
              </div>
            </div>

            <div className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_auto]">
              <div className="space-y-2 text-[10px] leading-5 text-[#667388]">
                {item.reason ? <p><strong className="text-[#34445b]">Reden:</strong> {item.reason}</p> : null}
                {item.approvedAt ? <p><strong className="text-[#34445b]">Goedgekeurd:</strong> {formatDate(item.approvedAt)}{item.approvedByName ? ` door ${item.approvedByName}` : ''}</p> : null}
                {item.appliedAt ? <p><strong className="text-[#34445b]">Magento gepubliceerd:</strong> {formatDate(item.appliedAt)}</p> : null}
                {item.rolledBackAt ? <p><strong className="text-[#34445b]">Rollback:</strong> {formatDate(item.rolledBackAt)}</p> : null}
                {item.errorMessage ? <p className="rounded-[9px] border border-[#e0a5ad] bg-[#fae8eb] px-3 py-2 text-[#8b2f3d]"><strong>Fout:</strong> {item.errorMessage}</p> : null}
              </div>

              {canPublish ? <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                {item.status === 'PENDING' ? <>
                  <form action={approvePriceChangeRequestAction} className="flex items-end gap-2"><input type="hidden" name="requestId" value={item.id} /><label className="text-[9px] font-bold text-[#6f7b91]">Goedgekeurde prijs<input name="approvedPrice" type="number" min="0.01" step="0.01" defaultValue={item.recommendedPrice.toFixed(2)} className="mt-1 block h-9 w-28 rounded-[8px] border border-[#d7dde6] px-2 text-[11px]" /></label><button className="primary-action">Goedkeuren</button></form>
                  <form action={rejectPriceChangeRequestAction}><input type="hidden" name="requestId" value={item.id} /><button className="secondary-action">Afwijzen</button></form>
                </> : null}
                {(item.status === 'APPROVED' || item.status === 'FAILED') ? <form action={applyApprovedPriceChangeAction}><input type="hidden" name="requestId" value={item.id} /><button disabled={!magentoReady} className="primary-action disabled:cursor-not-allowed disabled:opacity-40">{item.status === 'FAILED' ? 'Opnieuw publiceren' : 'Publiceren naar Magento'}</button></form> : null}
                {item.status === 'APPLIED' ? <form action={rollbackAppliedPriceChangeAction}><input type="hidden" name="requestId" value={item.id} /><button className="secondary-action">Rollback</button></form> : null}
              </div> : null}
            </div>
          </article>
        })}
      </section>
    </div>
  )
}
