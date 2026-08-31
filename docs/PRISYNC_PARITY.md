# PricingTool, Prisync parity foundation

Deze implementatie verplaatst PricingTool van een importgedreven dashboard naar een platform met eigen monitoring, alerts, productfeeds en prijsadvies.

## Wat nu in de applicatie zit

1. Automatische prijscontrole voor actieve, gematchte concurrentieaanbiedingen.
2. Respect voor robots.txt, timeouts en HTTP fouten, zonder blokkades of anti bot maatregelen te omzeilen.
3. Extractie in drie lagen, JSON LD, product meta data, gecontroleerde HTML fallback.
4. Opslag in PriceCheck en PriceHistory, waarbij een mislukte controle de laatste geldige prijs niet overschrijft.
5. Automatische alerts voor prijsbewegingen, prijsverschillen, prijsruimte en voorraadwijzigingen.
6. Optionele alert webhook voor externe workflows.
7. Verbeterde productmatching met identifiers, titeloverlap, afmetingen, modeltokens, verpakking en conflictpenalties.
8. Prijsadvies met vijf strategieën en een maximale prijswijziging per besluit.
9. Productfeed API voor ERP, PIM of Magento data.
10. GitHub Actions voor periodieke prijscontroles en wekelijkse rapportage.
11. Nieuwe interface met rustigere kaarten, dunne lijnen, zachte statuskleuren en compactere informatiedichtheid.

## Omgevingsvariabelen

PRICE_MONITOR_API_KEY, beveiligt POST /api/prijscontroles.

DATA_FEED_API_KEY, beveiligt POST /api/integraties/product-feed.

REPORT_API_KEY, beveiligt POST /api/rapportages.

ALERT_WEBHOOK_URL, optioneel, ontvangt nieuwe alerts als JSON.

REPORT_WEBHOOK_URL, optioneel, ontvangt metadata wanneer een weekrapport is gegenereerd.

## GitHub secrets

PRICING_TOOL_BASE_URL
PRICE_MONITOR_API_KEY
REPORT_API_KEY

## Belangrijke begrenzing

Dit is een eigen monitoring en pricing foundation, geen poging om blokkades van webshops te omzeilen. Websites die alleen na complexe browserinteractie renderen, een login vereisen, monitoring contractueel verbieden of automatische requests blokkeren hebben een expliciete bronintegratie, feed, API of toegestane browser service nodig.

Automatische writeback van verkoopprijzen is bewust nog uitgeschakeld. Voor productie zijn eerst kostprijs, minimale marge, minimum en maximum verkoopprijs, gebruikersbevoegdheden en goedkeuringsregels nodig. De huidige prijsstrategie is daarom een advies en simulatie engine.

## Volgende productiestap

1. Kostprijs en harde prijsgrenzen als productdata toevoegen.
2. Persistente PricingRule modellen toevoegen per land, productgroep en product.
3. Goedgekeurde Magento writeback integratie toevoegen.
4. Browser rendering toevoegen voor toegestane Javascript bronnen.
5. Marketplace feeds en seller normalisatie toevoegen.
6. Competitor discovery uitbreiden met geautoriseerde zoek of shopping databronnen.
7. Monitoring health per bron zichtbaar maken, inclusief foutpercentage en laatste succesvolle check.
