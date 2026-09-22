-- Missing shipping remains NULL; zero is reserved for confirmed free shipping.
alter table public.products
  add column if not exists own_shipping_cost numeric(18,4),
  add column if not exists own_shipping_vat_included boolean;
alter table public.product_markets
  add column if not exists vat_included boolean,
  add column if not exists own_shipping_cost numeric(18,4),
  add column if not exists own_shipping_vat_included boolean;
alter table public.products
  add constraint products_own_shipping_nonnegative check (own_shipping_cost is null or own_shipping_cost >= 0);
alter table public.product_markets
  add constraint product_markets_own_shipping_nonnegative check (own_shipping_cost is null or own_shipping_cost >= 0);
comment on column public.product_markets.vat_included is 'NULL means inherit legacy product VAT basis; new updates always save a market-specific basis.';
comment on column public.products.own_shipping_cost is 'NULL means delivery charges unknown, 0 means confirmed free shipping.';
comment on column public.product_markets.own_shipping_cost is 'NULL means market shipping charges unknown, 0 means confirmed free shipping.';
