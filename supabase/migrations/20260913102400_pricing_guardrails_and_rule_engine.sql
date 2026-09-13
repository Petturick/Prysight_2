drop policy if exists anon_select_companies on public.companies;
drop policy if exists anon_insert_companies on public.companies;
drop policy if exists anon_update_companies on public.companies;
drop policy if exists anon_delete_companies on public.companies;
drop policy if exists anon_select_license_plans on public.license_plans;
drop policy if exists anon_insert_license_plans on public.license_plans;
drop policy if exists anon_update_license_plans on public.license_plans;
drop policy if exists anon_delete_license_plans on public.license_plans;

alter table public.products
  add column if not exists cost_price numeric null,
  add column if not exists minimum_margin_pct numeric null,
  add column if not exists minimum_price numeric null,
  add column if not exists maximum_price numeric null,
  add column if not exists target_margin_pct numeric null,
  add column if not exists price_rounding_mode text not null default 'CENT';

create table if not exists public.pricing_rules (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  country_id text null references public.countries(id) on delete cascade,
  product_group_id text null references public.product_groups(id) on delete cascade,
  product_id text null references public.products(id) on delete cascade,
  strategy text not null default 'MARKET_MEDIAN',
  adjustment_pct numeric not null default 0,
  max_change_pct numeric not null default 5,
  minimum_signal_pct numeric not null default 1,
  only_in_stock boolean not null default true,
  minimum_competitors integer not null default 2,
  minimum_margin_pct numeric null,
  minimum_price numeric null,
  maximum_price numeric null,
  rounding_mode text not null default 'CENT',
  require_approval boolean not null default true,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint pricing_rules_strategy_check check (strategy in ('LOWEST_MATCH','LOWEST_MINUS','SECOND_LOWEST','MARKET_MEDIAN','MARKET_AVERAGE')),
  constraint pricing_rules_rounding_check check (rounding_mode in ('CENT','WHOLE','END_95','END_99')),
  constraint pricing_rules_minimum_competitors_check check (minimum_competitors >= 1),
  constraint pricing_rules_max_change_check check (max_change_pct >= 0 and max_change_pct <= 100),
  constraint pricing_rules_minimum_signal_check check (minimum_signal_pct >= 0 and minimum_signal_pct <= 100),
  constraint pricing_rules_margin_check check (minimum_margin_pct is null or (minimum_margin_pct >= 0 and minimum_margin_pct < 100)),
  constraint pricing_rules_price_bounds_check check (minimum_price is null or maximum_price is null or minimum_price <= maximum_price)
);

create index if not exists pricing_rules_company_active_idx on public.pricing_rules(company_id, is_active);
create index if not exists pricing_rules_scope_idx on public.pricing_rules(company_id, country_id, product_group_id, product_id, priority);

alter table public.pricing_rules enable row level security;
revoke all on table public.pricing_rules from anon, authenticated;
