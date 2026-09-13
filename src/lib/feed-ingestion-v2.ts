import { FeedFormat, FeedSourceType, FeedSyncStatus, Prisma } from '@/generated/prisma/client'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { fetchAndParseFeed, type ParsedFeed } from '@/lib/feed-parser'
import { FEED_TARGET_FIELDS, inferHeaderTarget, normalizeHeader } from '@/lib/import-mapping'
import { saveProductOnboardingFields } from '@/lib/product-onboarding-fields'
import { prisma } from '@/lib/prisma'

export type CanonicalFeedProduct = {
  articleNumber?: unknown; ean?: unknown; gtin?: unknown; mpn?: unknown; brand?: unknown; model?: unknown; name?: unknown; description?: unknown; productGroup?: unknown;
  ownPrice?: unknown; costPrice?: unknown; minimumMarginPct?: unknown; targetMarginPct?: unknown; minimumPrice?: unknown; maximumPrice?: unknown;
  pricingMode?: unknown; pricingCooldownHours?: unknown; currency?: unknown; stockStatus?: unknown; packagingUnit?: unknown; packagingQty?: unknown;
  isActive?: unknown; sourceUpdatedAt?: unknown; countryCode?: unknown; ownUrl?: unknown; [key: string]: unknown
}
type Mapping = { sourceColumn: string; targetField: string | null; sampleValue: string }
const FEED_KEYS = FEED_TARGET_FIELDS.map((field) => field.key)

