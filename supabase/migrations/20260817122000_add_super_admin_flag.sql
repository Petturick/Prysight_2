alter table public.users
  add column if not exists is_super_admin boolean not null default false;

create index if not exists users_super_admin_idx
  on public.users (is_super_admin)
  where is_super_admin = true;
