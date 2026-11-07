-- 광장 보드의 서비스 개선 의견. 익명 채팅을 AI(운영자 요청 시 Claude)가 정리해 넣고,
-- 운영자가 공개하면 회원이 의견마다 👍/👎 하나를 누른다. 점수(👍-👎) 순으로 수정 우선순위를 정한다.
-- 항목 추가·문구 수정은 운영 도구(SQL)로만 한다. 브라우저는 아래 RPC만 쓴다.
begin;

create table if not exists public.improvement_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  summary text not null default '' check (char_length(summary) <= 200),
  category text not null default '기능' check (category in ('기능', '디자인', '버그', '콘텐츠')),
  mentions integer not null default 1 check (mentions >= 0),
  -- review: AI가 넣은 검토 대기(운영자만 보임), voting: 공개, in_progress: 진행 중, done: 반영 완료, hidden: 숨김
  status text not null default 'review' check (status in ('review', 'voting', 'in_progress', 'done', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.improvement_ideas enable row level security;
revoke all on public.improvement_ideas from public, anon, authenticated;

create table if not exists public.improvement_reactions (
  idea_id uuid not null references public.improvement_ideas(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (idea_id, member_id)
);
alter table public.improvement_reactions enable row level security;
revoke all on public.improvement_reactions from public, anon, authenticated;

-- 누구나 공개 의견과 👍/👎 수를 본다. 누가 눌렀는지는 반환하지 않는다. 운영자는 검토 대기도 본다.
create or replace function public.list_improvement_ideas()
returns table (id uuid, title text, summary text, category text, mentions integer, status text,
               ups integer, downs integer, my_value smallint)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, i.summary, i.category, i.mentions, i.status,
         count(r.*) filter (where r.value = 1)::integer,
         count(r.*) filter (where r.value = -1)::integer,
         coalesce(max(r.value) filter (where r.member_id = (select auth.uid())), 0)::smallint
    from public.improvement_ideas as i
    left join public.improvement_reactions as r on r.idea_id = i.id
   where i.status in ('voting', 'in_progress', 'done')
      or (i.status = 'review' and (select auth.uid()) is not null and (select private.can_moderate_village_board()))
   group by i.id
   order by case i.status when 'voting' then 0 when 'in_progress' then 1 when 'review' then 2 else 3 end,
            count(r.*) filter (where r.value = 1) - count(r.*) filter (where r.value = -1) desc,
            count(r.*) filter (where r.value = 1) desc, i.created_at desc
   limit 50;
$$;
revoke all on function public.list_improvement_ideas() from public;
grant execute on function public.list_improvement_ideas() to anon, authenticated;

-- 승인 회원이 공개(투표 중) 의견에 👍(1)/👎(-1)을 누르거나 0으로 취소한다.
create or replace function public.react_improvement_idea(p_id uuid, p_value smallint)
returns smallint
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (select private.is_member()) then
    raise exception '승인된 회원만 누를 수 있습니다.' using errcode = '42501';
  end if;
  if p_value is null or p_value not in (-1, 0, 1) then
    raise exception '반응 값이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.improvement_ideas where id = p_id and status = 'voting') then
    raise exception '지금은 반응할 수 없는 의견입니다.' using errcode = '22023';
  end if;
  if p_value = 0 then
    delete from public.improvement_reactions where idea_id = p_id and member_id = v_uid;
  else
    insert into public.improvement_reactions(idea_id, member_id, value) values (p_id, v_uid, p_value)
    on conflict (idea_id, member_id) do update set value = excluded.value, created_at = now();
  end if;
  return p_value;
end;
$$;
revoke all on function public.react_improvement_idea(uuid, smallint) from public, anon;
grant execute on function public.react_improvement_idea(uuid, smallint) to authenticated;

-- 운영자(개발팀·강사)가 상태를 바꾼다: 공개, 진행 중, 완료, 숨김, 검토 대기.
create or replace function public.set_improvement_idea_status(p_id uuid, p_status text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or not (select private.can_moderate_village_board()) then
    raise exception '운영자만 상태를 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('review', 'voting', 'in_progress', 'done', 'hidden') then
    raise exception '상태 값이 올바르지 않습니다.' using errcode = '22023';
  end if;
  update public.improvement_ideas set status = p_status, updated_at = now() where id = p_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.set_improvement_idea_status(uuid, text) from public, anon;
grant execute on function public.set_improvement_idea_status(uuid, text) to authenticated;

commit;
