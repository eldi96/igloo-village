-- 프로젝트 반응을 하루에 한 번씩 누를 수 있게 바꾼다(2026-11-08).
-- 같은 사람·같은 반응은 한국 날짜 하루에 한 줄만 쌓이고, 누른 반응은 취소하지 않는다.
-- 날짜는 서버 기본값으로만 정해진다(삽입 권한에 reacted_on 칸이 없다).
alter table public.project_reactions
  add column if not exists reacted_on date not null default ((now() at time zone 'Asia/Seoul')::date);
update public.project_reactions set reacted_on = (created_at at time zone 'Asia/Seoul')::date;
alter table public.project_reactions drop constraint project_reactions_pkey;
alter table public.project_reactions add primary key (project_id, member_id, emoji, reacted_on);
drop policy if exists project_reactions_delete on public.project_reactions;
revoke delete on public.project_reactions from authenticated;
