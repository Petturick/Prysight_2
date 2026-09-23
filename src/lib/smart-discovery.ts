import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { discoverCompetitorUrlsByEan, webSearch as searchWeb } from '@/lib/ean-competitor-discovery'
import { validGtin } from '@/lib/gtin'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

type Extra = { mpn:string|null; brand:string|null; model:string|null }
type Hit = { title:string; url:string; snippet?:string }

async function webSearch(query: string, countryCode: string): Promise<Hit[]> {
  const response = await searchWeb(query, countryCode)
  return response.candidates
}

export async function discoverProductCandidates(input:{companyId:string;productId:string;countryId:string}) {
  const [product,country,companyWebshops]=await Promise.all([
    prisma.product.findFirst({where:{id:input.productId,companyId:input.companyId,isActive:true}}),
    prisma.country.findUnique({where:{id:input.countryId}}),
    prisma.webshop.findMany({where:{companyId:input.companyId,isActive:true,competitorId:null},select:{url:true}}),
  ])
  if(!product)return{found:0,created:0,reason:'Product ontbreekt'}
  if(!country)return{found:0,created:0,reason:'Markt ontbreekt'}
  if ([product.ean, product.gtin].some(validGtin)) return discoverCompetitorUrlsByEan(input)
  const extra=(await prisma.$queryRaw<Extra[]>(Prisma.sql`select mpn,brand,model from products where id=${input.productId} and company_id=${input.companyId} limit 1`))[0]
  const identifier=(product.gtin||extra?.mpn||product.articleNumber||'').trim()
  if(!identifier)return{found:0,created:0,reason:'Productidentificatie ontbreekt'}
  const hits=await webSearch(`"${identifier}" ${extra?.brand??''} ${extra?.model??''} ${product.name} ${country.name} ${country.code}`, country.code)
  const ownHosts=new Set(companyWebshops.flatMap((shop)=>{try{return[new URL(shop.url).hostname.replace(/^www\./,'')]}catch{return[]}}))
  const suffix=(country.code.toUpperCase()==='GB'||country.code.toUpperCase()==='UK')?'.uk':`.${country.code.toLowerCase()}`
  let created=0
  for(const hit of hits.slice(0,8)){
    let safe:string
    try{safe=(await assertSafeRemoteHttpUrl(hit.url)).toString()}catch{continue}
    const url=new URL(safe); const host=url.hostname.replace(/^www\./,''); if(ownHosts.has(host)||/google\.|bing\.|duckduckgo\.|youtube\.|facebook\.|instagram\.|amazon\./i.test(host))continue
    const haystack=`${hit.title} ${hit.url} ${hit.snippet??''}`.toLowerCase()
    const nameTokens=product.name.toLowerCase().split(/\s+/).filter((token)=>token.length>=4).slice(0,6)
    let confidence=52+(haystack.includes(identifier.toLowerCase())?22:0)+Math.min(15,nameTokens.filter((token)=>haystack.includes(token)).length*3)
    if(extra?.brand&&haystack.includes(extra.brand.toLowerCase()))confidence+=5
    if(suffix&&host.toLowerCase().endsWith(suffix))confidence+=6
    confidence=Math.min(96,confidence)
    if(confidence<64)continue

    const competitorName=(url.hostname.replace(/^www\./,'').split('.')[0]||url.hostname).replace(/[-_]+/g,' ')
    const where={companyId_name_countryId:{companyId:input.companyId,name:competitorName,countryId:input.countryId}}
    let competitor=await prisma.competitor.findUnique({where})
    if(!competitor){await assertCompanyCapacity(input.companyId,'competitors');competitor=await prisma.competitor.create({data:{companyId:input.companyId,name:competitorName,website:url.origin,countryId:input.countryId,isActive:true,checkFrequencyHours:24}})}
    const existing=await prisma.competitorOffer.findUnique({where:{companyId_competitorId_url:{companyId:input.companyId,competitorId:competitor.id,url:safe}},include:{productMatch:true}})
    if(existing?.productMatch)continue
    const offer=existing??await prisma.competitorOffer.create({data:{companyId:input.companyId,competitorId:competitor.id,url:safe,currency:product.currency,vatIncluded:true,packagingUnit:product.packagingUnit,packagingQty:product.packagingQty,isActive:true}})
    await prisma.productMatch.create({data:{companyId:input.companyId,productId:product.id,competitorOfferId:offer.id,confidenceScore:confidence,matchStatus:MatchStatus.REVIEW,matchEvidence:{source:'ai-market-discovery',identifier,market:country.code,title:hit.title,snippet:hit.snippet??null,reason:'Slimme marktsuggestie op basis van productidentificatie, productcontext en gekozen markt'}}})
    created++
  }
  return{found:hits.length,created,reason:hits.length?null:'Geen kandidaten gevonden'}
}
