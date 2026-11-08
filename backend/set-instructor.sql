-- 강사 계정 지정. 강사님이 초대 코드로 가입한 뒤, 아래 v_login 한 곳만 바꿔 Supabase SQL 편집기에서 실행한다.
-- 준비용 파일이다. 아직 실제 DB에 실행하지 않았다.
-- 하는 일: members.role을 'instructor'로 바꾸고, 방문 통계 표본에서 뺀다.
-- 막는 경우: 계정이 없거나 미승인, 이미 강사, 이글루를 차지한 상태(강사가 되면 그 이글루 프로젝트를 고칠 수 없게 됨).
begin;

do $$
declare
  v_login text := '강사아이디';  -- ← 강사님 로그인 아이디(영문 소문자·숫자·_)로 바꾼다
  v_email text := lower(trim(v_login)) || '@igloo-village.eldi96.github.io';
  v_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select m.id into v_id from auth.users u join public.members m on m.id = u.id where u.email = v_email;
  if v_id is null then raise exception '가입한 회원이 없습니다: %', v_email; end if;
  if not (select approved from public.members where id = v_id) then raise exception '승인되지 않은 회원입니다.'; end if;
  if (select role from public.members where id = v_id) = 'instructor' then raise exception '이미 강사 계정입니다.'; end if;
  if exists (select 1 from public.igloos where owner_id = v_id) then
    raise exception '이 계정이 이글루를 차지하고 있습니다. 먼저 이글루를 비운 뒤 실행하세요.';
  end if;

  update public.members set role = 'instructor' where id = v_id;

  -- 방문 통계: 이후 자동 등록을 막고, 이미 들어간 표본은 기록을 지우지 않고 어제까지로 끝낸다.
  insert into private.visit_exclusions(member_id) values (v_id) on conflict do nothing;
  delete from public.visit_participants where member_id = v_id and included_from >= v_today;
  update public.visit_participants set included_until = v_today - 1
    where member_id = v_id and included_from < v_today and (included_until is null or included_until >= v_today);
end $$;

-- 확인: 방금 바꾼 계정이 instructor로 보이면 된다.
select u.email, m.display_name, m.role, m.approved,
       exists (select 1 from private.visit_exclusions e where e.member_id = m.id) as visit_excluded
  from public.members m join auth.users u on u.id = m.id
 where m.role = 'instructor';

commit;

-- 되돌리기(강사 → 수강생). 필요할 때만 아래 주석을 풀고 아이디를 바꿔 실행한다.
-- 방문 통계 표본 복귀는 자동으로 되지 않는다. 기존 visit_participants 행이 남아 있으면 트리거가 새로 넣지 않으므로
-- 그 행의 included_until을 직접 null로 되돌려야 한다(기간 공백은 통계에서 해석 주의).
-- begin;
-- delete from private.visit_exclusions where member_id = (select id from auth.users where email = '강사아이디@igloo-village.eldi96.github.io');
-- update public.members set role = 'student' where id = (select id from auth.users where email = '강사아이디@igloo-village.eldi96.github.io');
-- commit;
