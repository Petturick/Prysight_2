insert into public.product_settings (id, company_id, product_id, mode, cooldown_hours, is_active)
select 'pst_' || p.id, p.company_id, p.id, 'INHERIT', 24, true
from public.products p
where not exists (
  select 1 from public.product_settings s
  where s.product_id = p.id and s.company_id = p.company_id
);