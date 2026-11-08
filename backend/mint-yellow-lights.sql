-- 민트·노랑 이글루 조명 추가(증분). 운영 DB에 한 번만 적용한다.
-- 바깥 불빛: warm(주황 기본), blue(라벤더 보라, 기존 저장값 유지) + mint, yellow. warm 외에는 프로젝트 2개로 해금.

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.igloos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%exterior_light%'
  loop execute format('alter table public.igloos drop constraint %I', c); end loop;
end;
$$;
alter table public.igloos add constraint igloos_exterior_light_check check (exterior_light in ('warm','blue','mint','yellow'));

create or replace function private.save_exterior_light(p_color text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare unlocked boolean; saved text;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.';end if;
  if p_color is null or p_color not in ('warm','blue','mint','yellow') then raise invalid_parameter_value using message='불빛 색상을 확인해 주세요.';end if;
  select exterior_light_unlocked_at is not null into unlocked from public.members where id=(select auth.uid());
  if p_color<>'warm' and not unlocked then raise insufficient_privilege using message='프로젝트 2개를 등록하면 새 불빛이 열려요.';end if;
  update public.igloos set exterior_light=p_color where owner_id=(select auth.uid()) returning exterior_light into saved;
  if saved is null then raise insufficient_privilege using message='내 이글루를 먼저 정해 주세요.';end if;
  return jsonb_build_object('color',saved,'unlocked',unlocked);
end;
$$;

-- create or replace는 기존 권한을 유지하지만, 혹시 몰라 다시 지정한다.
revoke all on function private.save_exterior_light(text) from public, anon, authenticated;
grant execute on function private.save_exterior_light(text) to authenticated;
