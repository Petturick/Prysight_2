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

1. Kostprijs
2. Minimum marge
3. Minimum en maximum verkoopprijs
4. Persistente pricing rules per bedrijf, land, productgroep en product
5. Guardrails en prijsafronding
6. Advies met marge impact en gebruikte marktdata

## Fase 4, gecontroleerde automatisering

1. Goedkeuringsworkflow
2. Magento writeback
3. Verificatie na writeback
4. Rollback
5. Volledige audit trail

## Fase 5, productierijp

1. End to end SaaS acceptatietest
2. Schaaltesten en observability
3. Security regressietests
4. Billing en licentie enforcement valideren
5. Live smoke test

## Definitie van klaar

Feed of API naar producten, discovery, matching, monitoring, normalisatie, historie, pricing rules, advies, goedkeuring, writeback en verificatie werken tenant veilig end to end op productie.
