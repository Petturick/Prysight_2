create index if not exists product_settings_product_id_idx on public.product_settings(product_id);
create index if not exists product_settings_product_group_id_idx on public.product_settings(product_group_id);
create index if not exists price_change_requests_country_id_idx on public.price_change_requests(country_id);
