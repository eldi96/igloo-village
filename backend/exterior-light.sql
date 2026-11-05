-- 프로젝트 2개 보상. 내부 장면과 별개인 외부 발광 색만 저장.
alter table public.members add column exterior_light_unlocked_at timestamptz;
alter table public.igloos add column exterior_light text not null default 'warm'
  check(exterior_light in ('warm','blue'));
create or replace function private.unlock_card_theme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 동시에 두 프로젝트가 등록돼도 보상 판정이 엇갈리지 않도록 사용자 행을 잠근다.
  perform 1 from public.members where id=new.owner_id for update;
  update public.members set
    card_theme_unlocked_at=coalesce(card_theme_unlocked_at,new.created_at),
    exterior_light_unlocked_at=case when (select count(*) from public.projects where owner_id=new.owner_id)>=2
      then coalesce(exterior_light_unlocked_at,new.created_at) else exterior_light_unlocked_at end
  where id=new.owner_id;
  return new;
end;
$$;
update public.members m set exterior_light_unlocked_at=now()
where exterior_light_unlocked_at is null and (select count(*) from public.projects p where p.owner_id=m.id)>=2;
create function private.reset_exterior_light() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then new.exterior_light:='warm'; end if;
  return new;
end;
$$;
revoke all on function private.reset_exterior_light() from public,anon,authenticated;
create trigger reset_exterior_light before update of owner_id on public.igloos
for each row execute function private.reset_exterior_light();
create function private.read_exterior_light() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.';end if;
  select jsonb_build_object('color',i.exterior_light,'unlocked',m.exterior_light_unlocked_at is not null) into result
  from public.members m join public.igloos i on i.owner_id=m.id where m.id=(select auth.uid());
  if result is null then raise insufficient_privilege using message='내 이글루를 먼저 정해 주세요.';end if;
  return result;
end;
$$;
create function private.save_exterior_light(p_color text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare unlocked boolean; saved text;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.';end if;
  if p_color is null or p_color not in ('warm','blue') then raise invalid_parameter_value using message='불빛 색상을 확인해 주세요.';end if;
  select exterior_light_unlocked_at is not null into unlocked from public.members where id=(select auth.uid());
  if p_color='blue' and not unlocked then raise insufficient_privilege using message='프로젝트 2개를 등록하면 파란 불빛이 열려요.';end if;
  update public.igloos set exterior_light=p_color where owner_id=(select auth.uid()) returning exterior_light into saved;
  if saved is null then raise insufficient_privilege using message='내 이글루를 먼저 정해 주세요.';end if;
  return jsonb_build_object('color',saved,'unlocked',unlocked);
end;
$$;
revoke all on function private.read_exterior_light(),private.save_exterior_light(text) from public,anon,authenticated;
grant execute on function private.read_exterior_light(),private.save_exterior_light(text) to authenticated;
create function public.get_exterior_light() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.read_exterior_light(); $$;
create function public.set_exterior_light(p_color text) returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.save_exterior_light(p_color); $$;
revoke all on function public.get_exterior_light(),public.set_exterior_light(text) from public,anon,authenticated;
grant execute on function public.get_exterior_light(),public.set_exterior_light(text) to authenticated;
