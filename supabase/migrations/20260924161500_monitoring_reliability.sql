-- Reliable monitoring schedule and worker claiming, 24 September 2026

alter table public.competitor_offers
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists last_successful_check_at timestamptz null,
  add column if not exists next_check_at timestamptz null,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists check_locked_until timestamptz null,
  add column if not exists check_lock_token text null;

update public.competitor_offers o
set
  last_attempt_at = coalesce(o.last_attempt_at, o.last_checked_at),
  last_successful_check_at = coalesce(
    o.last_successful_check_at,
    (
      select max(pc.checked_at)
      from public.price_checks pc
      where pc.company_id = o.company_id
        and pc.competitor_offer_id = o.id
        and pc.is_success = true
    )
  )
where o.last_attempt_at is null
   or o.last_successful_check_at is null;

update public.competitor_offers o
set next_check_at = coalesce(
  o.next_check_at,
  coalesce(o.last_successful_check_at, o.last_attempt_at, now() - interval '24 hours')
    + make_interval(hours => greatest(1, least(720, c.check_frequency_hours)))
)
from public.competitors c
where c.id = o.competitor_id
  and c.company_id = o.company_id
  and o.next_check_at is null;

create index if not exists competitor_offers_company_due_idx
  on public.competitor_offers(company_id, is_active, next_check_at);

create index if not exists competitor_offers_lock_idx
  on public.competitor_offers(check_locked_until);

alter table public.competitor_offers
  add constraint competitor_offers_consecutive_failures_check
  check (consecutive_failures >= 0);
