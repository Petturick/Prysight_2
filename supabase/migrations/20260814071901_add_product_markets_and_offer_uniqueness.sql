create table if not exists public.product_markets (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  country_id text not null references public.countries(id) on delete restrict,
  own_price numeric,
  currency text not null,
  own_url text,
  stock_status text,
  is_active boolean not null default true,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint product_markets_product_id_country_id_key unique (product_id, country_id)
);

create index if not exists product_markets_country_id_is_active_idx
  on public.product_markets (country_id, is_active);

create unique index if not exists competitor_offers_competitor_id_url_key
  on public.competitor_offers (competitor_id, url);

comment on table public.product_markets is
  'Country-specific availability, own price, stock and storefront URL for a monitored product.';

alter table public.product_markets enable row level security;
