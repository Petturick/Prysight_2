-- Shipping-cost intelligence for competitor offers and measurement history.
-- Nullable by design: shipping is only populated when the source exposes a trustworthy amount.

alter table public.competitor_offers
  add column if not exists shipping_cost numeric(18,4),
  add column if not exists normalized_shipping_cost numeric(18,4),
  add column if not exists delivered_price numeric(18,4),
  add column if not exists shipping_currency text,
  add column if not exists shipping_label text;

alter table public.price_checks
  add column if not exists shipping_cost numeric(18,4),
  add column if not exists normalized_shipping_cost numeric(18,4),
  add column if not exists delivered_price numeric(18,4),
  add column if not exists shipping_currency text,
  add column if not exists shipping_label text;

alter table public.price_history
  add column if not exists shipping_cost numeric(18,4),
  add column if not exists normalized_shipping_cost numeric(18,4),
  add column if not exists delivered_price numeric(18,4),
  add column if not exists shipping_currency text,
  add column if not exists shipping_label text;

comment on column public.competitor_offers.shipping_cost is 'Shipping amount as observed on the source page, including explicit zero for free shipping.';
comment on column public.competitor_offers.normalized_shipping_cost is 'Shipping amount normalized to the same EUR incl-VAT unit basis as normalized_price.';
comment on column public.competitor_offers.delivered_price is 'normalized_price plus normalized_shipping_cost when shipping is known.';
comment on column public.competitor_offers.shipping_label is 'Short source-derived shipping description, for example Gratis verzending or Verzendkosten niet vastgesteld.';
