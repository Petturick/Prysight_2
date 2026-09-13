alter table public.product_settings enable row level security;
revoke all on table public.product_settings from anon, authenticated;