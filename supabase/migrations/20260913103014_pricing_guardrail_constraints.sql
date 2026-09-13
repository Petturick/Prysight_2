alter table public.products
  add constraint products_cost_price_check check (cost_price is null or cost_price >= 0),
  add constraint products_minimum_margin_check check (minimum_margin_pct is null or (minimum_margin_pct >= 0 and minimum_margin_pct < 100)),
  add constraint products_target_margin_check check (target_margin_pct is null or (target_margin_pct >= 0 and target_margin_pct < 100)),
  add constraint products_price_bounds_check check (minimum_price is null or maximum_price is null or minimum_price <= maximum_price),
  add constraint products_price_rounding_check check (price_rounding_mode in ('CENT','WHOLE','END_95','END_99'));

comment on column public.products.cost_price is 'Netto kostprijs exclusief btw voor margeguardrails.';
comment on column public.products.minimum_margin_pct is 'Harde minimale brutomarge in procenten.';
comment on table public.pricing_rules is 'Tenantgebonden prijsregels per organisatie, land, productgroep of product. Productguardrails blijven altijd leidend.';
