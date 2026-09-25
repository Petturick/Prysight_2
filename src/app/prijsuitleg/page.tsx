export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { getPricingRecommendations } from '@/lib/pricing-engine'

function money(value: number | null) { return value === null ? '—' : new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value) }
function pct(value: number | null) { return value === null ? '—' : `${value.toFixed(1)}%` }

export default async function PriceExplanationPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const actor=await requirePermission('pricing.manage')
  const params=await searchParams
  const productId=Array.isArray(params.productId)?params.productId[0]:params.productId
  const countryId=Array.isArray(params.countryId)?params.countryId[0]:params.countryId
  const {recommendations}=await getPricingRecommendations(actor.companyId,{},250,true)
  const rows=recommendations.filter((item)=>(!productId||item.productId===productId)&&(!countryId||item.countryId===countryId)).slice(0,100)
  return <div className="space-y-5">
    <div className="flex justify-end"><Link href="/prijsstrategie" className="secondary-action">Prijsadviezen</Link></div>
    <section className="grid gap-4 xl:grid-cols-2">{rows.map((item)=><article key={`${item.productId}-${item.countryId??'global'}`} className="surface-card p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.06em] text-[#8490a2]">{item.countryCode??'Algemeen'} · {item.competitorCount} betrouwbare concurrenten</p><h2 className="mt-1 text-[13px] font-black text-[#27364a]">{item.articleNumber} · {item.productName}</h2></div><span className="rounded-full bg-[#edf3fb] px-2.5 py-1 text-[9px] font-bold text-[#355a91]">{item.action}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Huidig',money(item.ownPrice)],['Advies',money(item.recommendedPrice)],['Marge nu',pct(item.marginBeforePct)],['Marge advies',pct(item.marginAfterPct)]].map(([label,value])=><div key={label} className="rounded-xl bg-[#f6f8fb] p-3"><p className="text-[8px] font-bold uppercase text-[#8790a2]">{label}</p><p className="mt-1 text-[12px] font-black text-[#253248]">{value}</p></div>)}</div><div className="mt-4 text-[10px] leading-5 text-[#667388]"><p><strong className="text-[#34445b]">Prijsregel:</strong> {item.appliedRuleName??'Veilige standaard'}</p><p><strong className="text-[#34445b]">Markt:</strong> laagste {money(item.marketLowest)}, mediaan {money(item.marketMedian)}, gemiddelde {money(item.marketAverage)}</p><p><strong className="text-[#34445b]">Kostprijs:</strong> {money(item.costPrice)}, ondergrens {money(item.minimumAllowedPrice)}, bovengrens {money(item.maximumAllowedPrice)}</p><p className="mt-2 font-semibold text-[#34445b]">{item.reason}</p><ul className="mt-2 list-disc pl-5">{item.guardrailNotes.map((note)=><li key={note}>{note}</li>)}</ul></div></article>)}</section>
  </div>
}
