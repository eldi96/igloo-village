-- 프로젝트 1개 등록 보상. 이미 얻은 해금은 프로젝트 삭제 후에도 유지한다.
alter table public.members add column card_theme text not null default 'glass'
  check(card_theme in ('glass','rose','cream','graphite','mint'));
alter table public.members add column card_theme_unlocked_at timestamptz;
-- 기존 UPDATE(display_name) 권한만 유지. 테마·해금 값은 직접 수정할 수 없다.
create function private.unlock_card_theme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members set card_theme_unlocked_at=coalesce(card_theme_unlocked_at,new.created_at)
  where id=new.owner_id and card_theme_unlocked_at is null;
  return new;
end;
$$;
revoke all on function private.unlock_card_theme() from public,anon,authenticated;
create trigger unlock_card_theme after insert on public.projects
for each row execute function private.unlock_card_theme();
update public.members m set card_theme_unlocked_at=p.first_project
from (select owner_id,min(created_at) as first_project from public.projects group by owner_id) p
where m.id=p.owner_id and m.card_theme_unlocked_at is null;

create function private.read_igloo_card_theme(p_home integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_member() then raise insufficient_privilege using message='로그인이 필요해요.'; end if;
  select jsonb_build_object('theme',case when m.card_theme_unlocked_at is null then 'glass' else m.card_theme end,
    'unlocked',m.card_theme_unlocked_at is not null,'is_owner',i.owner_id=(select auth.uid())) into result
  from public.igloos i join public.members m on m.id=i.owner_id
  where i.id=p_home and (i.is_public or i.owner_id=(select auth.uid()));
  if result is null then raise insufficient_privilege using message='이글루를 볼 수 없어요.'; end if;
  return result;
end;
$$;
create function private.save_card_theme(p_theme text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.'; end if;
  if p_theme is null or p_theme not in ('glass','rose','cream','graphite','mint') then raise invalid_parameter_value using message='테마를 확인해 주세요.'; end if;
  update public.members set card_theme=p_theme where id=(select auth.uid())
    and (p_theme='glass' or card_theme_unlocked_at is not null)
  returning jsonb_build_object('theme',card_theme,'unlocked',card_theme_unlocked_at is not null,'is_owner',true) into result;
  if result is null then raise insufficient_privilege using message='프로젝트를 1개 등록하면 테마가 열려요.'; end if;
  return result;
end;
$$;
revoke all on function private.read_igloo_card_theme(integer),private.save_card_theme(text) from public,anon,authenticated;
grant execute on function private.read_igloo_card_theme(integer),private.save_card_theme(text) to authenticated;
create function public.get_igloo_card_theme(p_home integer) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.read_igloo_card_theme(p_home); $$;
create function public.set_card_theme(p_theme text) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select private.save_card_theme(p_theme); $$;
revoke all on function public.get_igloo_card_theme(integer),public.set_card_theme(text) from public,anon,authenticated;
grant execute on function public.get_igloo_card_theme(integer),public.set_card_theme(text) to authenticated;
