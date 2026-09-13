# PrySight production hardening

Dit project maakt PrySight stap voor stap geschikt als volwaardige B2B pricing intelligence en repricing applicatie.

## Fase 1, betrouwbare marktdata

1. Dynamische wisselkoersen met gecontroleerde fallback, basis toegevoegd en gekoppeld aan automatische prijsmetingen
2. Betere verpakkingseenheid detectie en prijs per eenheid, automatische herkenning toegevoegd voor gangbare verpakkingsaantallen
3. Verzendkosten en totaalprijs, nog te implementeren
4. Monitoring health, retries en bronstatus, geïmplementeerd
5. Browser rendering fallback voor toegestane JavaScript bronnen, optionele renderer koppeling toegevoegd

Voor browser rendering kunnen server side de variabelen `BROWSER_RENDERER_URL` en optioneel `BROWSER_RENDERER_TOKEN` worden ingesteld. Zonder deze configuratie blijft PrySight veilig op de normale HTTP extractie werken. De renderer wordt alleen gebruikt wanneer een toegestane pagina wel bereikbaar is maar de productprijs pas na JavaScript rendering beschikbaar komt.

## Fase 2, matching en discovery

1. Match confidence zichtbaar en afdwingbaar, harde EAN, maat en verpakkingsconflicten zijn aangescherpt
2. Review queue voor onzekere matches
3. EAN en GTIN discovery
4. Geautoriseerde competitor discovery
5. Marketplace en seller normalisatie

## Fase 3, pricing intelligence

1. Kostprijs, geïmplementeerd
2. Minimum marge, geïmplementeerd
3. Minimum en maximum verkoopprijs, geïmplementeerd
4. Persistente pricing rules per bedrijf, land, productgroep en product, geïmplementeerd
5. Guardrails en prijsafronding, geïmplementeerd
6. Advies met marge impact en gebruikte marktdata, geïmplementeerd

## Fase 4, gecontroleerde automatisering

1. Goedkeuringsworkflow, geïmplementeerd
2. Magento base price writeback, geïmplementeerd en standaard uit zolang tenantgebonden productiecredentials ontbreken
3. Verificatie na writeback, geïmplementeerd met preflight en terugleescontrole
4. Rollback, geïmplementeerd met bescherming tegen externe prijswijzigingen na publicatie
5. Volledige audit trail, geïmplementeerd voor aanvraag, goedkeuring, publicatie, fout en rollback
6. Gescheiden publicatierecht, geïmplementeerd via `pricing.publish`
7. Tenantbinding, Magento configuratie vereist expliciete `MAGENTO_COMPANY_ID` en `MAGENTO_CURRENCY`
8. Foutcompensatie, een externe write wordt bij lokale synchronisatiefouten waar veilig mogelijk teruggedraaid en retries kunnen een reeds bevestigde doelprijs reconciliëren

Benodigde runtimeconfiguratie voor echte Magento publicatie: `MAGENTO_BASE_URL`, `MAGENTO_ACCESS_TOKEN`, `MAGENTO_COMPANY_ID`, `MAGENTO_CURRENCY`, `MAGENTO_PRICES_INCLUDE_TAX` en optioneel `MAGENTO_STORE_CODE` en `MAGENTO_STORE_ID`.

## Fase 5, productierijp

1. End to end SaaS acceptatietest
2. Schaaltesten en observability
3. Security regressietests
4. Billing en licentie enforcement valideren
5. Live smoke test

## Definitie van klaar

Feed of API naar producten, discovery, matching, monitoring, normalisatie, historie, pricing rules, advies, goedkeuring, writeback en verificatie werken tenant veilig end to end op productie.
