-- 반응 아이콘이 이미지 창에 떨어진 가로 위치(0~1)를 저장한다(2026-11-08).
-- 다시 열면 받은 순서대로 같은 자리에서 떨어뜨려 본 그대로 쌓인 모습을 되살린다. 위치 저장 전 기록은 비어 있다.
alter table public.project_reactions
  add column if not exists drop_x real check (drop_x is null or (drop_x >= 0 and drop_x <= 1));
grant insert(drop_x) on public.project_reactions to authenticated;
