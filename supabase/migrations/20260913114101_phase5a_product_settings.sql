create table if not exists public.product_settings (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  product_id text null references public.products(id) on delete cascade,
  product_group_id text null references public.product_groups(id) on delete cascade,
  mode text not null default 'ADVISE',
  cooldown_hours integer not null default 24,
  is_active boolean not null default true,
  updated_at timestamp without time zone not null default now()
);