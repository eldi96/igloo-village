-- 프로젝트 업데이트 알리기. 수정 화면에서 "마을에 업데이트 알리기"를 체크하면 announce_project_update를 호출한다.
-- 알리지 않은 수정(오타 등)은 지금처럼 조용히 바뀐다. 광장 보드는 announced_at 기준으로 새 프로젝트 칸에 다시 올리고,
-- 알린 뒤에 달린 댓글만 세어 "업데이트 후 첫 피드백을 기다려요"를 표시한다.
begin;

alter table public.projects
  add column if not exists announced_at timestamptz,
  add column if not exists update_note text check (update_note is null or char_length(update_note) <= 120);

-- 내 프로젝트만 알릴 수 있고, 같은 프로젝트는 10분에 한 번만(도배 방지). 시간은 항상 서버가 정한다.
create or replace function public.announce_project_update(p_id uuid, p_note text default null)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_time timestamptz;
begin
  if v_uid is null or not (select private.is_member()) then
    raise exception '승인된 회원만 알릴 수 있습니다.' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 120 then
    raise exception '업데이트 메모는 120자 이하여야 합니다.' using errcode = '22023';
  end if;
  update public.projects
     set announced_at = now(), update_note = v_note
   where id = p_id and owner_id = v_uid
     and (announced_at is null or announced_at < now() - interval '10 minutes')
  returning announced_at into v_time;
  if v_time is null then
    if exists (select 1 from public.projects where id = p_id and owner_id = v_uid) then
      raise exception '방금 알렸어요. 10분 뒤에 다시 알릴 수 있어요.' using errcode = '22023';
    end if;
    raise exception '내 프로젝트만 알릴 수 있습니다.' using errcode = '42501';
  end if;
  return v_time;
end;
$$;
revoke all on function public.announce_project_update(uuid, text) from public, anon;
grant execute on function public.announce_project_update(uuid, text) to authenticated;

commit;
