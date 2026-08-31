/*
# Multi-company foundation - Part 1: Core tables + seed company

Creates the companies table and inserts the initial company BEFORE
adding company_id FKs to existing tables.
*/

-- 1. Add is_super_admin to users
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_super_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Companies table
CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  billing_email text,
  default_currency text NOT NULL DEFAULT 'EUR',
  timezone text NOT NULL DEFAULT 'Europe/Amsterdam',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_companies" ON companies;
CREATE POLICY "anon_select_companies" ON companies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_companies" ON companies;
CREATE POLICY "anon_insert_companies" ON companies FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_companies" ON companies;
CREATE POLICY "anon_update_companies" ON companies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_companies" ON companies;
CREATE POLICY "anon_delete_companies" ON companies FOR DELETE TO anon, authenticated USING (true);

-- 3. INSERT seed company FIRST so FKs can reference it
INSERT INTO companies (id, name, slug, status, default_currency, timezone)
VALUES ('cmp_engels_group', 'Engels Group', 'engels-group', 'ACTIVE', 'EUR', 'Europe/Amsterdam')
ON CONFLICT (id) DO NOTHING;

-- 4. License plans (needed before company_licenses)
CREATE TABLE IF NOT EXISTS license_plans (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT false,
  max_users integer,
  max_countries integer,
  max_competitors integer,
  max_skus integer,
  max_checks_per_day integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE license_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_license_plans" ON license_plans;
CREATE POLICY "anon_select_license_plans" ON license_plans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_license_plans" ON license_plans;
CREATE POLICY "anon_insert_license_plans" ON license_plans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_license_plans" ON license_plans;
CREATE POLICY "anon_update_license_plans" ON license_plans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_license_plans" ON license_plans;
CREATE POLICY "anon_delete_license_plans" ON license_plans FOR DELETE TO anon, authenticated USING (true);

INSERT INTO license_plans (id, code, name, description, is_active, is_public, features)
VALUES ('plan_enterprise', 'enterprise', 'Enterprise', 'Onbeperkt gebruik voor enterprise klanten', true, false, '{"all": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;
