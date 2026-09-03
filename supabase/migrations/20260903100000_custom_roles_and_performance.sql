create table if not exists public.custom_roles (
  id text primary key default ('role_' || replace(gen_random_uuid()::text, '-', '')),
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

alter table public.company_memberships
  add column if not exists custom_role_id text references public.custom_roles(id) on delete set null;

create index if not exists idx_custom_roles_company_active on public.custom_roles(company_id, is_active);
create index if not exists idx_company_memberships_company_user_active on public.company_memberships(company_id, user_id, is_active);
create index if not exists idx_company_memberships_user_active on public.company_memberships(user_id, is_active);
create index if not exists idx_products_company_active on public.products(company_id, is_active);
create index if not exists idx_competitors_company_active on public.competitors(company_id, is_active);
create index if not exists idx_product_matches_company_status on public.product_matches(company_id, match_status);
create index if not exists idx_price_checks_company_checked on public.price_checks(company_id, checked_at desc);
create index if not exists idx_price_history_company_recorded on public.price_history(company_id, recorded_at desc);
create index if not exists idx_alerts_company_created on public.alerts(company_id, created_at desc);
create index if not exists idx_feed_sources_company_active on public.feed_sources(company_id, is_active);

comment on table public.custom_roles is 'Organisatiegebonden rollen met fijnmazige Prysight rechten.';
comment on column public.custom_roles.permissions is 'JSON array met permission keys zoals products.write en reports.read.';
