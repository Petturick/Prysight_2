create extension if not exists pgcrypto;

do $$ begin create type "UserRole" as enum ('ADMIN','ANALYST','READONLY'); exception when duplicate_object then null; end $$;
do $$ begin create type "MatchStatus" as enum ('CERTAIN','REVIEW','UNRELIABLE'); exception when duplicate_object then null; end $$;
do $$ begin create type "AlertSeverity" as enum ('INFO','WARNING','CRITICAL'); exception when duplicate_object then null; end $$;
do $$ begin create type "ImportFormat" as enum ('CSV','XLSX'); exception when duplicate_object then null; end $$;
do $$ begin create type "ImportStatus" as enum ('PENDING','PROCESSING','DONE','FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type "ReportStatus" as enum ('PENDING','GENERATED','FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type "FeedSourceType" as enum ('FILE','URL','API','SYNTRX'); exception when duplicate_object then null; end $$;
do $$ begin create type "FeedFormat" as enum ('CSV','XLSX','XLS','JSON','XML','API'); exception when duplicate_object then null; end $$;
do $$ begin create type "FeedSyncStatus" as enum ('IDLE','RUNNING','COMPLETED','FAILED'); exception when duplicate_object then null; end $$;

create table if not exists public.users (
  id text primary key, email text not null unique, name text not null, password_hash text not null, role "UserRole" not null,
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp
);

create table if not exists public.countries (
  id text primary key, code text not null unique, name text not null, vat_rate numeric(8,4) not null, currency text not null,
  is_active boolean not null default true, created_at timestamp(3) not null default current_timestamp
);

create table if not exists public.product_groups (
  id text primary key, name text not null unique, description text, is_active boolean not null default true,
  created_at timestamp(3) not null default current_timestamp
);

create table if not exists public.competitors (
  id text primary key, name text not null, website text not null, country_id text not null references public.countries(id) on delete restrict,
  is_active boolean not null default true, check_frequency_hours integer not null default 24, last_checked_at timestamp(3),
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp,
  unique(name, country_id)
);

create table if not exists public.webshops (
  id text primary key, name text not null, url text not null, country_id text not null references public.countries(id) on delete restrict,
  competitor_id text references public.competitors(id) on delete set null, is_active boolean not null default true,
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp,
  unique(name, country_id)
);

create table if not exists public.products (
  id text primary key, article_number text not null unique, ean text, gtin text, name text not null,
  product_group_id text not null references public.product_groups(id) on delete restrict, own_price numeric(18,4),
  vat_included boolean not null default true, packaging_unit text, packaging_qty integer not null default 1,
  currency text not null default 'EUR', stock_status text, is_active boolean not null default true, notes text,
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp
);

create table if not exists public.competitor_offers (
  id text primary key, competitor_id text not null references public.competitors(id) on delete restrict, product_match_id text,
  url text not null, raw_price numeric(18,4), normalized_price numeric(18,4), currency text not null default 'EUR',
  vat_included boolean not null default true, packaging_unit text, packaging_qty integer, stock_status text, last_checked_at timestamp(3),
  is_active boolean not null default true, created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp
);
create index if not exists competitor_offers_product_match_id_idx on public.competitor_offers(product_match_id);

create table if not exists public.product_matches (
  id text primary key, product_id text not null references public.products(id) on delete restrict,
  competitor_offer_id text not null unique references public.competitor_offers(id) on delete restrict,
  confidence_score integer not null, match_status "MatchStatus" not null, match_evidence jsonb not null default '{}'::jsonb,
  approved_by text references public.users(id) on delete set null, approved_at timestamp(3),
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp
);
create index if not exists product_matches_match_status_idx on public.product_matches(match_status);

do $$ begin
  alter table public.competitor_offers add constraint competitor_offers_product_match_id_fkey foreign key (product_match_id) references public.product_matches(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.price_checks (
  id text primary key, competitor_offer_id text not null references public.competitor_offers(id) on delete cascade, checked_at timestamp(3) not null,
  found_price numeric(18,4), currency text not null, stock_status text, product_title text, packaging_unit text, check_method text not null,
  status_code integer, error_message text, source_url text not null, is_success boolean not null default true,
  created_at timestamp(3) not null default current_timestamp
);
create index if not exists price_checks_checked_at_idx on public.price_checks(checked_at);

create table if not exists public.price_history (
  id text primary key, competitor_offer_id text not null references public.competitor_offers(id) on delete cascade,
  recorded_at timestamp(3) not null, price numeric(18,4) not null, normalized_price numeric(18,4), currency text not null,
  stock_status text, source text not null, created_at timestamp(3) not null default current_timestamp
);
create index if not exists price_history_recorded_at_idx on public.price_history(recorded_at);

create table if not exists public.own_price_history (
  id text primary key, product_id text not null references public.products(id) on delete cascade, recorded_at timestamp(3) not null,
  price numeric(18,4) not null, currency text not null, created_at timestamp(3) not null default current_timestamp
);
create index if not exists own_price_history_recorded_at_idx on public.own_price_history(recorded_at);

create table if not exists public.alerts (
  id text primary key, type text not null, product_id text references public.products(id) on delete set null,
  competitor_offer_id text references public.competitor_offers(id) on delete set null, title text not null, message text not null,
  severity "AlertSeverity" not null, is_read boolean not null default false, created_at timestamp(3) not null default current_timestamp
);
create index if not exists alerts_severity_idx on public.alerts(severity);

create table if not exists public.alert_rules (
  id text primary key, type text not null, threshold numeric(18,4), is_active boolean not null default true,
  country_id text references public.countries(id) on delete set null, product_group_id text references public.product_groups(id) on delete set null,
  competitor_id text references public.competitors(id) on delete set null, created_at timestamp(3) not null default current_timestamp,
  updated_at timestamp(3) not null default current_timestamp
);

create table if not exists public.import_tasks (
  id text primary key, filename text not null, format "ImportFormat" not null, status "ImportStatus" not null default 'PENDING',
  total_rows integer, processed_rows integer, error_rows integer, errors jsonb, warnings jsonb,
  imported_by text not null references public.users(id) on delete restrict, created_at timestamp(3) not null default current_timestamp,
  updated_at timestamp(3) not null default current_timestamp
);

create table if not exists public.reports (
  id text primary key, title text not null, week_start timestamp(3) not null, week_end timestamp(3) not null,
  status "ReportStatus" not null default 'PENDING', content jsonb, generated_at timestamp(3), created_at timestamp(3) not null default current_timestamp
);

create table if not exists public.audit_logs (
  id text primary key, user_id text not null references public.users(id) on delete restrict, action text not null, entity_type text not null,
  entity_id text not null, old_value jsonb, new_value jsonb, ip_address text not null, created_at timestamp(3) not null default current_timestamp
);

create table if not exists public.feed_sources (
  id text primary key, source_key text not null unique, name text not null, source_type "FeedSourceType" not null, format "FeedFormat",
  url text, country_code text not null default 'GLOBAL', is_active boolean not null default true, is_main_feed boolean not null default true,
  sync_frequency_hours integer not null default 24, last_run_at timestamp(3), last_run_status "FeedSyncStatus" not null default 'IDLE',
  last_item_count integer not null default 0, last_error_count integer not null default 0, last_warning_count integer not null default 0,
  sync_error text, config jsonb, created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp
);

create table if not exists public.feed_column_mappings (
  id text primary key, feed_source_id text not null references public.feed_sources(id) on delete cascade, source_column text not null,
  target_field text, data_type text, sample_value text, is_active boolean not null default true, position integer not null default 0,
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp,
  unique(feed_source_id, source_column)
);

create table if not exists public.feed_items (
  id text primary key, feed_source_id text not null references public.feed_sources(id) on delete cascade, external_key text,
  row_index integer not null, raw_data jsonb not null, mapped_data jsonb, status text not null default 'READY', error_message text,
  imported_product_id text, created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp,
  unique(feed_source_id, row_index)
);
create index if not exists feed_items_external_key_idx on public.feed_items(feed_source_id, external_key);

create table if not exists public.feed_sync_runs (
  id text primary key, feed_source_id text not null references public.feed_sources(id) on delete cascade,
  status "FeedSyncStatus" not null, started_at timestamp(3) not null default current_timestamp, completed_at timestamp(3),
  item_count integer not null default 0, error_count integer not null default 0, warning_count integer not null default 0,
  message text, details jsonb, created_at timestamp(3) not null default current_timestamp
);
create index if not exists feed_sync_runs_started_at_idx on public.feed_sync_runs(started_at);

create table if not exists public.product_feed_links (
  id text primary key, feed_source_id text not null references public.feed_sources(id) on delete cascade, product_id text not null,
  external_key text not null, source_updated_at timestamp(3), last_seen_at timestamp(3) not null default current_timestamp,
  created_at timestamp(3) not null default current_timestamp, updated_at timestamp(3) not null default current_timestamp,
  unique(feed_source_id, external_key), unique(feed_source_id, product_id)
);
create index if not exists product_feed_links_product_id_idx on public.product_feed_links(product_id);

insert into public.users (id,email,name,password_hash,role,created_at,updated_at)
values ('system_pricing','system@pricing.local','Pricing System','!','ADMIN',current_timestamp,current_timestamp)
on conflict (email) do nothing;

insert into public.countries (id,code,name,vat_rate,currency,is_active) values
('country_nl','NL','Nederland',21,'EUR',true), ('country_be','BE','België',21,'EUR',true),
('country_fr','FR','Frankrijk',20,'EUR',true), ('country_de','DE','Duitsland',19,'EUR',true),
('country_pt','PT','Portugal',23,'EUR',true), ('country_gb','GB','Verenigd Koninkrijk',20,'GBP',true),
('country_es','ES','Spanje',21,'EUR',true), ('country_dk','DK','Denemarken',25,'DKK',true)
on conflict (code) do nothing;

insert into public.product_groups (id,name,description,is_active) values
('pg_unknown','Onbekend','Automatisch gebruikt wanneer een bron geen productgroep bevat.',true),
('pg_bins','Kunststof bakken','Prijsmonitoring kunststof bakken.',true),
('pg_pallets','Pallets','Prijsmonitoring pallets.',true),
('pg_palletboxes','Palletboxen','Prijsmonitoring palletboxen.',true),
('pg_waste','Afvalcontainers','Prijsmonitoring afvalcontainers.',true),
('pg_spill','Lekbakken','Prijsmonitoring lekbakken.',true),
('pg_racking','Stellingen','Prijsmonitoring stellingen.',true),
('pg_cases','Transportkoffers','Prijsmonitoring transportkoffers.',true),
('pg_exocase','EXOcase','Prijsmonitoring EXOcase.',true),
('pg_smartcase','Smartcase','Prijsmonitoring Smartcase.',true),
('pg_flightcases','Flightcases','Prijsmonitoring Flightcases.',true),
('pg_rackcases','Rack cases','Prijsmonitoring Rack cases.',true)
on conflict (name) do nothing;

alter table public.users enable row level security;
alter table public.countries enable row level security;
alter table public.product_groups enable row level security;
alter table public.competitors enable row level security;
alter table public.webshops enable row level security;
alter table public.products enable row level security;
alter table public.competitor_offers enable row level security;
alter table public.product_matches enable row level security;
alter table public.price_checks enable row level security;
alter table public.price_history enable row level security;
alter table public.own_price_history enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_rules enable row level security;
alter table public.import_tasks enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.feed_sources enable row level security;
alter table public.feed_column_mappings enable row level security;
alter table public.feed_items enable row level security;
alter table public.feed_sync_runs enable row level security;
alter table public.product_feed_links enable row level security;
