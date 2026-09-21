export type ImportMode = 'products' | 'competitors' | 'combined'

type TargetField = { key: string; label: string; modes?: readonly ImportMode[] }
const PRODUCT_MODES = ['products', 'combined'] as const
const COMPETITOR_MODES = ['competitors', 'combined'] as const
const ALL_MODES = ['products', 'competitors', 'combined'] as const

export const IMPORT_TARGET_FIELDS = [
  { key: 'articleNumber', label: 'Artikelnummer / SKU', modes: ALL_MODES },
  { key: 'ean', label: 'EAN', modes: PRODUCT_MODES },
  { key: 'gtin', label: 'GTIN', modes: PRODUCT_MODES },
  { key: 'mpn', label: 'MPN', modes: PRODUCT_MODES },
  { key: 'brand', label: 'Merk', modes: PRODUCT_MODES },
  { key: 'model', label: 'Model', modes: PRODUCT_MODES },
  { key: 'productName', label: 'Productnaam', modes: PRODUCT_MODES },
  { key: 'productGroup', label: 'Productgroep', modes: PRODUCT_MODES },
  { key: 'country', label: 'Land / markt', modes: ALL_MODES },
  { key: 'webshop', label: 'Webshop', modes: ['combined'] as const },
  { key: 'engelsUrl', label: 'Eigen product URL', modes: PRODUCT_MODES },
  { key: 'ownPrice', label: 'Eigen prijs', modes: PRODUCT_MODES },
  { key: 'vatIncluded', label: 'Prijs inclusief btw', modes: PRODUCT_MODES },
  { key: 'costPrice', label: 'Kostprijs', modes: PRODUCT_MODES },
  { key: 'minimumMarginPct', label: 'Minimale marge %', modes: PRODUCT_MODES },
  { key: 'targetMarginPct', label: 'Doelmarge %', modes: PRODUCT_MODES },
  { key: 'minimumPrice', label: 'Minimumprijs', modes: PRODUCT_MODES },
  { key: 'maximumPrice', label: 'Maximumprijs', modes: PRODUCT_MODES },
  { key: 'pricingMode', label: 'Pricingmodus', modes: PRODUCT_MODES },
  { key: 'pricingCooldownHours', label: 'Prijs-cooldown uren', modes: PRODUCT_MODES },
  { key: 'ownStock', label: 'Eigen voorraad', modes: PRODUCT_MODES },
  { key: 'competitorName', label: 'Concurrentnaam', modes: COMPETITOR_MODES },
  { key: 'competitorUrl', label: 'Concurrent URL', modes: COMPETITOR_MODES },
  { key: 'competitorPrice', label: 'Concurrentieprijs', modes: COMPETITOR_MODES },
  { key: 'currency', label: 'Valuta', modes: ALL_MODES },
  { key: 'competitorStock', label: 'Voorraad concurrent', modes: COMPETITOR_MODES },
  { key: 'lastChecked', label: 'Laatste controle', modes: COMPETITOR_MODES },
  { key: 'packagingUnit', label: 'Verpakkingseenheid', modes: ALL_MODES },
  { key: 'packagingQty', label: 'Aantal per verpakking', modes: ALL_MODES },
] as const satisfies readonly TargetField[]

export const FEED_TARGET_FIELDS = [
  { key: 'articleNumber', label: 'Artikelnummer / SKU' }, { key: 'ean', label: 'EAN' }, { key: 'gtin', label: 'GTIN' },
  { key: 'mpn', label: 'MPN' }, { key: 'brand', label: 'Merk' }, { key: 'model', label: 'Model' },
  { key: 'name', label: 'Productnaam' }, { key: 'description', label: 'Omschrijving' }, { key: 'productGroup', label: 'Productgroep' },
  { key: 'ownPrice', label: 'Eigen prijs' }, { key: 'vatIncluded', label: 'Prijs inclusief btw' }, { key: 'costPrice', label: 'Kostprijs' }, { key: 'minimumMarginPct', label: 'Minimale marge %' },
  { key: 'targetMarginPct', label: 'Doelmarge %' }, { key: 'minimumPrice', label: 'Minimumprijs' }, { key: 'maximumPrice', label: 'Maximumprijs' },
  { key: 'pricingMode', label: 'Pricingmodus' }, { key: 'pricingCooldownHours', label: 'Prijs-cooldown uren' },
  { key: 'currency', label: 'Valuta' }, { key: 'stockStatus', label: 'Voorraadstatus' }, { key: 'packagingUnit', label: 'Verpakkingseenheid' },
  { key: 'packagingQty', label: 'Aantal per verpakking' }, { key: 'isActive', label: 'Actief' }, { key: 'sourceUpdatedAt', label: 'Laatste bronupdate' },
  { key: 'countryCode', label: 'Land / markt' }, { key: 'ownUrl', label: 'Product URL' },
] as const

