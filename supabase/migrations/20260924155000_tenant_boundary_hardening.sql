-- Tenant boundary hardening, 24 September 2026
--
-- Prysight is a server-side multi-tenant application. Domain rows must never
-- silently fall back to the historical Engels Group tenant and browser database
-- roles must not inherit permissive legacy policies.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'anon_%'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies',
    'company_memberships',
    'company_countries',
    'company_licenses',
    'stripe_customers',
    'stripe_price_mappings',
    'billing_webhook_events',
    'webshops',
    'product_groups',
    'products',
    'competitors',
    'competitor_offers',
    'product_matches',
    'price_checks',
    'price_history',
    'own_price_history',
    'product_markets',
    'alerts',
    'alert_rules',
    'import_tasks',
    'reports',
    'audit_logs',
    'feed_sources',
    'feed_column_mappings',
    'feed_items',
    'feed_sync_runs',
    'product_feed_links',
    'pricing_rules',
    'product_settings',
    'price_change_requests',
    'custom_roles'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'webshops',
    'product_groups',
    'products',
    'competitors',
    'competitor_offers',
    'product_matches',
    'price_checks',
    'price_history',
    'own_price_history',
    'product_markets',
    'alerts',
    'alert_rules',
    'import_tasks',
    'reports',
    'audit_logs',
    'feed_sources',
    'feed_column_mappings',
    'feed_items',
    'feed_sync_runs',
    'product_feed_links'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = table_name
        and column_name = 'company_id'
    ) then
      execute format('alter table public.%I alter column company_id drop default', table_name);
    end if;
  end loop;
end
$$;
