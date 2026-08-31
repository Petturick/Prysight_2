# Prysight implementatieplan

Versie, 25 augustus 2026

## Hard Truth

Prysight heeft een serieus fundament voor prijsmonitoring, historie, productmatching, alerts, feeds, rapportages en prijsadvies. Het is geen simpele dashboarddemo meer.

Prysight is nog geen veilig commercieel SaaS product. De twee grootste ontbrekende schakels zijn een gesloten pricing cyclus en aantoonbare tenant isolatie. Bedrijven kunnen pas zelfstandig worden aangemaakt wanneer iedere query, mutatie, achtergrondtaak en export aan de actieve company is gekoppeld. Alleen een `company_id` kolom toevoegen is geen multi company architectuur.

De licentiebasis en Stripe Billing integratielaag kunnen nu al worden voorbereid, maar definitieve Stripe producten en prijzen mogen pas worden aangemaakt wanneer plannamen, bedragen, limieten, proefperiode en fiscale inrichting zijn goedgekeurd. Anders wordt tijdelijke productlogica onnodig een financieel contract.

### Huidige technische status

| Onderdeel | Status | Betekenis |
| --- | --- | --- |
| Pricing kern | Aanwezig | Monitoring, matching, historie, alerts, feeds en advies bestaan |
| Multi company datamodel | Voorbereid | Companies, memberships, landen en tenant sleutels zijn toegevoegd |
| Licentiemodel | Voorbereid | Limieten voor gebruikers, landen, concurrenten, SKU's en checks bestaan |
| Limietcontrole | Voorbereid | Imports en belangrijke beheeracties controleren capaciteit |
| Stripe Billing code | Voorbereid | Checkout, Customer Portal, webhookverwerking en prijsafbeelding bestaan |
| Stripe producten en prijzen | Bewust nog leeg | Definitieve commerciële keuzes ontbreken |
| Company onboarding scherm | Nog niet gebouwd | Eerst tenant isolatie en authenticatie herstellen |
| Competitor upload | Gespecificeerd | Bouw volgt na company context en rollen |
| Volledige tenant isolatie | Nog niet bewezen | Alle bestaande queries moeten nog worden omgezet en getest |
| Gesloten pricing cyclus | Nog niet compleet | Kostprijs, margegrenzen, goedkeuring, writeback en rollback ontbreken |

### Kritieke repositorybevinding

De meest recente wijziging op `main` verwijderde eerder toegepaste database migraties en authenticatiebestanden. De ontbrekende migratiehistorie is in de voorbereidende branch hersteld. Authenticatie en actieve company selectie moeten vóór company onboarding opnieuw als expliciete productgrens worden ingevoerd. Zonder dat mechanisme kunnen rollen en licenties niet betrouwbaar worden afgedwongen.

## High Leverage Actions

### 1, Maak tenant isolatie de eerste releasevoorwaarde

Iedere operationele tabel krijgt één verplichte `company_id`. Prysight bepaalt per request eerst de ingelogde gebruiker, daarna het actieve lidmaatschap en pas daarna de toegestane company.

De verplichte volgorde wordt,

1. gebruiker authenticeren,

2. actief company lidmaatschap controleren,

3. rol en licentiestatus controleren,

4. alle databasequeries met `company_id` uitvoeren,

5. handeling in de auditlog vastleggen.

Een super admin mag tussen companies wisselen, een normale gebruiker ziet uitsluitend companies waarvoor een actief lidmaatschap bestaat. Een company id uit een formulier, URL of request body is nooit zelfstandig betrouwbaar.

Acceptatiecriteria,

1. een gebruiker van company A kan geen record van company B lezen, wijzigen, verwijderen, exporteren of via een achtergrondtaak verwerken,

2. alle API routes, server actions, paginaqueries, imports, feeds, rapporten en geplande taken zijn company scoped,

3. tests bewijzen isolatie met twee companies en overlappende artikelnummers, concurrentnamen en landen,

