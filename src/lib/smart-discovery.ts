import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { discoverCompetitorUrlsByEan } from '@/lib/ean-competitor-discovery'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

type Extra = { mpn:string|null; brand:string|null; model:string|null }
type Hit = { title:string; url:string; snippet?:string }

async function webSearch(query:string):Promise<Hit[]> {
  const key=process.env.SERPER_API_KEY
  if(!key) return []
  const response=await fetch('https://google.serper.dev/search',{method:'POST',headers:{'content-type':'application/json','X-API-KEY':key},body:JSON.stringify({q:query,num:8}),cache:'no-store'})
  if(!response.ok)return[]
  const data=await response.json() as {organic?:Array<{title?:string;link?:string;snippet?:string}>}
  return (data.organic??[]).flatMap((item)=>item.link?[{title:item.title??item.link,url:item.link,snippet:item.snippet}]:[])
}

export async function discoverProductCandidates(input:{companyId:string;productId:string;countryId:string}) {
  const product=await prisma.product.findFirst({where:{id:input.productId,companyId:input.companyId,isActive:true}})
  if(!product)return{found:0,created:0,reason:'Product ontbreekt'}
  if(product.ean)return discoverCompetitorUrlsByEan(input)
  const extra=(await prisma.$queryRaw<Extra[]>(Prisma.sql`select mpn,brand,model from products where id=${input.productId} and company_id=${input.companyId} limit 1`))[0]
  const identifier=(product.gtin||extra?.mpn||'').trim()
  if(!identifier)return{found:0,created:0,reason:'EAN, GTIN en MPN ontbreken'}
  const hits=await webSearch(`"${identifier}" ${extra?.brand??''} ${extra?.model??''} ${product.name}`)
  let created=0
  for(const hit of hits.slice(0,6)){
    let safe:string
    try{safe=(await assertSafeRemoteHttpUrl(hit.url)).toString()}catch{continue}
    const url=new URL(safe); if(/google\.|youtube\.|facebook\.|instagram\./i.test(url.hostname))continue
    const competitorName=(url.hostname.replace(/^www\./,'').split('.')[0]||url.hostname).replace(/[-_]+/g,' ')
    const where={companyId_name_countryId:{companyId:input.companyId,name:competitorName,countryId:input.countryId}}
    let competitor=await prisma.competitor.findUnique({where})
    if(!competitor){await assertCompanyCapacity(input.companyId,'competitors');competitor=await prisma.competitor.create({data:{companyId:input.companyId,name:competitorName,website:url.origin,countryId:input.countryId,isActive:true,checkFrequencyHours:24}})}
    const existing=await prisma.competitorOffer.findUnique({where:{companyId_competitorId_url:{companyId:input.companyId,competitorId:competitor.id,url:safe}},include:{productMatch:true}})
    if(existing?.productMatch)continue
    const offer=existing??await prisma.competitorOffer.create({data:{companyId:input.companyId,competitorId:competitor.id,url:safe,currency:product.currency,vatIncluded:true,packagingUnit:product.packagingUnit,packagingQty:product.packagingQty,isActive:true}})
    await prisma.productMatch.create({data:{companyId:input.companyId,productId:product.id,competitorOfferId:offer.id,confidenceScore:75,matchStatus:MatchStatus.REVIEW,matchEvidence:{source:'identifier-discovery',identifier,title:hit.title,snippet:hit.snippet??null}}})
    created++
  }
  return{found:hits.length,created,reason:hits.length?null:'Geen kandidaten gevonden'}
}
