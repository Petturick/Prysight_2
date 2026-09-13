create table if not exists public.price_change_requests (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  country_id text null references public.countries(id) on delete restrict,
  pricing_rule_id text null references public.pricing_rules(id) on delete set null,
  external_sku_snapshot text not null,
  currency text not null default 'EUR',
  current_price numeric not null,
  recommended_price numeric not null,
  approved_price numeric null,
  cost_price numeric null,
  margin_before_pct numeric null,
  margin_after_pct numeric null,
  status text not null default 'PENDING',
  reason text,
  snapshot jsonb not null default '{}'::jsonb,
  requested_by text null references public.users(id) on delete set null,
  approved_by text null references public.users(id) on delete set null,
  approved_at timestamp without time zone null,
  applied_at timestamp without time zone null,
  rolled_back_at timestamp without time zone null,
  external_reference text null,
  previous_external_price numeric null,
  verified_external_price numeric null,
  error_message text null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint price_change_requests_status_check check (status in ('PENDING','APPROVED','REJECTED','APPLYING','APPLIED','FAILED','ROLLED_BACK')),
  constraint price_change_requests_prices_check check (current_price > 0 and recommended_price > 0 and (approved_price is null or approved_price > 0))
);

create index if not exists price_change_requests_company_status_created_idx on public.price_change_requests(company_id, status, created_at desc);
create index if not exists price_change_requests_product_country_idx on public.price_change_requests(product_id, country_id, created_at desc);
create index if not exists price_change_requests_requested_by_idx on public.price_change_requests(requested_by);
create index if not exists price_change_requests_approved_by_idx on public.price_change_requests(approved_by);
create index if not exists price_change_requests_rule_idx on public.price_change_requests(pricing_rule_id);
create unique index if not exists price_change_requests_one_open_idx on public.price_change_requests(company_id, product_id, coalesce(country_id, '')) where status in ('PENDING','APPROVED','APPLYING');

alter table public.price_change_requests enable row level security;
comment on table public.price_change_requests is 'Auditbare goedkeuringsworkflow voor prijsadviezen voordat een externe writeback wordt uitgevoerd.';