4. ontbrekende company context veroorzaakt een harde fout en nooit een globale query.

### 2, Maak companies zoals OnboardTool en Syntrx, zonder hun zwakke plekken te kopiëren

Het company beheer krijgt vier niveaus,

| Niveau | Rechten |
| --- | --- |
| Platform super admin | Companies, plannen, licenties en supporttoegang beheren |
| Company owner | Facturatie, gebruikers, landen en company instellingen beheren |
| Company admin | Gebruikers, landen, concurrenten, imports en monitoring beheren |
| Analyst en readonly | Pricingwerk uitvoeren of uitsluitend resultaten bekijken |

De company wizard bevat,

1. bedrijfsnaam, slug, facturatie e mail, valuta en tijdzone,

2. keuze van licentieplan of handmatige interne licentie,

3. landen activeren, met één standaardland,

4. eerste owner uitnodigen,

5. productfeed of handmatige SKU import koppelen,

6. concurrenten importeren,

7. validatiepagina met gebruik, limieten en ontbrekende configuratie.

Company verwijderen wordt standaard archiveren. Definitief verwijderen wordt een afzonderlijke bewaakte beheerhandeling met retentiebeleid, exportmogelijkheid en auditregistratie.

### 3, Maak licenties de enige bron voor capaciteit

Het licentieplan definieert de standaardlimieten. De company licentie kan per company een expliciete override bevatten. `null` betekent onbeperkt, `0` betekent niet beschikbaar.

| Resource | Definitie voor verbruik | Controlepunt |
| --- | --- | --- |
| Gebruikers | Actieve company memberships | Uitnodigen, activeren en overzetten |
| Landen | Actieve company countries | Land activeren en import valideren |
| Concurrenten | Actieve unieke concurrenten binnen de company | Handmatig aanmaken en competitor import |
| SKU's | Actieve unieke producten binnen de company | Productfeed, API en bestandimport |
| Checks per dag | Niet importgerelateerde prijschecks sinds start UTC dag | Scheduler en handmatige check |

Een limiet wordt vóór de mutatie gecontroleerd. Bulkimport controleert het totale aantal nieuwe unieke records voordat de eerste rij wordt geschreven. Gelijktijdige imports moeten met een database lock of reservering worden beschermd, zodat twee processen samen niet boven de limiet uitkomen.

Licentiestatussen worden als volgt behandeld,

| Status | Toegang |
| --- | --- |
| Trialing en active | Volledige toegang binnen limieten |
| Past due | Tijdelijke toegang tijdens betaalherstel, met duidelijke waarschuwing |
| Canceled | Toegang tot het betaalde periode einde |
| Paused, unpaid en expired | Mutaties blokkeren, data blijft volgens beleid leesbaar en exporteerbaar |

### 4, Bouw competitor upload als twee gescheiden imports

Een concurrent is een organisatie of webshopconfiguratie. Een competitor offer is een concrete product URL of aanbieding. Die aantallen mogen niet worden vermengd.

Import A, concurrentenbestand,

| Kolom | Verplicht | Voorbeeld | Regel |
| --- | --- | --- | --- |
| `competitor_name` | Ja | Rotomshop | Uniek per company en land |
| `website` | Ja | `https://www.rotomshop.nl` | Alleen geldige HTTPS bron |
| `country_code` | Ja | NL | Moet actief zijn voor de company |
| `check_frequency_hours` | Nee | 24 | Binnen platformgrenzen |
| `is_active` | Nee | true | Standaard actief |
| `notes` | Nee | Belangrijkste concurrent | Geen geheimen of credentials |

Import B, productmatches en offer URL's,

| Kolom | Verplicht | Voorbeeld | Regel |
| --- | --- | --- | --- |
| `article_number` | Ja | ENG 100100 | Moet binnen dezelfde company bestaan |
| `competitor_name` | Ja | Rotomshop | Moet binnen dezelfde company bestaan |
| `country_code` | Ja | NL | Bepaalt de markt |
| `product_url` | Ja | Volledige product URL | Uniek per concurrent en company |
| `match_status` | Nee | REVIEW | Standaard controle vereist |
| `packaging_unit` | Nee | stuks | Voor normalisatie |
| `packaging_qty` | Nee | 1 | Positief geheel getal |