export function inferMappings(headers: string[], sample: Record<string,string> = {}): Mapping[] {
  return headers.map((sourceColumn) => ({ sourceColumn, targetField: inferHeaderTarget(sourceColumn, FEED_KEYS) || null, sampleValue: sample[sourceColumn] ?? '' }))
}
function text(v: unknown) { const x=String(v ?? '').trim(); return x || null }
function dec(v: unknown) { const x=text(v); if(!x)return null; const n=Number(x.replace(/[^0-9,.-]/g,'').replace(/\.(?=.*\.)/g,'').replace(',','.')); return Number.isFinite(n)?new Prisma.Decimal(n):null }
function qty(v: unknown, fallback=1) { const n=Number(String(v ?? '').replace(',','.')); return Number.isFinite(n)&&n>0?Math.round(n):fallback }
function bool(v: unknown, fallback=true) { if(typeof v==='boolean')return v; const x=String(v ?? '').trim().toLowerCase(); if(['0','false','nee','no','inactive','disabled'].includes(x))return false; if(['1','true','ja','yes','active','enabled'].includes(x))return true; return fallback }
function mapRow(row: Record<string,string>, mappings: Mapping[]): CanonicalFeedProduct {
  const out: CanonicalFeedProduct={}
  for(const m of mappings){ if(!m.targetField)continue; const v=row[m.sourceColumn]; if(v===undefined||v==='')continue; if(m.targetField==='ownPrice'&&out.ownPrice&&normalizeHeader(m.sourceColumn)==='price')continue; if(m.targetField==='name'&&out.name)continue; out[m.targetField]=v }
  if(!text(out.name)&&text(out.description))out.name=out.description
  return out
}
async function saveMappings(companyId:string, feedSourceId:string, mappings:Mapping[]){
  await prisma.feedColumnMapping.deleteMany({where:{companyId,feedSourceId}})
  for(const [position,m] of mappings.entries()) await prisma.feedColumnMapping.create({data:{companyId,feedSourceId,sourceColumn:m.sourceColumn,targetField:m.targetField,dataType:'text',sampleValue:m.sampleValue.slice(0,500),position}})
}
async function licensedCountry(companyId:string, raw:unknown){ const code=text(raw)?.toUpperCase(); if(!code)return null; const country=await prisma.country.findUnique({where:{code}}); if(!country)return null; const link=await prisma.companyCountry.findUnique({where:{companyId_countryId:{companyId,countryId:country.id}}}); return link?.isActive?country:null }
async function syncMarket(companyId:string, productId:string, mapped:CanonicalFeedProduct, ownPrice:Prisma.Decimal|null, currency:string){
  const country=await licensedCountry(companyId,mapped.countryCode); if(!country)return
  const ownUrl=text(mapped.ownUrl), stockStatus=text(mapped.stockStatus), active=bool(mapped.isActive,true)
  await prisma.productMarket.upsert({where:{companyId_productId_countryId:{companyId,productId,countryId:country.id}},update:{...(ownPrice?{ownPrice}:{}),currency,...(ownUrl?{ownUrl}:{}),...(stockStatus?{stockStatus}:{}),isActive:active},create:{companyId,productId,countryId:country.id,ownPrice:ownPrice??undefined,currency,ownUrl:ownUrl??undefined,stockStatus:stockStatus??'Onbekend',isActive:active}})
}
async function importProduct(companyId:string, feedSourceId:string, rowIndex:number, raw:Record<string,unknown>, mapped:CanonicalFeedProduct){
  const articleNumber=text(mapped.articleNumber), name=text(mapped.name); if(!articleNumber||!name)throw new Error('Artikelnummer/SKU en productnaam zijn verplicht.')
  const groupName=text(mapped.productGroup)??'Onbekend'
  const group=await prisma.productGroup.upsert({where:{companyId_name:{companyId,name:groupName}},update:{isActive:true},create:{companyId,name:groupName,description:'Automatisch aangemaakt vanuit productfeed.'}})
  const ownPrice=dec(mapped.ownPrice), existing=await prisma.product.findUnique({where:{companyId_articleNumber:{companyId,articleNumber}}})
  const product=await prisma.product.upsert({where:{companyId_articleNumber:{companyId,articleNumber}},update:{name,ean:text(mapped.ean)??undefined,gtin:text(mapped.gtin)??undefined,productGroupId:group.id,...(ownPrice?{ownPrice}:{}),currency:text(mapped.currency)??undefined,stockStatus:text(mapped.stockStatus)??undefined,packagingUnit:text(mapped.packagingUnit)??undefined,packagingQty:qty(mapped.packagingQty),isActive:bool(mapped.isActive,true)},create:{companyId,articleNumber,name,ean:text(mapped.ean),gtin:text(mapped.gtin),productGroupId:group.id,ownPrice:ownPrice??undefined,currency:text(mapped.currency)??'EUR',stockStatus:text(mapped.stockStatus)??'Onbekend',packagingUnit:text(mapped.packagingUnit)??'stuks',packagingQty:qty(mapped.packagingQty),isActive:bool(mapped.isActive,true)}})
  await saveProductOnboardingFields(companyId,product.id,{mpn:mapped.mpn,brand:mapped.brand,model:mapped.model,costPrice:mapped.costPrice,minimumMarginPct:mapped.minimumMarginPct,targetMarginPct:mapped.targetMarginPct,minimumPrice:mapped.minimumPrice,maximumPrice:mapped.maximumPrice,pricingMode:mapped.pricingMode,pricingCooldownHours:mapped.pricingCooldownHours})
  if(ownPrice&&(!existing?.ownPrice||!existing.ownPrice.eq(ownPrice)))await prisma.ownPriceHistory.create({data:{companyId,productId:product.id,recordedAt:new Date(),price:ownPrice,currency:product.currency}})
  await syncMarket(companyId,product.id,mapped,ownPrice,text(mapped.currency)??product.currency)
  const sourceUpdatedAt=text(mapped.sourceUpdatedAt), parsedDate=sourceUpdatedAt&&!Number.isNaN(Date.parse(sourceUpdatedAt))?new Date(sourceUpdatedAt):null
  await prisma.productFeedLink.upsert({where:{companyId_feedSourceId_externalKey:{companyId,feedSourceId,externalKey:articleNumber}},update:{productId:product.id,sourceUpdatedAt:parsedDate,lastSeenAt:new Date()},create:{companyId,feedSourceId,productId:product.id,externalKey:articleNumber,sourceUpdatedAt:parsedDate,lastSeenAt:new Date()}})
  await prisma.feedItem.create({data:{companyId,feedSourceId,externalKey:articleNumber,rowIndex,rawData:raw as Prisma.InputJsonValue,mappedData:mapped as Prisma.InputJsonValue,status:'IMPORTED',importedProductId:product.id}})
}
async function processRows(companyId:string,feedSourceId:string,rows:Array<{raw:Record<string,unknown>;mapped:CanonicalFeedProduct}>){
  const ids=[...new Set(rows.map((x)=>text(x.mapped.articleNumber)).filter((x):x is string=>Boolean(x)))]; const existing=ids.length?await prisma.product.findMany({where:{companyId,articleNumber:{in:ids}},select:{articleNumber:true}}):[]; const delta=ids.length-new Set(existing.map((x)=>x.articleNumber)).size; if(delta>0)await assertCompanyCapacity(companyId,'skus',delta)
  await prisma.feedItem.deleteMany({where:{companyId,feedSourceId}}); let imported=0,errors=0; const errorMessages:string[]=[]
  for(const [index,item] of rows.entries()){try{await importProduct(companyId,feedSourceId,index+1,item.raw,item.mapped);imported++}catch(error){errors++;const message=error instanceof Error?error.message:'Onbekende importfout';if(errorMessages.length<20)errorMessages.push(`Rij ${index+1}: ${message}`);await prisma.feedItem.create({data:{companyId,feedSourceId,externalKey:text(item.mapped.articleNumber),rowIndex:index+1,rawData:item.raw as Prisma.InputJsonValue,mappedData:item.mapped as Prisma.InputJsonValue,status:'ERROR',errorMessage:message}})}}
  return {imported,errors,errorMessages}
}
async function start(companyId:string,feedSourceId:string){await prisma.feedSource.update({where:{id:feedSourceId},data:{lastRunStatus:FeedSyncStatus.RUNNING,syncError:null}});return prisma.feedSyncRun.create({data:{companyId,feedSourceId,status:FeedSyncStatus.RUNNING}})}
async function complete(feedSourceId:string,runId:string,result:{itemCount:number;errors:number;message?:string}){const now=new Date();await prisma.feedSource.update({where:{id:feedSourceId},data:{lastRunAt:now,lastRunStatus:FeedSyncStatus.COMPLETED,lastItemCount:result.itemCount,lastErrorCount:result.errors,lastWarningCount:0,syncError:null}});await prisma.feedSyncRun.update({where:{id:runId},data:{status:FeedSyncStatus.COMPLETED,completedAt:now,itemCount:result.itemCount,errorCount:result.errors,warningCount:0,message:result.message}})}
async function fail(feedSourceId:string,runId:string,error:unknown){const message=error instanceof Error?error.message:'Onbekende synchronisatiefout',now=new Date();await prisma.feedSource.update({where:{id:feedSourceId},data:{lastRunAt:now,lastRunStatus:FeedSyncStatus.FAILED,syncError:message}});await prisma.feedSyncRun.update({where:{id:runId},data:{status:FeedSyncStatus.FAILED,completedAt:now,message}});return message}
function parsedRows(parsed:ParsedFeed,mappings:Mapping[]){return parsed.rows.map((row)=>({raw:row as Record<string,unknown>,mapped:mapRow(row,mappings)}))}

