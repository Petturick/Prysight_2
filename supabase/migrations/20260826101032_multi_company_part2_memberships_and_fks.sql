/*
# Multi-company Part 2 - Product markets + memberships + FK columns

Creates missing product_markets table, then adds company_id to all domain tables
and seeds membership/license data.
*/

-- 1. Create product_markets table (missing from earlier migrations)
CREATE TABLE IF NOT EXISTS product_markets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  country_id text NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  own_price numeric,
  currency text NOT NULL DEFAULT 'EUR',
  own_url text,
  stock_status text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_markets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_product_markets" ON product_markets;
CREATE POLICY "anon_select_product_markets" ON product_markets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_product_markets" ON product_markets;
CREATE POLICY "anon_insert_product_markets" ON product_markets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_product_markets" ON product_markets;
CREATE POLICY "anon_update_product_markets" ON product_markets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_product_markets" ON product_markets;
CREATE POLICY "anon_delete_product_markets" ON product_markets FOR DELETE TO anon, authenticated USING (true);

-- 2. Company memberships
CREATE TABLE IF NOT EXISTS company_memberships (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'READONLY' CHECK (role IN ('OWNER','ADMIN','ANALYST','READONLY')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_company_memberships_user_active ON company_memberships(user_id, is_active);
ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_company_memberships" ON company_memberships;
CREATE POLICY "anon_select_company_memberships" ON company_memberships FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_company_memberships" ON company_memberships;
CREATE POLICY "anon_insert_company_memberships" ON company_memberships FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_company_memberships" ON company_memberships;
CREATE POLICY "anon_update_company_memberships" ON company_memberships FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_company_memberships" ON company_memberships;
CREATE POLICY "anon_delete_company_memberships" ON company_memberships FOR DELETE TO anon, authenticated USING (true);

-- 3. Company countries
CREATE TABLE IF NOT EXISTS company_countries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  country_id text NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, country_id)
);
CREATE INDEX IF NOT EXISTS idx_company_countries_country_active ON company_countries(country_id, is_active);
ALTER TABLE company_countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_company_countries" ON company_countries;
CREATE POLICY "anon_select_company_countries" ON company_countries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_company_countries" ON company_countries;
CREATE POLICY "anon_insert_company_countries" ON company_countries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_company_countries" ON company_countries;
CREATE POLICY "anon_update_company_countries" ON company_countries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_company_countries" ON company_countries;
CREATE POLICY "anon_delete_company_countries" ON company_countries FOR DELETE TO anon, authenticated USING (true);

-- 4. Company licenses
CREATE TABLE IF NOT EXISTS company_licenses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES license_plans(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','STRIPE')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELED','EXPIRED','UNPAID')),
  override_max_users integer,
  override_max_countries integer,
  override_max_competitors integer,
  override_max_skus integer,
  override_max_checks_per_day integer,
  stripe_environment text CHECK (stripe_environment IS NULL OR stripe_environment IN ('TEST','LIVE')),
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  manually_granted_until timestamptz,
  last_stripe_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_licenses_status ON company_licenses(status);
ALTER TABLE company_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_company_licenses" ON company_licenses;
CREATE POLICY "anon_select_company_licenses" ON company_licenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_company_licenses" ON company_licenses;
CREATE POLICY "anon_insert_company_licenses" ON company_licenses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_company_licenses" ON company_licenses;
CREATE POLICY "anon_update_company_licenses" ON company_licenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_company_licenses" ON company_licenses;
CREATE POLICY "anon_delete_company_licenses" ON company_licenses FOR DELETE TO anon, authenticated USING (true);

-- 5. Stripe price mappings
CREATE TABLE IF NOT EXISTS stripe_price_mappings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  plan_id text NOT NULL REFERENCES license_plans(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('TEST','LIVE')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('MONTH','YEAR')),
  stripe_account_id text NOT NULL,
  stripe_product_id text NOT NULL,
  stripe_price_id text UNIQUE NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, environment, billing_interval, currency)
);
CREATE INDEX IF NOT EXISTS idx_stripe_price_mappings_product ON stripe_price_mappings(stripe_product_id);
ALTER TABLE stripe_price_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_stripe_price_mappings" ON stripe_price_mappings;
CREATE POLICY "anon_select_stripe_price_mappings" ON stripe_price_mappings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stripe_price_mappings" ON stripe_price_mappings;
CREATE POLICY "anon_insert_stripe_price_mappings" ON stripe_price_mappings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stripe_price_mappings" ON stripe_price_mappings;
CREATE POLICY "anon_update_stripe_price_mappings" ON stripe_price_mappings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stripe_price_mappings" ON stripe_price_mappings;
CREATE POLICY "anon_delete_stripe_price_mappings" ON stripe_price_mappings FOR DELETE TO anon, authenticated USING (true);

