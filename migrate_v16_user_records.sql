-- 부광 말씀씨앗 v16 개인 기록 이전(선택 사항)
-- 1) v17 회원들이 새 계정을 만든 뒤 실행하세요.
-- 2) 이름과 부서가 양쪽에서 각각 하나뿐인 경우에만 자동으로 연결합니다.
-- 3) 같은 이름·부서가 중복되거나 일치하지 않는 자료는 건드리지 않습니다.

begin;

with old_state as (
  select data
  from public.malseum_ssiat_app_state
  where app_id = 'bugwang-malseum-ssiat'
  limit 1
),
legacy_accounts as (
  select
    account->>'id' as legacy_id,
    account->>'name' as display_name,
    account->>'department' as department,
    count(*) over (
      partition by account->>'name', account->>'department'
    ) as legacy_pair_count
  from old_state,
       jsonb_array_elements(coalesce(data->'accounts', '[]'::jsonb)) as legacy_item(account)
  where account->>'role' <> 'admin'
),
new_profiles as (
  select
    id,
    display_name,
    department,
    count(*) over (partition by display_name, department) as profile_pair_count
  from public.malseum_ssiat_profiles
),
safe_matches as (
  select
    profile.id as user_id,
    legacy.legacy_id,
    old_state.data
  from legacy_accounts legacy
  join new_profiles profile
    on profile.display_name = legacy.display_name
   and profile.department = legacy.department
  cross join old_state
  where legacy.legacy_pair_count = 1
    and profile.profile_pair_count = 1
),
migration_rows as (
  select
    user_id,
    coalesce(data->'progressByAccount'->legacy_id, '{}'::jsonb) as progress,
    coalesce((
      select jsonb_agg(history_item)
      from jsonb_array_elements(coalesce(data->'history', '[]'::jsonb)) as history_rows(history_item)
      where history_item->>'accountId' = legacy_id
    ), '[]'::jsonb) as history
  from safe_matches
)
insert into public.malseum_ssiat_user_state (user_id, progress, history, updated_at)
select user_id, progress, history, now()
from migration_rows
on conflict (user_id) do update set
  progress = excluded.progress,
  history = excluded.history,
  updated_at = now();

commit;

-- 자동 연결되지 않은 예전 계정 확인용
with old_state as (
  select data
  from public.malseum_ssiat_app_state
  where app_id = 'bugwang-malseum-ssiat'
  limit 1
)
select
  account->>'name' as "이름",
  account->>'department' as "부서",
  account->>'role' as "기존 구분"
from old_state,
     jsonb_array_elements(coalesce(data->'accounts', '[]'::jsonb)) as legacy_item(account)
where account->>'role' <> 'admin'
  and not exists (
    select 1
    from public.malseum_ssiat_profiles profile
    where profile.display_name = account->>'name'
      and profile.department = account->>'department'
  )
order by 2, 1;
