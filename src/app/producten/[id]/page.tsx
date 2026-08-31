export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, runProductResearchAction } from '@/app/actions/productActions'
import { DataTable } from '@/components/DataTable'
import { PriceChart } from '@/components/PriceChart'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser()
  const { id } = await params
  const query = await searchParams
  const product = await prisma.product.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      productGroup: true,
      productMarkets: { include: { country: true }, orderBy: { country: { name: 'asc' } } },
      ownPriceHistory: { orderBy: { recordedAt: 'asc' } },
      matches: {
        include: {
          competitorOffer: {
            include: {
              competitor: { include: { country: true } },
              priceHistory: { orderBy: { recordedAt: 'asc' } },
              priceChecks: { orderBy: { checkedAt: 'desc' }, take: 5 },
            },
          },
        },
      },
    },
  })

  if (!product) notFound()
  const countries = await getActiveCompanyCountries(user.companyId)
  const defaultCountry = countries.find((country) => product.productMarkets.some((market) => market.countryId === country.id)) ?? countries.find((country) => country.code === 'NL') ?? countries[0]

  const chartData = product.ownPriceHistory.map((entry) => {
    const competitorPoints = product.matches
      .flatMap((match) => match.competitorOffer.priceHistory)
      .filter((history) => history.recordedAt.toDateString() === entry.recordedAt.toDateString())
      .map((history) => Number(history.normalizedPrice ?? history.price))
    return {
      date: entry.recordedAt.toLocaleDateString('nl-NL'),
      ownPrice: Number(entry.price),
      competitorPrice: competitorPoints.length ? Math.min(...competitorPoints) : null,
    }
  })

  const validPrices = product.matches.map((match) => match.competitorOffer.normalizedPrice).filter((price): price is NonNullable<typeof price> => price !== null).map(Number)
  const lowestPrice = validPrices.length ? Math.min(...validPrices) : null
  const averagePrice = validPrices.length ? validPrices.reduce((sum, value) => sum + value, 0) / validPrices.length : null
  const latestCheck = product.matches.map((match) => match.competitorOffer.lastCheckedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const ownPrice = product.ownPrice ? Number(product.ownPrice) : null
  const difference = ownPrice !== null && lowestPrice !== null ? ownPrice - lowestPrice : null
  const controlMessage = readParam(query.controle)

  return (
    <div className="space-y-5">
      {(readParam(query.toegevoegd) || readParam(query.bron) || controlMessage) ? (
        <div className="rounded-[12px] border border-[#cae9d7] bg-[var(--green-soft)] px-4 py-3 text-[11px] font-medium text-[#286848]">
          {readParam(query.toegevoegd) ? 'Product toegevoegd. Voeg hieronder concurrent product URLs toe om de prijsmonitoring te starten.' : readParam(query.bron) ? 'Concurrent URL gekoppeld. Je kunt de prijs nu direct controleren.' : `Prijscontrole afgerond. Resultaat succesvol en mislukt: ${controlMessage}.`}
        </div>
      ) : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Productonderzoek</p><span className="rounded-full bg-[#f0f2f6] px-2.5 py-1 text-[9px] font-bold text-[#697386]">{product.articleNumber}</span></div>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">{product.name}</h1>
            <p className="mt-2 text-[12px] text-[#697386]">{product.productGroup.name} · {product.packagingQty} {product.packagingUnit ?? 'stuks'} · {product.stockStatus ?? 'Voorraad onbekend'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/producten" className="secondary-action">Terug naar producten</Link>
            <form action={runProductResearchAction}><input type="hidden" name="productId" value={product.id} /><button type="submit" disabled={product.matches.length === 0} className="primary-action disabled:cursor-not-allowed disabled:opacity-45">Prijzen nu controleren</button></form>
          </div>
        </div>
        <div className="grid border-t border-[var(--border)] sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-4"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Eigen prijs</p><p className="mt-1 text-[20px] font-semibold text-[#202536]">{formatCurrency(product.ownPrice, product.currency)}</p></div>
          <div className="border-y border-[var(--border)] px-5 py-4 sm:border-l sm:border-y-0"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Laagste marktprijs</p><p className="mt-1 text-[20px] font-semibold text-[#202536]">{formatCurrency(lowestPrice)}</p></div>
          <div className="px-5 py-4 sm:border-l sm:border-[var(--border)]"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Gemiddelde marktprijs</p><p className="mt-1 text-[20px] font-semibold text-[#202536]">{formatCurrency(averagePrice)}</p></div>
          <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Verschil met laagste</p><p className={`mt-1 text-[20px] font-semibold ${difference !== null && difference > 0 ? 'text-[var(--amber)]' : 'text-[var(--green)]'}`}>{difference === null ? '—' : `${difference >= 0 ? '+' : ''}${formatCurrency(difference)}`}</p></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-semibold text-[#252a37]">Concurrent product URL toevoegen</h2><p className="mt-1 text-[11px] leading-5 text-[#8790a2]">Koppel de exacte productpagina van een concurrent. Prysight leest prijs, voorraad en producttitel uit waar de website dit technisch toestaat.</p></div><span className="rounded-full bg-[var(--blue-soft)] px-2.5 py-1 text-[9px] font-bold text-[var(--blue)]">Onderzoeksbron</span></div>
          <form action={addCompetitorOfferAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="productId" value={product.id} />
            <label className="text-[10px] font-semibold text-[#4f5869]">Concurrent *<input required name="competitorName" className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld Manutan" /></label>
            <label className="text-[10px] font-semibold text-[#4f5869]">Land *<select required name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label className="text-[10px] font-semibold text-[#4f5869] md:col-span-2">Exacte product URL *<input required type="url" name="offerUrl" className="toolbar-control mt-1.5 w-full" placeholder="https://concurrent.nl/product/..." /></label>
            <div className="md:col-span-2 flex justify-end"><button type="submit" className="primary-action">Concurrent URL koppelen</button></div>
          </form>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-[14px] font-semibold text-[#252a37]">Markten</h2>
          <p className="mt-1 text-[11px] text-[#8790a2]">Eigen prijs en URL kunnen per land uit een feed, Syntrx of handmatige invoer komen.</p>
          <div className="mt-4 space-y-2">{product.productMarkets.length === 0 ? <p className="rounded-[12px] bg-[#f6f8fb] px-3 py-4 text-[10px] text-[#8790a2]">Nog geen landspecifieke productdata.</p> : product.productMarkets.map((market) => <div key={market.id} className="flex items-center justify-between gap-3 rounded-[11px] bg-[#f6f8fb] px-3 py-3"><div><p className="text-[11px] font-semibold text-[#303647]">{market.country.name}</p><p className="mt-0.5 text-[9px] text-[#8a93a5]">{market.stockStatus ?? 'Voorraad onbekend'}</p></div><div className="text-right"><p className="text-[11px] font-semibold text-[#303647]">{formatCurrency(market.ownPrice, market.currency)}</p>{market.ownUrl ? <a href={market.ownUrl} target="_blank" rel="noreferrer" className="mt-0.5 block text-[9px] font-semibold text-[var(--blue)]">Open webshop</a> : null}</div></div>)}</div>
        </div>
      </section>

      <PriceChart data={chartData} />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1"><div><h2 className="text-[14px] font-semibold text-[#252a37]">Concurrentieprijzen</h2><p className="mt-1 text-[10px] text-[#8a93a5]">{product.matches.length} gekoppelde bron{product.matches.length === 1 ? '' : 'nen'}, laatste controle {formatDate(latestCheck)}.</p></div></div>
        <DataTable
          emptyText="Nog geen concurrent URLs gekoppeld. Voeg hierboven een onderzoeksbron toe."
          columns={[
            { key: 'concurrent', header: 'Concurrent' }, { key: 'land', header: 'Land' }, { key: 'prijs', header: 'Prijs' }, { key: 'genormaliseerd', header: 'Genormaliseerd' }, { key: 'match', header: 'Match' }, { key: 'score', header: 'Score' }, { key: 'voorraad', header: 'Voorraad' }, { key: 'laatsteControle', header: 'Laatste controle' }, { key: 'bron', header: 'Bron' },
          ]}
          rows={product.matches.map((match) => ({
            concurrent: match.competitorOffer.competitor.name,
            land: match.competitorOffer.competitor.country.name,
            prijs: formatCurrency(match.competitorOffer.rawPrice, match.competitorOffer.currency),
            genormaliseerd: formatCurrency(match.competitorOffer.normalizedPrice),
            match: match.matchStatus,
            score: `${formatNumber(match.confidenceScore)} / 100`,
            voorraad: match.competitorOffer.stockStatus ?? '—',
            laatsteControle: formatDate(match.competitorOffer.lastCheckedAt),
            bron: <a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--blue)]">Open URL</a>,
          }))}
        />
      </section>

      <section className="space-y-3">
        <div className="px-1"><h2 className="text-[14px] font-semibold text-[#252a37]">Controlehistorie</h2><p className="mt-1 text-[10px] text-[#8a93a5]">Technische resultaten van de laatste prijscontroles per bron.</p></div>
        <DataTable
          columns={[
            { key: 'tijd', header: 'Controlemoment' }, { key: 'concurrent', header: 'Concurrent' }, { key: 'methode', header: 'Methode' }, { key: 'status', header: 'Status' }, { key: 'prijs', header: 'Prijs' }, { key: 'melding', header: 'Melding' },
          ]}
          rows={product.matches.flatMap((match) =>
            match.competitorOffer.priceChecks.map((check) => ({
              tijd: formatDate(check.checkedAt),
              concurrent: match.competitorOffer.competitor.name,
              methode: check.checkMethod,
              status: check.isSuccess ? 'Succes' : `Fout ${check.statusCode ?? '—'}`,
              prijs: formatCurrency(check.foundPrice, check.currency),
              melding: check.errorMessage ?? '—',
            })),
          )}
        />
      </section>
    </div>
  )
}
