export const IMPORT_TARGET_FIELDS = [
  { key: 'articleNumber', label: 'Artikelnummer' },
  { key: 'ean', label: 'EAN' },
  { key: 'productName', label: 'Productnaam' },
  { key: 'productGroup', label: 'Productgroep' },
  { key: 'country', label: 'Land' },
  { key: 'webshop', label: 'Webshop' },
  { key: 'engelsUrl', label: 'Engels URL' },
  { key: 'ownPrice', label: 'Eigen prijs' },
  { key: 'ownStock', label: 'Eigen voorraad' },
  { key: 'competitorName', label: 'Concurrentnaam' },
  { key: 'competitorUrl', label: 'Concurrent URL' },
  { key: 'competitorPrice', label: 'Concurrentieprijs' },
  { key: 'currency', label: 'Valuta' },
  { key: 'competitorStock', label: 'Voorraad concurrent' },
  { key: 'lastChecked', label: 'Laatste controle' },
  { key: 'packagingUnit', label: 'Verpakkingseenheid' },
  { key: 'packagingQty', label: 'Aantal per verpakking' },
] as const

export const FEED_TARGET_FIELDS = [
  { key: 'articleNumber', label: 'Artikelnummer / SKU' },
  { key: 'ean', label: 'EAN' },
  { key: 'gtin', label: 'GTIN' },
  { key: 'name', label: 'Productnaam' },
  { key: 'description', label: 'Omschrijving' },
  { key: 'productGroup', label: 'Productgroep' },
  { key: 'ownPrice', label: 'Eigen prijs' },
  { key: 'currency', label: 'Valuta' },
  { key: 'stockStatus', label: 'Voorraadstatus' },
  { key: 'packagingUnit', label: 'Verpakkingseenheid' },
  { key: 'packagingQty', label: 'Aantal per verpakking' },
  { key: 'isActive', label: 'Actief' },
  { key: 'sourceUpdatedAt', label: 'Laatste bronupdate' },
  { key: 'countryCode', label: 'Land / markt' },
  { key: 'ownUrl', label: 'Product URL' },
] as const

const FIELD_ALIASES: Record<string, string[]> = {
  articleNumber: ['articlenumber','article_number','artikelnummer','artikel_nummer','artikel','sku','sku_code','skucode','productsku','product_sku','itemnumber','item_number','itemno','productcode','product_code','productid','product_id','merchantproductid','merchant_product_id','sku_new','sku_old','nieuweartikelnummer','artikelnummernieuw'],
  ean: ['ean','ean13','ean_code','eancode','barcode','barcode13'],
  gtin: ['gtin','gtin13','gtin14','globaltradeitemnumber','globaltraditemnumber'],
  productName: ['productname','product_name','producttitle','product_title','title','naam','productnaam','titel'],
  name: ['productname','product_name','producttitle','product_title','title','naam','productnaam','titel'],
  description: ['description','productdescription','product_description','omschrijving','productomschrijving'],
  productGroup: ['productgroup','product_group','productgroep','category','category1','category_1','categorie','hoofdcategorie','maincategory'],
  country: ['country','countrycode','country_code','land','landcode','land_code','market','markt','storeview','store_view'],
  countryCode: ['country','countrycode','country_code','land','landcode','land_code','market','markt','storeview','store_view'],
  webshop: ['webshop','shop','store','storeview','store_view','website'],
  engelsUrl: ['engelsurl','engels_url','ownurl','own_url','producturl','product_url','productlink','product_link','deeplink','deep_link'],
  ownUrl: ['url','producturl','product_url','productlink','product_link','deeplink','deep_link','engelsurl','engels_url','webshopurl','webshop_url'],
  ownPrice: ['ownprice','own_price','price','salesprice','sales_price','sellingprice','verkoopprijs','prijs','brutoprijs','eigenprijs'],
  ownStock: ['ownstock','own_stock','stockstatus','stock_status','availability','availabilitystatus','voorraadstatus','voorraad','stock','inventory'],
  stockStatus: ['stockstatus','stock_status','availability','availabilitystatus','voorraadstatus','voorraad','stock','inventory'],
  competitorName: ['competitor','competitorname','competitor_name','concurrent','concurrentnaam','aanbieder','retailer'],
  competitorUrl: ['competitorurl','competitor_url','concurrenturl','concurrent_url','offerurl','offer_url','listingurl','listing_url'],
  competitorPrice: ['competitorprice','competitor_price','concurrentprice','concurrent_price','concurrentieprijs','marktprijs'],
  currency: ['currency','currencycode','currency_code','valuta','curr'],
  competitorStock: ['competitorstock','competitor_stock','concurrentstock','concurrent_stock','voorraadconcurrent','beschikbaarheidconcurrent'],
  lastChecked: ['lastchecked','last_checked','checkedat','checked_at','laatstecontrole','controle','meettijdstip','timestamp'],
  packagingUnit: ['packagingunit','packaging_unit','unit','eenheid','verpakkingseenheid','salesunit','sales_unit'],
  packagingQty: ['packagingqty','packaging_qty','quantityperpack','quantity_per_pack','packqty','aantalperverpakking','packsize','pack_size'],
  isActive: ['isactive','is_active','active','enabled','status','published'],
  sourceUpdatedAt: ['updatedat','updated_at','lastmodified','last_modified','modifiedat','modified_at','laatstgewijzigd','laatsteupdate'],
}

export function normalizeHeader(value: string) {
  return value.toLocaleLowerCase('nl-NL').replace(/[^a-z0-9]+/g, '')
}

function scoreAlias(normalized: string, alias: string) {
  const candidate = normalizeHeader(alias)
  if (!candidate) return 0
  if (candidate === normalized) return 100
  if (candidate.length >= 5 && (normalized.startsWith(candidate) || normalized.endsWith(candidate))) return 70
  if (candidate.length >= 6 && normalized.includes(candidate)) return 55
  return 0
}

export function inferHeaderTarget<T extends string>(header: string, allowedTargets: readonly T[]): T | '' {
  const normalized = normalizeHeader(header)
  let best: { key: T; score: number } | null = null
  for (const key of allowedTargets) {
    for (const alias of FIELD_ALIASES[key] ?? []) {
      const score = scoreAlias(normalized, alias)
      if (score > (best?.score ?? 0)) best = { key, score }
    }
  }
  return best?.key ?? ''
}

export function inferImportMapping(headers: string[]) {
  const allowed = IMPORT_TARGET_FIELDS.map((field) => field.key)
  const mapping = Object.fromEntries(allowed.map((key) => [key, ''])) as Record<string, string>
  for (const header of headers) {
    const target = inferHeaderTarget(header, allowed)
    if (!target || mapping[target]) continue
    mapping[target] = header
  }
  return mapping
}