export async function syncFeedSource(feedSourceId:string){
  const source=await prisma.feedSource.findUnique({where:{id:feedSourceId}}); if(!source)throw new Error('Feedbron niet gevonden.'); if(!source.url)throw new Error('Deze feedbron heeft geen URL.')
  const run=await start(source.companyId,feedSourceId)
  try{const parsed=await fetchAndParseFeed(source.url),mappings=inferMappings(parsed.headers,parsed.rows[0]??{});await saveMappings(source.companyId,feedSourceId,mappings);const rows=parsedRows(parsed,mappings).map((x)=>({raw:x.raw,mapped:{...x.mapped,countryCode:x.mapped.countryCode??(source.countryCode!=='GLOBAL'?source.countryCode:undefined)}}));const processed=await processRows(source.companyId,feedSourceId,rows);await prisma.feedSource.update({where:{id:feedSourceId},data:{format:parsed.format as FeedFormat,isActive:true}});await complete(feedSourceId,run.id,{itemCount:parsed.rows.length,errors:processed.errors,message:`${processed.imported} producten bijgewerkt.`});return{rows:parsed.rows.length,columns:parsed.headers.length,format:parsed.format,...processed}}catch(error){throw new Error(await fail(feedSourceId,run.id,error))}
}

export async function ingestCanonicalProducts(input:{companyId?:string;sourceKey:string;sourceName:string;sourceType?:FeedSourceType;countryCode?:string;products:CanonicalFeedProduct[];config?:Prisma.InputJsonValue}){
  const companyId=input.companyId??DEFAULT_COMPANY_ID
  const source=await prisma.feedSource.upsert({where:{companyId_sourceKey:{companyId,sourceKey:input.sourceKey}},update:{name:input.sourceName,sourceType:input.sourceType??FeedSourceType.API,countryCode:input.countryCode??'GLOBAL',isActive:true,config:input.config},create:{companyId,sourceKey:input.sourceKey,name:input.sourceName,sourceType:input.sourceType??FeedSourceType.API,format:FeedFormat.API,countryCode:input.countryCode??'GLOBAL',isActive:true,config:input.config}})
  const run=await start(companyId,source.id)
  try{const products=input.products.map((p)=>({...p,countryCode:p.countryCode??(input.countryCode&&input.countryCode!=='GLOBAL'?input.countryCode:undefined)}));const headers=[...new Set(products.flatMap((x)=>Object.keys(x)))];await saveMappings(companyId,source.id,headers.map((sourceColumn)=>({sourceColumn,targetField:sourceColumn,sampleValue:text(products[0]?.[sourceColumn])??''})));const processed=await processRows(companyId,source.id,products.map((p)=>({raw:{...p},mapped:p})));await complete(source.id,run.id,{itemCount:products.length,errors:processed.errors,message:`${processed.imported} producten via API bijgewerkt.`});return{feedSourceId:source.id,rows:products.length,...processed}}catch(error){throw new Error(await fail(source.id,run.id,error))}
}
