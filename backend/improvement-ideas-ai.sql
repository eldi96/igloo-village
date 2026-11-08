-- 광장 보드 개선 의견 AI 정리. improvement-ideas.sql 다음에 실행한다.
-- 흐름: 운영자가 보드에서 `AI로 정리`를 누름 → Vercel 함수(api/summarize-ideas.mjs)가 운영자 로그인으로
-- start_improvement_summary를 불러 최근 채팅을 받고 → OpenAI로 많이 나온 의견 3개를 고른 뒤 →
-- save_ai_improvement_ideas로 `검토 대기`에 넣는다. 운영자가 확인 후 `공개`해야 회원이 투표한다.
-- OpenAI 키는 Vercel 환경변수에만 있고 DB·브라우저에는 없다.
begin;

-- 실행 기록. 운영자 전체 기준 10분에 한 번만 허용해 키 사용량을 막는다.
create table if not exists private.improvement_summary_runs (
  id bigint generated always as identity primary key,
  ran_by uuid not null references auth.users(id) on delete cascade,
  ran_at timestamptz not null default now(),
  saved_count integer
);
revoke all on private.improvement_summary_runs from public, anon, authenticated;

-- 운영자만: 실행을 기록하고 최근 채팅 본문(작성자 없음)을 돌려준다.
create or replace function public.start_improvement_summary(p_limit integer default 200)
returns table (content text, created_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (select private.can_moderate_village_board()) then
    raise exception '운영자만 AI 정리를 할 수 있습니다.' using errcode = '42501';
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
revoke all on function public.start_improvement_summary(integer) from public, anon;
grant execute on function public.start_improvement_summary(integer) to authenticated;

-- 운영자만: AI 결과 1~3개를 `검토 대기`로 넣는다. 아직 공개하지 않은 이전 검토 대기 항목은 새 결과로 바뀐다.
create or replace function public.save_ai_improvement_ideas(p_items jsonb)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_count integer;
begin
  if v_uid is null or not (select private.can_moderate_village_board()) then
    raise exception '운영자만 AI 정리를 할 수 있습니다.' using errcode = '42501';
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
revoke all on function public.save_ai_improvement_ideas(jsonb) from public, anon;
grant execute on function public.save_ai_improvement_ideas(jsonb) to authenticated;

commit;
