-- Query indexes for the hot PrySight pricing paths.
-- These support the nested latest-price and latest-check lookups used on dashboard and product pages.

create index if not exists price_history_offer_recorded_idx
  on public.price_history (competitor_offer_id, recorded_at desc);

create index if not exists price_checks_offer_checked_idx
  on public.price_checks (competitor_offer_id, checked_at desc);

create index if not exists product_matches_company_product_idx
  on public.product_matches (company_id, product_id);

create index if not exists competitor_offers_company_competitor_active_idx
  on public.competitor_offers (company_id, competitor_id, is_active);

create index if not exists product_markets_company_product_active_idx
  on public.product_markets (company_id, product_id, is_active);

create index if not exists product_feed_links_company_product_idx
  on public.product_feed_links (company_id, product_id);
