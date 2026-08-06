-- 부광 말씀씨앗 v19 가입 없는 사용 + 선택형 기기 동기화 보안 스키마
-- 기존 malseum_ssiat_app_state 테이블은 백업·이전을 위해 그대로 둡니다.

create table if not exists public.malseum_ssiat_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username)),
  display_name text not null check (char_length(display_name) between 2 and 20),
  department text not null check (char_length(department) between 1 and 30),
  member_role text not null default 'student'
    check (member_role in ('student', 'teacher', 'minister', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.malseum_ssiat_shared_state (
  app_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.malseum_ssiat_user_state (
  user_id uuid primary key references public.malseum_ssiat_profiles(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.malseum_ssiat_rankings (
  user_id uuid not null references public.malseum_ssiat_profiles(id) on delete cascade,
  week_start date not null,
  display_name text not null,
  department text not null,
  member_role text not null,
  weekly_success integer not null default 0,
  weekly_unique integer not null default 0,
  all_time_success integer not null default 0,
  mastered integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create or replace function public.malseum_ssiat_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.malseum_ssiat_profiles
    where id = (select auth.uid())
      and member_role = 'admin'
  );
$$;

revoke all on function public.malseum_ssiat_is_admin() from public;
grant execute on function public.malseum_ssiat_is_admin() to authenticated;

create or replace function public.malseum_ssiat_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.malseum_ssiat_refresh_ranking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_row public.malseum_ssiat_profiles%rowtype;
  current_week date := date_trunc('week', current_date)::date;
  weekly_success_count integer := 0;
  weekly_unique_count integer := 0;
  all_time_success_count integer := 0;
  mastered_count integer := 0;
begin
  select * into profile_row
  from public.malseum_ssiat_profiles
  where id = new.user_id;

  select
    count(*) filter (
      where item->>'success' = 'true'
        and item->>'perfect' = 'true'
        and item->>'date' >= current_week::text
    ),
    count(distinct item->>'verseId') filter (
      where item->>'success' = 'true'
        and item->>'perfect' = 'true'
        and item->>'date' >= current_week::text
    ),
    count(*) filter (where item->>'success' = 'true')
  into weekly_success_count, weekly_unique_count, all_time_success_count
  from jsonb_array_elements(coalesce(new.history, '[]'::jsonb)) as history_item(item);

  select count(*)
  into mastered_count
  from jsonb_each(coalesce(new.progress, '{}'::jsonb)) as entry
  where entry.value->>'mastered' = 'true';

  insert into public.malseum_ssiat_rankings (
    user_id,
    week_start,
    display_name,
    department,
    member_role,
    weekly_success,
    weekly_unique,
    all_time_success,
    mastered,
    updated_at
  ) values (
    new.user_id,
    current_week,
    profile_row.display_name,
    profile_row.department,
    profile_row.member_role,
    weekly_success_count,
    weekly_unique_count,
    all_time_success_count,
    mastered_count,
    now()
  )
  on conflict (user_id, week_start) do update set
    display_name = excluded.display_name,
    department = excluded.department,
    member_role = excluded.member_role,
    weekly_success = excluded.weekly_success,
    weekly_unique = excluded.weekly_unique,
    all_time_success = excluded.all_time_success,
    mastered = excluded.mastered,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.malseum_ssiat_refresh_ranking_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.malseum_ssiat_rankings
  set display_name = new.display_name,
      department = new.department,
      member_role = new.member_role,
      updated_at = now()
  where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists malseum_ssiat_profiles_touch on public.malseum_ssiat_profiles;
create trigger malseum_ssiat_profiles_touch
before update on public.malseum_ssiat_profiles
for each row execute function public.malseum_ssiat_touch_updated_at();

drop trigger if exists malseum_ssiat_shared_touch on public.malseum_ssiat_shared_state;
create trigger malseum_ssiat_shared_touch
before update on public.malseum_ssiat_shared_state
for each row execute function public.malseum_ssiat_touch_updated_at();

drop trigger if exists malseum_ssiat_user_touch on public.malseum_ssiat_user_state;
create trigger malseum_ssiat_user_touch
before update on public.malseum_ssiat_user_state
for each row execute function public.malseum_ssiat_touch_updated_at();

drop trigger if exists malseum_ssiat_user_ranking on public.malseum_ssiat_user_state;
create trigger malseum_ssiat_user_ranking
after insert or update on public.malseum_ssiat_user_state
for each row execute function public.malseum_ssiat_refresh_ranking();

drop trigger if exists malseum_ssiat_profile_ranking on public.malseum_ssiat_profiles;
create trigger malseum_ssiat_profile_ranking
after update of display_name, department, member_role on public.malseum_ssiat_profiles
for each row execute function public.malseum_ssiat_refresh_ranking_profile();

alter table public.malseum_ssiat_profiles enable row level security;
alter table public.malseum_ssiat_shared_state enable row level security;
alter table public.malseum_ssiat_user_state enable row level security;
alter table public.malseum_ssiat_rankings enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.malseum_ssiat_profiles;
create policy "profiles_select_own_or_admin"
on public.malseum_ssiat_profiles for select to authenticated
using (id = (select auth.uid()) or (select public.malseum_ssiat_is_admin()));

drop policy if exists "profiles_insert_anonymous_own" on public.malseum_ssiat_profiles;
create policy "profiles_insert_anonymous_own"
on public.malseum_ssiat_profiles for insert to authenticated
with check (
  id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and member_role = 'student'
  and username = 'guest_' || left(replace((select auth.uid())::text, '-', ''), 12)
);

drop policy if exists "profiles_update_own_or_admin" on public.malseum_ssiat_profiles;
create policy "profiles_update_own_or_admin"
on public.malseum_ssiat_profiles for update to authenticated
using (id = (select auth.uid()) or (select public.malseum_ssiat_is_admin()))
with check (id = (select auth.uid()) or (select public.malseum_ssiat_is_admin()));

drop policy if exists "shared_select_members" on public.malseum_ssiat_shared_state;
create policy "shared_select_members"
on public.malseum_ssiat_shared_state for select to authenticated
using (true);

drop policy if exists "shared_insert_admin" on public.malseum_ssiat_shared_state;
create policy "shared_insert_admin"
on public.malseum_ssiat_shared_state for insert to authenticated
with check ((select public.malseum_ssiat_is_admin()));

drop policy if exists "shared_update_admin" on public.malseum_ssiat_shared_state;
create policy "shared_update_admin"
on public.malseum_ssiat_shared_state for update to authenticated
using ((select public.malseum_ssiat_is_admin()))
with check ((select public.malseum_ssiat_is_admin()));

drop policy if exists "user_state_select_own_or_admin" on public.malseum_ssiat_user_state;
create policy "user_state_select_own_or_admin"
on public.malseum_ssiat_user_state for select to authenticated
using (user_id = (select auth.uid()) or (select public.malseum_ssiat_is_admin()));

drop policy if exists "user_state_insert_own" on public.malseum_ssiat_user_state;
create policy "user_state_insert_own"
on public.malseum_ssiat_user_state for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "user_state_update_own" on public.malseum_ssiat_user_state;
create policy "user_state_update_own"
on public.malseum_ssiat_user_state for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "rankings_select_members" on public.malseum_ssiat_rankings;
create policy "rankings_select_members"
on public.malseum_ssiat_rankings for select to authenticated
using (true);

revoke all on public.malseum_ssiat_profiles from anon, authenticated;
revoke all on public.malseum_ssiat_shared_state from anon, authenticated;
revoke all on public.malseum_ssiat_user_state from anon, authenticated;
revoke all on public.malseum_ssiat_rankings from anon, authenticated;

grant select on public.malseum_ssiat_profiles to authenticated;
grant insert (id, username, display_name, department, member_role) on public.malseum_ssiat_profiles to authenticated;
grant update (display_name, department, updated_at) on public.malseum_ssiat_profiles to authenticated;
grant select, insert, update on public.malseum_ssiat_shared_state to authenticated;
grant select, insert, update on public.malseum_ssiat_user_state to authenticated;
grant select on public.malseum_ssiat_rankings to authenticated;

insert into public.malseum_ssiat_shared_state (app_id, data)
values ('bugwang-malseum-ssiat', '{}'::jsonb)
on conflict (app_id) do nothing;

-- v16 공용 행이 있으면 개인 계정·기록을 제외한 말씀과 디자인만 v19로 복사합니다.
do $$
declare
  old_data jsonb;
  safe_shared jsonb;
begin
  if to_regclass('public.malseum_ssiat_app_state') is not null then
    execute $query$
      select data from public.malseum_ssiat_app_state
      where app_id = 'bugwang-malseum-ssiat'
      limit 1
    $query$ into old_data;

    if old_data is not null and old_data <> '{}'::jsonb then
      safe_shared := jsonb_build_object(
        'appName', coalesce(old_data->'appName', '"부광 말씀씨앗"'::jsonb),
        'appText', coalesce(old_data->'appText', '{}'::jsonb),
        'appDesign', coalesce(old_data->'appDesign', '{}'::jsonb),
        'verses', coalesce(old_data->'verses', '[]'::jsonb),
        'todayVerseId', coalesce(old_data->'todayVerseId', 'null'::jsonb)
      );

      update public.malseum_ssiat_shared_state
      set data = safe_shared, updated_at = now()
      where app_id = 'bugwang-malseum-ssiat'
        and data = '{}'::jsonb;
    end if;
  end if;
end $$;

-- 이전 공용 테이블은 삭제하지 않고 잠급니다. 자료는 Dashboard/SQL Editor에서만 백업할 수 있습니다.
do $$
declare
  policy_row record;
begin
  if to_regclass('public.malseum_ssiat_app_state') is not null then
    alter table public.malseum_ssiat_app_state enable row level security;
    revoke all on public.malseum_ssiat_app_state from anon, authenticated;
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'malseum_ssiat_app_state'
    loop
      execute format('drop policy if exists %I on public.malseum_ssiat_app_state', policy_row.policyname);
    end loop;
  end if;
end $$;

-- 일반 사용자는 익명으로 시작하거나 선택하여 일반 계정을 만들 수 있습니다.
-- 관리자 역할은 일반 계정을 만든 후 SQL Editor에서 아래 한 줄로 별도 지정합니다.
-- update public.malseum_ssiat_profiles set member_role = 'admin' where username = '관리자아이디';
