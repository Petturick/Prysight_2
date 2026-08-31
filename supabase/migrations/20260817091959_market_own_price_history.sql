alter table public.own_price_history
  add column if not exists country_id text null;

alter table public.own_price_history
  drop constraint if exists own_price_history_country_id_fkey;

alter table public.own_price_history
  add constraint own_price_history_country_id_fkey
  foreign key (country_id) references public.countries(id)
  on update cascade on delete restrict;

create index if not exists own_price_history_country_id_idx
  on public.own_price_history (country_id);

create index if not exists own_price_history_product_country_recorded_idx
  on public.own_price_history (product_id, country_id, recorded_at desc);
