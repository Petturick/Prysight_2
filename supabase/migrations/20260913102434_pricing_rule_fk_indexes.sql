create index if not exists pricing_rules_country_id_idx on public.pricing_rules(country_id);
create index if not exists pricing_rules_product_group_id_idx on public.pricing_rules(product_group_id);
create index if not exists pricing_rules_product_id_idx on public.pricing_rules(product_id);