De uploadflow bestaat uit bestand kiezen, kolommen mappen, voorcontrole, foutpreview, limietcontrole, bevestiging, importresultaat en auditlog. De import is herhaalbaar zonder duplicaten en levert een downloadbaar foutenbestand op.

### 5, Activeer Stripe pas na commerciële besluitvorming

De voorbereide Stripe architectuur gebruikt,

1. één Stripe Product per commercieel plan,

2. afzonderlijke maand en jaar Prices per plan,

3. hosted Stripe Checkout voor nieuwe abonnementen,

4. Stripe Customer Portal voor betaalmethode, facturen en opzegging,

5. ondertekende en idempotente webhooks als bron voor abonnementsstatus,

6. volledig gescheiden test en live mappings,

7. Prysight als bron voor producttoegang en limietcontrole.

Stripe bepaalt wat er is betaald. Prysight vertaalt dat via een interne planmapping naar rechten en limieten. Een Stripe Price id wordt nooit direct verspreid door businesslogica.

Benodigde keuzes vóór Stripe configuratie,

| Besluit | Nog vast te leggen |
| --- | --- |
| Plannen | Namen, positionering en zichtbaarheid |
| Prijzen | Maandbedrag, jaarbedrag, valuta en korting |
| Limieten | Gebruikers, landen, concurrenten, SKU's en checks per dag |
| Trial | Geen trial of aantal dagen |
| Past due beleid | Herstelperiode en blokkademoment |
| Enterprise | Self service, offerte of handmatig contract |
| Belasting | Registraties, vestigingsland en Stripe Tax inrichting |

Stripe Tax wordt niet geactiveerd voordat belastingregistraties, hoofdvestiging en productbelastingcode zijn bevestigd. De Prysight sandbox is de enige omgeving voor de eerste product en prijsconfiguratie. De live account blijft ongewijzigd totdat test Checkout, webhookverwerking, Customer Portal en reconciliatie zijn goedgekeurd.

### 6, Sluit daarna de pricing cyclus

Per product zijn minimaal nodig, kostprijs, landed cost, minimale brutomarge, minimumprijs, maximumprijs, adviesprijs, eventuele MAP prijs en afrondingsregels.

De workflow wordt,

1. data ontvangen,

2. match controleren,

3. markt normaliseren,

4. advies berekenen,

5. commerciële guardrails controleren,

6. effect simuleren,

7. goedkeuren,

8. publiceren,

9. live resultaat terugcontroleren,

10. auditlog en rollback bewaren.

Er komen drie modi, advies, goedkeuring en automatisch. Automatisch is uitsluitend toegestaan voor vooraf goedgekeurde strategieën binnen marge en prijsgrenzen.

### 7, Professionaliseer monitoring en integraties

De dataverzameling krijgt browser rendering voor toegestane bronnen, winkelspecifieke extractors, retries, wachtrijen, rate limiting, confidence scores, bronfreshness en foutpercentages per webshop.

Syntrx blijft bij voorkeur de centrale integratielaag,

1. ERP of PIM naar Prysight, product, kostprijs, voorraad, land en huidige prijs,

2. Prysight, concurrentiedata, strategie, guardrails en advies,

3. Prysight naar Syntrx of webshop, goedgekeurde prijs,

4. externe bron naar Prysight, bevestiging van de live prijs.

Geen uitgevoerde prijschecks wordt een harde operationele fout. De productieomgeving toont freshness, jobstatus, webhookfouten en licentieproblemen.

## Framework or Mental Model

Prysight bestaat uit tien opeenvolgende lagen.

