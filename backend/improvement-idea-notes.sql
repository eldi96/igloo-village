-- 서비스 개선 의견에 운영자 한마디(예: '난이도 높음 ㅠㅠ'). 의견마다 하나, 최대 80자, 빈 문자열이면 없음.
-- 누구나 목록에서 보고, 쓰기·고치기·지우기는 운영자(개발팀·강사) 전체. improvement-ideas.sql 다음에 실행한다.
begin;

alter table public.improvement_ideas
  add column if not exists note text not null default '' check (char_length(note) <= 80);

-- 반환 칸이 늘어나므로 다시 만든다(내용은 note 추가 외 동일).
drop function if exists public.list_improvement_ideas();
create function public.list_improvement_ideas()
returns table (id uuid, title text, summary text, category text, mentions integer, status text,
               ups integer, downs integer, my_value smallint, note text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, i.summary, i.category, i.mentions, i.status,
         count(r.*) filter (where r.value = 1)::integer,
         count(r.*) filter (where r.value = -1)::integer,
         coalesce(max(r.value) filter (where r.member_id = (select auth.uid())), 0)::smallint,
         i.note
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

create or replace function public.set_improvement_idea_note(p_id uuid, p_note text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_note text := btrim(coalesce(p_note, '')); v_count integer;
begin
  if (select auth.uid()) is null or not (select private.can_moderate_village_board()) then
    raise exception '운영자만 한마디를 달 수 있습니다.' using errcode = '42501';
  end if;
  if char_length(v_note) > 80 then
    raise exception '한마디는 80자 이하로 적어 주세요.' using errcode = '22023';
  end if;
  update public.improvement_ideas set note = v_note, updated_at = now() where id = p_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.set_improvement_idea_note(uuid, text) from public, anon;
grant execute on function public.set_improvement_idea_note(uuid, text) to authenticated;

commit;
