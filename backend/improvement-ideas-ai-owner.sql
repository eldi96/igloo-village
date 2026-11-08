-- AI 정리는 키 주인(아이디 eldi) 한 명만. improvement-ideas-ai.sql 다음에 실행한다.
-- 공개·상태 변경·숨김은 지금처럼 운영자(개발팀·강사) 전체가 한다.
begin;

create table if not exists private.ai_summary_admins (
  member_id uuid primary key references public.members(id) on delete cascade
);
revoke all on private.ai_summary_admins from public, anon, authenticated;
insert into private.ai_summary_admins(member_id)
select u.id from auth.users as u join public.members as m on m.id = u.id
 where u.email = 'eldi@igloo-village.eldi96.github.io'
on conflict do nothing;

create or replace function private.can_run_ai_summary() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.ai_summary_admins where member_id = (select auth.uid()));
$$;
revoke all on function private.can_run_ai_summary() from public, anon;

-- 버튼 표시용. 실제 권한은 아래 두 함수가 다시 검사한다.
create or replace function public.can_run_ai_summary() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (select private.can_run_ai_summary());
$$;
revoke all on function public.can_run_ai_summary() from public, anon;
grant execute on function public.can_run_ai_summary() to authenticated;

create or replace function public.start_improvement_summary(p_limit integer default 200)
returns table (content text, created_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (select private.can_run_ai_summary()) then
    raise exception 'AI 정리는 지정된 계정만 할 수 있습니다.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 300 then
    raise exception '조회 개수는 1~300개여야 합니다.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('improvement_summary'));
  if exists (select 1 from private.improvement_summary_runs where ran_at > now() - interval '10 minutes') then
    raise exception 'AI 정리는 10분에 한 번만 할 수 있어요.' using errcode = '55000';
  end if;
  insert into private.improvement_summary_runs(ran_by) values (v_uid);
  return query
    select p.content, p.created_at
      from public.village_board_posts as p
     where p.deleted_at is null
     order by p.created_at desc, p.id desc
     limit p_limit;
end;
$$;

create or replace function public.save_ai_improvement_ideas(p_items jsonb)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_count integer;
begin
  if v_uid is null or not (select private.can_run_ai_summary()) then
    raise exception 'AI 정리는 지정된 계정만 할 수 있습니다.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 3 then
    raise exception '의견은 1~3개여야 합니다.' using errcode = '22023';
  end if;
  delete from public.improvement_ideas where status = 'review';
  insert into public.improvement_ideas(title, summary, category, mentions, status)
  select left(btrim(x->>'title'), 60),
         left(coalesce(btrim(x->>'summary'), ''), 200),
         case when x->>'category' in ('기능', '디자인', '버그', '콘텐츠') then x->>'category' else '기능' end,
         case when coalesce(x->>'mentions', '') ~ '^[0-9]{1,4}$' then greatest((x->>'mentions')::integer, 1) else 1 end,
         'review'
    from jsonb_array_elements(p_items) as x
   where jsonb_typeof(x) = 'object' and char_length(btrim(coalesce(x->>'title', ''))) > 0;
  get diagnostics v_count = row_count;
  update private.improvement_summary_runs set saved_count = v_count
   where id = (select max(id) from private.improvement_summary_runs where ran_by = v_uid);
  return v_count;
end;
$$;

commit;
