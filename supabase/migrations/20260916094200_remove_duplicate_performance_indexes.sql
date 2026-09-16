-- Keep production index definitions lean and aligned with the Prisma generated indexes.
-- These five idx_* indexes are exact duplicates of existing canonical indexes.

drop index if exists public.idx_company_memberships_user_active;
drop index if exists public.idx_competitors_company_active;
drop index if exists public.idx_feed_sources_company_active;
drop index if exists public.idx_product_matches_company_status;
drop index if exists public.idx_products_company_active;
