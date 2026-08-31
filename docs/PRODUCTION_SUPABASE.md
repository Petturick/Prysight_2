# PricingTool productie, Supabase en feeds

## Productiedatabase

PricingTool gebruikt Supabase project `xmedaatjwxkmwkjmwuuz` in regio `eu-west-2`.

De browser publishable key is geen databasewachtwoord. Prisma draait server-side en gebruikt daarom de Supavisor PostgreSQL pooler.

Voor Bolt gebruikt PricingTool eigen secretnamen, omdat Bolt custom secretnamen met de prefix `SUPABASE_` reserveert.

Aanbevolen Bolt runtime variabelen:

```env
PRICING_DB_PROJECT_ID=xmedaatjwxkmwkjmwuuz
PRICING_DB_REGION=eu-west-2
PRICING_DB_PASSWORD=<secret>
NEXT_PUBLIC_SUPABASE_URL=https://xmedaatjwxkmwkjmwuuz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

`PRICING_DB_PROJECT_ID` plus `PRICING_DB_PASSWORD` heeft in de applicatie voorrang op een oudere `DATABASE_URL`. De oudere `SUPABASE_PROJECT_ID`, `SUPABASE_DB_REGION` en `SUPABASE_DB_PASSWORD` namen blijven als backwards-compatible fallback ondersteund voor GitHub Actions en andere runtimes.

## GitHub production environment

De workflow `.github/workflows/supabase-production.yml` gebruikt GitHub environment `production`.

Voeg in GitHub onder repository Settings, Environments, production minimaal deze secrets toe:

`SUPABASE_ACCESS_TOKEN`

`SUPABASE_DB_PASSWORD`

GitHub environment secrets worden uitsluitend aan GitHub Actions jobs doorgegeven die environment `production` gebruiken. Ze worden niet automatisch runtime variabelen in Bolt of een andere hostingomgeving.

## Bolt runtime

Voeg in Bolt minimaal toe:

`PRICING_DB_PROJECT_ID=xmedaatjwxkmwkjmwuuz`

`PRICING_DB_REGION=eu-west-2`

`PRICING_DB_PASSWORD=<database password>`

`NEXTAUTH_SECRET=<random secret van minimaal 32 tekens>`

`NEXTAUTH_URL=https://pricingtool.bolt.host`

Voeg voor automatisering naar behoefte ook toe:

`PRICE_MONITOR_API_KEY`

`DATA_FEED_API_KEY`

`REPORT_API_KEY`

`ALERT_WEBHOOK_URL`

`REPORT_WEBHOOK_URL`

## Feedbeheer

De Feeds omgeving bestaat uit:

`/feeds`, Feedbeheer

`/feeds/map`, bronfeeds beheren

`/feeds/data`, kolommen, mapping en geïmporteerde regels

`/feeds/publicaties`, uitgaande JSON en CSV feeds

`/feeds/diagnose`, brongezondheid en synchronisatieruns

Externe feed URLs ondersteunen CSV, JSON, XML, XLSX, XLS en openbare Google Drive bestanden. Een sitemap, robots.txt, localhost en private netwerkadressen worden geweigerd.

Geïmporteerde producten worden direct geüpsert in `products` en zijn daarna zichtbaar onder `/producten`. De bronrelatie wordt vastgelegd in `product_feed_links`.

## Syntrx PIM

PricingTool ontvangt Engels Group productdata via:

`POST /api/integraties/syntrx`

De koppeling gebruikt de bestaande Syntrx gebruikerssessie als Bearer token. PricingTool valideert de sessie tegen Syntrx en controleert of de gebruiker binnen Engels Group een bevoegde rol heeft of platform super admin is. Er wordt dus geen gedeelde onbeveiligde synchronisatiesleutel in de browser opgeslagen.

Syntrx project: `cieqifmizthutfvfgfny`

Engels Group organization: `4cd85d1b-f834-4e68-b26d-1eae649b4c1f`
