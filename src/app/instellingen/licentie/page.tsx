import { openBillingPortalAction, startSubscriptionCheckoutAction } from '@/app/actions/billingActions'
import { BillingEnvironment } from '@/generated/prisma/client'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { getStripeMode } from '@/lib/stripe'

async function loadBillingOptions() {
  try {
    const environment = getStripeMode() === 'live' ? BillingEnvironment.LIVE : BillingEnvironment.TEST
    const mappings = await prisma.stripePriceMapping.findMany({ where: { environment, isActive: true, plan: { isActive: true, isPublic: true } }, include: { plan: true }, orderBy: [{ plan: { name: 'asc' } }, { interval: 'asc' }] })
    return { ready: true, environment, mappings }
  } catch {
    return { ready: false, environment: null, mappings: [] }
  }
}

export default async function LicentiePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission('billing.manage')
  const [company, billing, params] = await Promise.all([
    prisma.company.findUnique({ where: { id: user.companyId }, include: { license: { include: { plan: true } }, stripeCustomers: true } }),
    loadBillingOptions(),
    searchParams,
  ])
  const paymentState = Array.isArray(params.betaling) ? params.betaling[0] : params.betaling
  return <div className="space-y-4">
    {paymentState === 'geslaagd' ? <div className="rounded-[10px] border border-[#b9dfcd] bg-[#eef9f3] px-4 py-3 text-[11px] font-semibold text-[#126a49]">Betaling afgerond. De abonnementsstatus wordt via de beveiligde Stripe webhook bijgewerkt.</div> : null}
    {paymentState === 'geannuleerd' ? <div className="rounded-[10px] border border-[#e4d7bb] bg-[#fff8eb] px-4 py-3 text-[11px] font-semibold text-[#81551b]">Checkout geannuleerd. Er is niets aan je abonnement gewijzigd.</div> : null}
    <div className="grid gap-4 lg:grid-cols-3"><section className="strong-panel p-5 lg:col-span-2"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-[15px] font-bold text-[#252a37]">Licentie en facturatie</h2><p className="mt-1 text-[11px] text-[#6d7a8c]">Stripe beheert betalingen, Prysight bepaalt toegang en limieten op basis van de bevestigde abonnementsstatus.</p></div>{company?.stripeCustomers.length ? <form action={openBillingPortalAction}><button className="secondary-action">Beheer facturatie</button></form> : null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Organisatie</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{company?.name ?? 'Onbekend'}</p></div><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Plan</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{company?.license?.plan.name ?? 'Geen actief plan'}</p></div><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Status</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{company?.license?.status ?? 'Onbekend'}</p></div><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Facturatie e mail</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{company?.billingEmail ?? 'Niet ingesteld'}</p></div></div></section><section className="strong-panel p-5"><h3 className="text-[13px] font-bold text-[#252a37]">Limieten</h3><div className="mt-4 space-y-2 text-[11px] font-semibold text-[#667085]"><p>Gebruikers, {company?.license?.plan.maxUsers ?? 'onbeperkt'}</p><p>Landen, {company?.license?.plan.maxCountries ?? 'onbeperkt'}</p><p>Concurrenten, {company?.license?.plan.maxCompetitors ?? 'onbeperkt'}</p><p>SKU&apos;s, {company?.license?.plan.maxSkus ?? 'onbeperkt'}</p><p>Checks per dag, {company?.license?.plan.maxChecksPerDay ?? 'onbeperkt'}</p></div></section></div>
    <section className="strong-panel p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Abonnement</p><h2 className="mt-2 text-[15px] font-bold text-[#252a37]">Plan kiezen of wijzigen</h2></div><p className="text-[10px] text-[#7a8798]">{billing.ready ? `Stripe ${billing.environment === BillingEnvironment.LIVE ? 'live' : 'test'} is gekoppeld.` : 'Stripe is nog niet geconfigureerd voor deze omgeving.'}</p></div>{billing.mappings.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{billing.mappings.map((mapping) => <form key={mapping.id} action={startSubscriptionCheckoutAction} className="rounded-[12px] border border-[#e1e7ef] bg-white p-4"><input type="hidden" name="stripePriceId" value={mapping.stripePriceId} /><p className="text-[12px] font-bold text-[#26364d]">{mapping.plan.name}</p><p className="mt-1 text-[10px] leading-5 text-[#748196]">{mapping.plan.description ?? 'Prysight abonnement'}</p><p className="mt-3 text-[10px] font-semibold text-[#4f6078]">{mapping.interval === 'MONTH' ? 'Maandelijks' : 'Jaarlijks'}</p><button className="primary-action mt-4 w-full">Kies dit plan</button></form>)}</div> : <div className="mt-4 rounded-[10px] border border-dashed border-[#d7dfe9] bg-[#fafbfd] px-4 py-5 text-[11px] text-[#728096]">Er zijn nog geen actieve publieke Stripe prijs mappings beschikbaar. De bestaande trial en handmatige licentie blijven veilig werken.</div>}</section>
  </div>
}
