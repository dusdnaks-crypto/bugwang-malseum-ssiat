-- 부광 말씀씨앗 서버 동기화용 Supabase SQL
-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.

create table if not exists public.malseum_ssiat_app_state (
  app_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.malseum_ssiat_app_state enable row level security;

drop policy if exists "malseum_ssiat_public_read" on public.malseum_ssiat_app_state;
drop policy if exists "malseum_ssiat_public_insert" on public.malseum_ssiat_app_state;
drop policy if exists "malseum_ssiat_public_update" on public.malseum_ssiat_app_state;

create policy "malseum_ssiat_public_read"
on public.malseum_ssiat_app_state
for select
using (true);

create policy "malseum_ssiat_public_insert"
on public.malseum_ssiat_app_state
for insert
with check (true);

create policy "malseum_ssiat_public_update"
on public.malseum_ssiat_app_state
for update
using (true)
with check (true);

insert into public.malseum_ssiat_app_state (app_id, data)
values ('bugwang-malseum-ssiat', '{}'::jsonb)
on conflict (app_id) do nothing;
