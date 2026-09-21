'use server'

import { FeedSourceType } from '@/generated/prisma/client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { ingestCanonicalProducts } from '@/lib/feed-ingestion'
import { discoverProductCandidates } from '@/lib/smart-discovery'
import { prisma } from '@/lib/prisma'

function text(formData: FormData, key: string) { return String(formData.get(key) ?? '').trim() }
function identifier(value: string) { return value.replace(/[^0-9A-Za-z]/g, '') }
function positiveInteger(value: string, fallback = 1) { const parsed=Number(value); return Number.isFinite(parsed)&&parsed>0?Math.round(parsed):fallback }

export async function createSmartProductAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const articleNumber=text(formData,'articleNumber'), name=text(formData,'name')
  if(!articleNumber||!name)throw new Error('Artikelnummer en productnaam zijn verplicht.')
  const countryId=text(formData,'countryId')
  const country=countryId?await requireLicensedCountry(actor.companyId,countryId):null
  const currency=text(formData,'currency')||country?.currency||'EUR'
  const ean=identifier(text(formData,'ean')), gtin=identifier(text(formData,'gtin')), mpn=text(formData,'mpn')
  const ownPrice=text(formData,'ownPrice')
  const vatIncluded=text(formData,'vatIncluded') !== 'false'
  const parsedOwnPrice=Number(ownPrice.replace(',', '.'))
  if(!ownPrice||!Number.isFinite(parsedOwnPrice)||parsedOwnPrice<=0)throw new Error('Vul een geldige verkoopprijs groter dan 0 in.')
  const pricingFields=['costPrice','minimumMarginPct','targetMarginPct','minimumPrice','maximumPrice','pricingMode','pricingCooldownHours']
  const hasPricingInput=pricingFields.some((key)=>text(formData,key))
  if(hasPricingInput&&actor.role!=='SUPER_ADMIN'&&!actor.permissions.includes('pricing.manage'))throw new Error('Onvoldoende rechten om pricinginstellingen te wijzigen.')

  await ingestCanonicalProducts({
    companyId:actor.companyId,
    sourceKey:'manual:prysight',
    sourceName:'Handmatig toegevoegd in PrySight',
    sourceType:FeedSourceType.API,
    countryCode:country?.code??'GLOBAL',
    products:[{
      articleNumber,
      ean:ean||undefined,
      gtin:gtin||undefined,
      mpn:mpn||undefined,
      brand:text(formData,'brand')||undefined,
      model:text(formData,'model')||undefined,
      name,
      productGroup:text(formData,'productGroup')||'Onbekend',
      ownPrice,
      vatIncluded,
      costPrice:text(formData,'costPrice')||undefined,
      minimumMarginPct:text(formData,'minimumMarginPct')||undefined,
      targetMarginPct:text(formData,'targetMarginPct')||undefined,
      minimumPrice:text(formData,'minimumPrice')||undefined,
      maximumPrice:text(formData,'maximumPrice')||undefined,
      pricingMode:text(formData,'pricingMode')||undefined,
      pricingCooldownHours:text(formData,'pricingCooldownHours')||undefined,
      currency,
      stockStatus:text(formData,'stockStatus')||'Onbekend',
      packagingUnit:text(formData,'packagingUnit')||'stuks',
      packagingQty:positiveInteger(text(formData,'packagingQty')),
      countryCode:country?.code,
      ownUrl:text(formData,'ownUrl')||undefined,
      isActive:true,
    }],
    config:{mode:'manual-smart-onboarding',createdBy:actor.email},
  })
  const product=await prisma.product.findUnique({where:{companyId_articleNumber:{companyId:actor.companyId,articleNumber}}})
  if(!product)throw new Error('Product is verwerkt maar kon niet worden geladen.')

  let discovery: {
    created: number
    found: number
    alreadyLinked?: number
    reason?: string | null
    provider?: string | null
    queryMode?: string | null
  } = { created: 0, found: 0, reason: country ? 'Geen nieuwe concurrentkandidaten gevonden.' : 'Geen markt geselecteerd.' }

  if(country&&(actor.role==='SUPER_ADMIN'||actor.permissions.includes('competitors.write'))){
    try{
      discovery=await discoverProductCandidates({companyId:actor.companyId,productId:product.id,countryId:country.id})
    }catch(error){
      console.error('Smart product discovery failed',error)
      discovery={created:0,found:0,reason:'Automatische concurrentherkenning kon niet direct worden afgerond.'}
    }
  }

  revalidatePath('/producten');revalidatePath('/productmatches');revalidatePath('/prijsstrategie');revalidatePath('/prijsautomatisering')
  const params=new URLSearchParams({
    toegevoegd:'1',
    suggesties:String(discovery.created),
    gevonden:String(discovery.found),
    algekoppeld:String(discovery.alreadyLinked??0),
    reden:discovery.reason??'',
    zoekbron:discovery.provider??'',
    zoekmodus:discovery.queryMode??(ean?'EAN':'PRODUCT'),
  })
  if(country?.id)params.set('markt',country.id)
  redirect(`/producten/${product.id}?${params.toString()}#concurrenten-vinden`)
}