| Laag | Vraag |
| --- | --- |
| 1, Identify | Voor welke company en gebruiker wordt gewerkt |
| 2, Entitle | Mag deze company deze functie en capaciteit gebruiken |
| 3, Observe | Wat gebeurt er werkelijk in de markt |
| 4, Verify | Is dit hetzelfde product, dezelfde variant en markt |
| 5, Normalize | Zijn btw, valuta, verpakking, promotie en voorraad vergelijkbaar |
| 6, Understand | Wat is de marktpositie en waar ligt commerciële ruimte |
| 7, Decide | Welke prijs past bij de strategie |
| 8, Protect | Voldoet de prijs aan kostprijs, marge en prijsgrenzen |
| 9, Execute | Wordt de prijs gecontroleerd gepubliceerd en teruggelezen |
| 10, Learn | Wat was het effect op marge, omzet, conversie en marktpositie |

Multi company en licenties zijn dus geen los beheermenu. Ze staan vóór iedere pricinghandeling en bepalen welke data en capaciteit beschikbaar zijn.

## Uitvoeringsvolgorde

| Fase | Resultaat | Vrijgavevoorwaarde |
| --- | --- | --- |
| 0, Stabilisatie | Migratiehistorie, authenticatie en deploymentbasis herstellen | CI groen, migraties reproduceerbaar, login actief |
| 1, Tenant boundary | Actieve company context en volledige queryscoping | Isolatietests met twee companies slagen |
| 2, Company beheer | Wizard, rollen, landen, gebruikers en licentieoverzicht | Geen mutatie kan een limiet omzeilen |
| 3, Imports | Competitor import en offer match import | Preview, idempotentie, foutenbestand en auditlog werken |
| 4, Billing | Sandbox producten, Prices, Checkout, Portal en webhooks | End to end abonnementsproef en reconciliatie slagen |
| 5, Pricing safety | Kostprijs, marge, guardrails en goedkeuring | Eén product doorloopt de volledige veilige cyclus |
| 6, Monitoring | Schaalbare verzameling en operationele health | Uitval en verouderde data geven direct alarm |
| 7, Writeback | Syntrx of webshop publicatie, verificatie en rollback | Geen prijswijziging zonder bewijs en herstelpad |
| 8, SaaS launch | Live billing, support, retentie en SLA | Security, privacy, belasting en operations goedgekeurd |

## Database en Billing fundament

De voorbereidende implementatie bevat,

| Component | Doel |
| --- | --- |
| `companies` | Tenant en facturatieprofiel |
| `company_memberships` | Gebruiker, company en rol |
| `company_countries` | Gelicentieerde en actieve markten |
| `license_plans` | Standaardlimieten en featureconfiguratie |
| `company_licenses` | Actuele rechten, overrides en abonnementsstatus |
| `stripe_price_mappings` | Test en live Stripe Price naar intern plan |
| `stripe_customers` | Stripe Customer per company en omgeving |
| `billing_webhook_events` | Idempotentie, foutregistratie en auditspoor |
| Tenant sleutels | Company scope op alle pricing, feed en rapportagetabellen |

Er is een niet publiek intern plan zonder harde limieten voor de bestaande Engels Group data. Dit voorkomt dat de huidige omgeving door een nog niet vastgesteld commercieel plan wordt geblokkeerd.

## Challenge

Bouw nu nog geen openbaar company onboarding scherm en maak nog geen live Stripe prijzen. Bewijs eerst tenant isolatie met twee companies en sluit daarna één complete onboarding in de sandbox af, company aanmaken, owner activeren, landen kiezen, SKU's importeren, concurrenten uploaden, limieten afdwingen, Checkout afronden en abonnementsstatus via webhook terugzien.

De beslissende test is,

Kan company A honderd echte producten en concurrenten een week zelfstandig laten monitoren, zonder één record van company B te kunnen zien, zonder licentielimieten te omzeilen en zonder dat billing of monitoring stil kan falen.

Als het antwoord nee is, is Prysight nog niet klaar voor externe companies.