export const FIELD_ALIASES: Record<string, string[]> = {
  articleNumber: ['articlenumber','article_number','artikelnummer','artikel_nummer','artikel','sku','sku_code','skucode','productsku','product_sku','itemnumber','item_number','itemno','productcode','product_code','productid','product_id','merchantproductid','merchant_product_id','sku_new','sku_old','nieuweartikelnummer','artikelnummernieuw'],
  ean: ['ean','ean13','ean_code','eancode','barcode','barcode13'], gtin: ['gtin','gtin13','gtin14','globaltradeitemnumber','globaltraditemnumber'],
  mpn: ['mpn','manufacturerpartnumber','manufacturer_part_number','partnumber','part_number','fabrikantnummer'], brand: ['brand','brandname','merk','merknaam','manufacturer','fabrikant'], model: ['model','modelnumber','model_number','modelno','modelnummer'],
  productName: ['productname','product_name','producttitle','product_title','title','naam','productnaam','titel'], name: ['productname','product_name','producttitle','product_title','title','naam','productnaam','titel'],
  description: ['description','productdescription','product_description','omschrijving','productomschrijving'], productGroup: ['productgroup','product_group','productgroep','category','category1','category_1','categorie','hoofdcategorie','maincategory'],
  country: ['country','countrycode','country_code','land','landcode','land_code','market','markt','storeview','store_view'], countryCode: ['country','countrycode','country_code','land','landcode','land_code','market','markt','storeview','store_view'],
  webshop: ['webshop','shop','store','storeview','store_view','website'], engelsUrl: ['engelsurl','engels_url','ownurl','own_url','producturl','product_url','productlink','product_link','deeplink','deep_link'], ownUrl: ['url','producturl','product_url','productlink','product_link','deeplink','deep_link','engelsurl','engels_url','webshopurl','webshop_url'],
  ownPrice: ['ownprice','own_price','price','salesprice','sales_price','sellingprice','verkoopprijs','prijs','brutoprijs','eigenprijs'], vatIncluded: ['vatincluded','vat_included','btwinbegrepen','btw_inbegrepen','inclusiefbtw','inclbtw','priceincludesvat','price_includes_vat','taxincluded','tax_included'], costPrice: ['costprice','cost_price','cost','inkoopprijs','kostprijs','purchaseprice','purchase_price'],
  minimumMarginPct: ['minimummarginpct','minimum_margin_pct','minmargin','min_margin','minimumbrutomarge','minimummarge'], targetMarginPct: ['targetmarginpct','target_margin_pct','targetmargin','target_margin','doelmarge'],
  minimumPrice: ['minimumprice','minimum_price','minprice','min_price','minimumverkoopprijs'], maximumPrice: ['maximumprice','maximum_price','maxprice','max_price','maximumverkoopprijs'],
  pricingMode: ['pricingmode','pricing_mode','repricingmode','repricing_mode','prijsmode','prijsmodus'], pricingCooldownHours: ['pricingcooldownhours','pricing_cooldown_hours','cooldownhours','cooldown_hours','repricingfrequency','prijsinterval'],
  ownStock: ['ownstock','own_stock','stockstatus','stock_status','availability','availabilitystatus','voorraadstatus','voorraad','stock','inventory'], stockStatus: ['stockstatus','stock_status','availability','availabilitystatus','voorraadstatus','voorraad','stock','inventory'],
  competitorName: ['competitor','competitorname','competitor_name','concurrent','concurrentnaam','aanbieder','retailer'], competitorUrl: ['competitorurl','competitor_url','concurrenturl','concurrent_url','offerurl','offer_url','listingurl','listing_url'], competitorPrice: ['competitorprice','competitor_price','concurrentprice','concurrent_price','concurrentieprijs','marktprijs'],
  currency: ['currency','currencycode','currency_code','valuta','curr'], competitorStock: ['competitorstock','competitor_stock','concurrentstock','concurrent_stock','voorraadconcurrent','beschikbaarheidconcurrent'], lastChecked: ['lastchecked','last_checked','checkedat','checked_at','laatstecontrole','controle','meettijdstip','timestamp'],
  packagingUnit: ['packagingunit','packaging_unit','unit','eenheid','verpakkingseenheid','salesunit','sales_unit'], packagingQty: ['packagingqty','packaging_qty','quantityperpack','quantity_per_pack','packqty','aantalperverpakking','packsize','pack_size'],
  isActive: ['isactive','is_active','active','enabled','status','published'], sourceUpdatedAt: ['updatedat','updated_at','lastmodified','last_modified','modifiedat','modified_at','laatstgewijzigd','laatsteupdate'],
}

export function normalizeHeader(value: string) { return value.toLocaleLowerCase('nl-NL').replace(/[^a-z0-9]+/g, '') }
function scoreAlias(normalized: string, alias: string) { const candidate = normalizeHeader(alias); if (!candidate) return 0; if (candidate === normalized) return 100; if (candidate.length >= 5 && (normalized.startsWith(candidate) || normalized.endsWith(candidate))) return 70; if (candidate.length >= 6 && normalized.includes(candidate)) return 55; return 0 }
export function inferHeaderTarget<T extends string>(header: string, allowedTargets: readonly T[]): T | '' { const normalized = normalizeHeader(header); let best: { key: T; score: number } | null = null; for (const key of allowedTargets) for (const alias of FIELD_ALIASES[key] ?? []) { const score = scoreAlias(normalized, alias); if (score > (best?.score ?? 0)) best = { key, score } } return best?.key ?? '' }
export function inferMapping(headers: string[], allowed: readonly string[]) { const mapping = Object.fromEntries(allowed.map((key) => [key, ''])) as Record<string,string>; for (const header of headers) { const target = inferHeaderTarget(header, allowed); if (target && !mapping[target]) mapping[target] = header } return mapping }
export function inferImportMapping(headers: string[]) { return inferMapping(headers, IMPORT_TARGET_FIELDS.map((field) => field.key)) }
export function inferFeedMapping(headers: string[]) { return inferMapping(headers, FEED_TARGET_FIELDS.map((field) => field.key)) }
export function importFieldsForMode(mode: ImportMode) { return IMPORT_TARGET_FIELDS.filter((field) => (field.modes ?? ALL_MODES).includes(mode)) }
