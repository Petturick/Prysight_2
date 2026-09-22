import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { discoverCompetitorUrlsByEan } from '@/lib/ean-competitor-discovery'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

type Extra = { mpn:string|null; brand:string|null; model:string|null }
type Hit = { title:string; url:string; snippet?:string }

async function webSearch(query:string):Promise<Hit[]> {
  const serperKey=process.env.SERPER_API_KEY
  if(serperKey){
    const response=await fetch('https://google.serper.dev/search',{method:'POST',headers:{'content-type':'application/json','X-API-KEY':serperKey},body:JSON.stringify({q:query,num:8}),cache:'no-store'})
    if(response.ok){
      const data=await response.json() as {organic?:Array<{title?:string;link?:string;snippet?:string}>}
      const hits=(data.organic??[]).flatMap((item)=>item.link?[{title:item.title??item.link,url:item.link,snippet:item.snippet}]:[])
      if(hits.length)return hits
    }
  }

  const braveKey=process.env.BRAVE_SEARCH_API_KEY
  if(braveKey){
    const response=await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,{headers:{Accept:'application/json','X-Subscription-Token':braveKey},cache:'no-store'})
    if(response.ok){
      const data=await response.json() as {web?:{results?:Array<{title?:string;url?:string;description?:string}>}}
      const hits=(data.web?.results??[]).flatMap((item)=>item.url?[{title:item.title??item.url,url:item.url,snippet:item.description}]:[])
      if(hits.length)return hits
    }
  }

  const response=await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,{headers:{'user-agent':'Mozilla/5.0 (compatible; PrysightBot/1.0)'},cache:'no-store'})
  if(!response.ok)return[]
  const html=await response.text()
  const hits:Hit[]=[]
  const pattern=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for(const match of html.matchAll(pattern)){
    try{
      const parsed=new URL(match[1],'https://duckduckgo.com')
      const redirected=parsed.searchParams.get('uddg')
      const url=redirected?decodeURIComponent(redirected):match[1]
      const title=match[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim()
      hits.push({title:title||url,url})
    }catch{}
    if(hits.length>=8)break
  }
  return hits
}

export async function discoverProductCandidates(input:{companyId:string;productId:string;countryId:string}) {
  const [product,country,companyWebshops]=await Promise.all([
    prisma.product.findFirst({where:{id:input.productId,companyId:input.companyId,isActive:true}}),
    prisma.country.findUnique({where:{id:input.countryId}}),
    prisma.webshop.findMany({where:{companyId:input.companyId,isActive:true,competitorId:null},select:{url:true}}),
  ])
  if(!product)return{found:0,created:0,reason:'Product ontbreekt'}
  if(!country)return{found:0,created:0,reason:'Markt ontbreekt'}
  if(product.ean)return discoverCompetitorUrlsByEan(input)
  const extra=(await prisma.$queryRaw<Extra[]>(Prisma.sql`select mpn,brand,model from products where id=${input.productId} and company_id=${input.companyId} limit 1`))[0]
  const identifier=(product.gtin||extra?.mpn||product.articleNumber||'').trim()
  if(!identifier)return{found:0,created:0,reason:'Productidentificatie ontbreekt'}
  const hits=await webSearch(`"${identifier}" ${extra?.brand??''} ${extra?.model??''} ${product.name} ${country.name} ${country.code}`)
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