-- 6. Stripe customers
CREATE TABLE IF NOT EXISTS stripe_customers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('TEST','LIVE')),
  stripe_account_id text NOT NULL,
  stripe_customer_id text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, environment)
);
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_stripe_customers" ON stripe_customers;
CREATE POLICY "anon_select_stripe_customers" ON stripe_customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stripe_customers" ON stripe_customers;
CREATE POLICY "anon_insert_stripe_customers" ON stripe_customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stripe_customers" ON stripe_customers;
CREATE POLICY "anon_update_stripe_customers" ON stripe_customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stripe_customers" ON stripe_customers;
CREATE POLICY "anon_delete_stripe_customers" ON stripe_customers FOR DELETE TO anon, authenticated USING (true);

-- 7. Billing webhook events
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stripe_event_id text UNIQUE NOT NULL,
  environment text NOT NULL CHECK (environment IN ('TEST','LIVE')),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_status ON billing_webhook_events(status, created_at);
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_billing_webhook_events" ON billing_webhook_events;
CREATE POLICY "anon_select_billing_webhook_events" ON billing_webhook_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_billing_webhook_events" ON billing_webhook_events;
CREATE POLICY "anon_insert_billing_webhook_events" ON billing_webhook_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_billing_webhook_events" ON billing_webhook_events;
CREATE POLICY "anon_update_billing_webhook_events" ON billing_webhook_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_billing_webhook_events" ON billing_webhook_events;
CREATE POLICY "anon_delete_billing_webhook_events" ON billing_webhook_events FOR DELETE TO anon, authenticated USING (true);

-- 8. Add company_id to domain tables (skip product_markets -- handle separately since it was just created)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webshops' AND column_name='company_id') THEN
    ALTER TABLE webshops ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_groups' AND column_name='company_id') THEN
    ALTER TABLE product_groups ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='company_id') THEN
    ALTER TABLE products ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='competitors' AND column_name='company_id') THEN
    ALTER TABLE competitors ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='competitor_offers' AND column_name='company_id') THEN
    ALTER TABLE competitor_offers ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_matches' AND column_name='company_id') THEN
    ALTER TABLE product_matches ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='price_checks' AND column_name='company_id') THEN
    ALTER TABLE price_checks ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='price_history' AND column_name='company_id') THEN
    ALTER TABLE price_history ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='own_price_history' AND column_name='company_id') THEN
    ALTER TABLE own_price_history ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_markets' AND column_name='company_id') THEN
    ALTER TABLE product_markets ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alerts' AND column_name='company_id') THEN
    ALTER TABLE alerts ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alert_rules' AND column_name='company_id') THEN
    ALTER TABLE alert_rules ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='import_tasks' AND column_name='company_id') THEN
    ALTER TABLE import_tasks ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='company_id') THEN
    ALTER TABLE reports ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='company_id') THEN
    ALTER TABLE audit_logs ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='feed_sources' AND column_name='company_id') THEN
    ALTER TABLE feed_sources ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='feed_column_mappings' AND column_name='company_id') THEN
    ALTER TABLE feed_column_mappings ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='feed_items' AND column_name='company_id') THEN
    ALTER TABLE feed_items ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='feed_sync_runs' AND column_name='company_id') THEN
    ALTER TABLE feed_sync_runs ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_feed_links' AND column_name='company_id') THEN
    ALTER TABLE product_feed_links ADD COLUMN company_id text NOT NULL DEFAULT 'cmp_engels_group' REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 9. Seed memberships
INSERT INTO company_memberships (id, company_id, user_id, role, is_active)
VALUES
  ('cm_admin_engels', 'cmp_engels_group', 'user-admin-0001', 'OWNER', true),
  ('cm_analist_engels', 'cmp_engels_group', 'user-analist-01', 'ANALYST', true),
  ('cm_readonly_engels', 'cmp_engels_group', 'user-readonly-01', 'READONLY', true)
ON CONFLICT (company_id, user_id) DO NOTHING;

-- 10. Mark admin as super admin
UPDATE users SET is_super_admin = true WHERE id = 'user-admin-0001';

-- 11. Company license
INSERT INTO company_licenses (id, company_id, plan_id, source, status)
VALUES ('lic_engels_enterprise', 'cmp_engels_group', 'plan_enterprise', 'MANUAL', 'ACTIVE')
ON CONFLICT (company_id) DO NOTHING;
