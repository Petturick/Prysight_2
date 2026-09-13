alter table public.product_settings
  add constraint product_settings_mode_check check (mode in ('INHERIT','MONITOR','ADVISE','APPROVE','AUTOMATIC')),
  add constraint product_settings_cooldown_check check (cooldown_hours >= 1 and cooldown_hours <= 720),
  add constraint product_settings_scope_check check ((product_id is not null and product_group_id is null) or (product_id is null and product_group_id is not null));