-- Applied to the Prysight Supabase project on 25 August 2026.
begin;

do $$ begin create type "CompanyStatus" as enum ('ACTIVE','SUSPENDED','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type "CompanyMemberRole" as enum ('OWNER','ADMIN','ANALYST','READONLY'); exception when duplicate_object then null; end $$;
do $$ begin create type "LicenseSource" as enum ('MANUAL','STRIPE'); exception when duplicate_object then null; end $$;
do $$ begin create type "LicenseStatus" as enum ('INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELED','EXPIRED','UNPAID'); exception when duplicate_object then null; end $$;
do $$ begin create type "BillingEnvironment" as enum ('TEST','LIVE'); exception when duplicate_object then null; end $$;
do $$ begin create type "BillingInterval" as enum ('MONTH','YEAR'); exception when duplicate_object then null; end $$;

create table if not exists public.companies (
  id text primary key,
  name text not null,
  slug text not null unique,
  status "CompanyStatus" not null default 'ACTIVE',
  billing_email text,
  default_currency text not null default 'EUR',
  timezone text not null default 'Europe/Amsterdam',
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp
);

create table if not exists public.license_plans (
  id text primary key,
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_public boolean not null default false,
  max_users integer,
  max_countries integer,
  max_competitors integer,
  max_skus integer,
  max_checks_per_day integer,
  features jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint license_plans_max_users_check check (max_users is null or max_users >= 0),
  constraint license_plans_max_countries_check check (max_countries is null or max_countries >= 0),
  constraint license_plans_max_competitors_check check (max_competitors is null or max_competitors >= 0),
  constraint license_plans_max_skus_check check (max_skus is null or max_skus >= 0),
  constraint license_plans_max_checks_per_day_check check (max_checks_per_day is null or max_checks_per_day >= 0)
);

create table if not exists public.company_memberships (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  role "CompanyMemberRole" not null,
  is_active boolean not null default true,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint company_memberships_company_id_user_id_key unique (company_id, user_id)
);

create table if not exists public.company_countries (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  country_id text not null references public.countries(id) on delete restrict,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint company_countries_company_id_country_id_key unique (company_id, country_id)
);

create table if not exists public.company_licenses (
  id text primary key,
  company_id text not null unique references public.companies(id) on delete cascade,
  plan_id text not null references public.license_plans(id) on delete restrict,
  source "LicenseSource" not null default 'MANUAL',
  status "LicenseStatus" not null default 'ACTIVE',
  override_max_users integer,
  override_max_countries integer,
  override_max_competitors integer,
  override_max_skus integer,
  override_max_checks_per_day integer,
  stripe_environment "BillingEnvironment",
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_start timestamp without time zone,
  current_period_end timestamp without time zone,
  trial_ends_at timestamp without time zone,
  cancel_at_period_end boolean not null default false,
  manually_granted_until timestamp without time zone,
  last_stripe_event_at timestamp without time zone,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint company_licenses_override_max_users_check check (override_max_users is null or override_max_users >= 0),
  constraint company_licenses_override_max_countries_check check (override_max_countries is null or override_max_countries >= 0),
  constraint company_licenses_override_max_competitors_check check (override_max_competitors is null or override_max_competitors >= 0),
  constraint company_licenses_override_max_skus_check check (override_max_skus is null or override_max_skus >= 0),
  constraint company_licenses_override_max_checks_per_day_check check (override_max_checks_per_day is null or override_max_checks_per_day >= 0)
);

create table if not exists public.stripe_price_mappings (
  id text primary key,
  plan_id text not null references public.license_plans(id) on delete cascade,
  environment "BillingEnvironment" not null,
  interval "BillingInterval" not null,
  stripe_account_id text not null,
  stripe_product_id text not null,
  stripe_price_id text not null unique,
  currency text not null default 'EUR',
  is_active boolean not null default true,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint stripe_price_mappings_plan_environment_interval_currency_key unique (plan_id, environment, interval, currency)
);

create table if not exists public.stripe_customers (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  environment "BillingEnvironment" not null,
  stripe_account_id text not null,
  stripe_customer_id text not null unique,
  created_at timestamp without time zone not null default current_timestamp,
  updated_at timestamp without time zone not null default current_timestamp,
  constraint stripe_customers_company_id_environment_key unique (company_id, environment)
);

create table if not exists public.billing_webhook_events (
  id text primary key,
  stripe_event_id text not null unique,
  environment "BillingEnvironment" not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'PENDING',
  error_message text,
  processed_at timestamp without time zone,
  created_at timestamp without time zone not null default current_timestamp
);

insert into public.companies (id, name, slug, status)
values ('cmp_engels_group', 'Engels Group', 'engels-group', 'ACTIVE')
on conflict (id) do nothing;

insert into public.license_plans (id, code, name, description, is_active, is_public, features)
values (
  'plan_internal',
  'internal',
  'Internal',
  'Niet publiek intern plan zonder harde limieten, alleen voor bestaande interne toegang.',
  true,
  false,
  '{"pricingAdvice":true,"approvals":true,"feeds":true,"reports":true}'::jsonb
)
on conflict (id) do nothing;

insert into public.company_licenses (id, company_id, plan_id, source, status)
values ('license_engels_group', 'cmp_engels_group', 'plan_internal', 'MANUAL', 'ACTIVE')
on conflict (company_id) do nothing;

insert into public.company_memberships (id, company_id, user_id, role, is_active)
select
  'membership_' || md5('cmp_engels_group:' || users.id),
  'cmp_engels_group',
  users.id,
  case
    when users.is_super_admin then 'OWNER'::"CompanyMemberRole"
    when users.role = 'ADMIN' then 'ADMIN'::"CompanyMemberRole"
    when users.role = 'ANALYST' then 'ANALYST'::"CompanyMemberRole"
    else 'READONLY'::"CompanyMemberRole"
  end,
  true
from public.users
on conflict (company_id, user_id) do nothing;

insert into public.company_countries (id, company_id, country_id, is_default, is_active)
select
  'company_country_' || md5('cmp_engels_group:' || countries.id),
  'cmp_engels_group',
  countries.id,
  countries.code = 'NL',
  countries.is_active
from public.countries
on conflict (company_id, country_id) do nothing;

alter table public.webshops add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.product_groups add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.products add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.competitors add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.competitor_offers add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.product_matches add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.price_checks add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.price_history add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.own_price_history add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.product_markets add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.alerts add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.alert_rules add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.import_tasks add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.reports add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.audit_logs add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.feed_sources add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.feed_column_mappings add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.feed_items add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.feed_sync_runs add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;
alter table public.product_feed_links add column if not exists company_id text not null default 'cmp_engels_group' references public.companies(id) on delete cascade;

alter table public.product_groups drop constraint if exists product_groups_name_key;
alter table public.products drop constraint if exists products_article_number_key;
alter table public.competitors drop constraint if exists competitors_name_country_id_key;
alter table public.webshops drop constraint if exists webshops_name_country_id_key;
alter table public.feed_sources drop constraint if exists feed_sources_source_key_key;
alter table public.product_markets drop constraint if exists product_markets_product_id_country_id_key;
drop index if exists public.competitor_offers_competitor_id_url_key;
alter table public.feed_column_mappings drop constraint if exists feed_column_mappings_feed_source_id_source_column_key;
alter table public.feed_items drop constraint if exists feed_items_feed_source_id_row_index_key;
alter table public.product_feed_links drop constraint if exists product_feed_links_feed_source_id_external_key_key;
alter table public.product_feed_links drop constraint if exists product_feed_links_feed_source_id_product_id_key;

create unique index if not exists product_groups_company_id_name_key on public.product_groups (company_id, name);
create unique index if not exists products_company_id_article_number_key on public.products (company_id, article_number);
create unique index if not exists competitors_company_id_name_country_id_key on public.competitors (company_id, name, country_id);
create unique index if not exists webshops_company_id_name_country_id_key on public.webshops (company_id, name, country_id);
create unique index if not exists feed_sources_company_id_source_key_key on public.feed_sources (company_id, source_key);
create unique index if not exists product_markets_company_id_product_id_country_id_key on public.product_markets (company_id, product_id, country_id);
create unique index if not exists competitor_offers_company_id_competitor_id_url_key on public.competitor_offers (company_id, competitor_id, url);
create unique index if not exists feed_column_mappings_company_id_feed_source_id_source_column_key on public.feed_column_mappings (company_id, feed_source_id, source_column);
create unique index if not exists feed_items_company_id_feed_source_id_row_index_key on public.feed_items (company_id, feed_source_id, row_index);
create unique index if not exists product_feed_links_company_id_feed_source_id_external_key_key on public.product_feed_links (company_id, feed_source_id, external_key);
create unique index if not exists product_feed_links_company_id_feed_source_id_product_id_key on public.product_feed_links (company_id, feed_source_id, product_id);

create index if not exists company_memberships_user_id_is_active_idx on public.company_memberships (user_id, is_active);
create index if not exists company_countries_country_id_is_active_idx on public.company_countries (country_id, is_active);
create index if not exists company_licenses_status_idx on public.company_licenses (status);
create index if not exists stripe_price_mappings_stripe_product_id_idx on public.stripe_price_mappings (stripe_product_id);
create index if not exists billing_webhook_events_status_created_at_idx on public.billing_webhook_events (status, created_at);
create index if not exists webshops_company_id_is_active_idx on public.webshops (company_id, is_active);
create index if not exists product_groups_company_id_is_active_idx on public.product_groups (company_id, is_active);
create index if not exists products_company_id_is_active_idx on public.products (company_id, is_active);
create index if not exists competitors_company_id_is_active_idx on public.competitors (company_id, is_active);
create index if not exists competitor_offers_company_id_is_active_idx on public.competitor_offers (company_id, is_active);
create index if not exists product_matches_company_id_match_status_idx on public.product_matches (company_id, match_status);
create index if not exists price_checks_company_id_checked_at_idx on public.price_checks (company_id, checked_at);
create index if not exists price_history_company_id_recorded_at_idx on public.price_history (company_id, recorded_at);
create index if not exists own_price_history_company_id_recorded_at_idx on public.own_price_history (company_id, recorded_at);
create index if not exists product_markets_company_id_country_id_is_active_idx on public.product_markets (company_id, country_id, is_active);
create index if not exists alerts_company_id_is_read_created_at_idx on public.alerts (company_id, is_read, created_at);
create index if not exists alert_rules_company_id_is_active_idx on public.alert_rules (company_id, is_active);
create index if not exists import_tasks_company_id_created_at_idx on public.import_tasks (company_id, created_at);
create index if not exists reports_company_id_created_at_idx on public.reports (company_id, created_at);
create index if not exists audit_logs_company_id_created_at_idx on public.audit_logs (company_id, created_at);
create index if not exists feed_sources_company_id_is_active_idx on public.feed_sources (company_id, is_active);
create index if not exists feed_column_mappings_company_id_idx on public.feed_column_mappings (company_id);
create index if not exists feed_items_company_id_status_idx on public.feed_items (company_id, status);
create index if not exists feed_sync_runs_company_id_started_at_idx on public.feed_sync_runs (company_id, started_at);
create index if not exists product_feed_links_company_id_idx on public.product_feed_links (company_id);

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.company_countries enable row level security;
alter table public.license_plans enable row level security;
alter table public.company_licenses enable row level security;
alter table public.stripe_price_mappings enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.billing_webhook_events enable row level security;

comment on table public.companies is 'Prysight tenants. Every monitored data row is scoped to one company.';
comment on table public.company_licenses is 'Authoritative Prysight entitlement state. Stripe is the billing source, Prysight enforces access.';
comment on table public.stripe_price_mappings is 'Environment-specific Stripe Price mapping for internal license plans.';
comment on column public.license_plans.max_users is 'Null means unlimited. Zero means the resource is unavailable.';

commit;
