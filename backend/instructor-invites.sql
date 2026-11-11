-- 기존 초대 코드는 기본 student 역할과 무제한 사용을 유지한다.
alter table private.invite_codes
  add column role text not null default 'student' check (role in ('student','instructor')),
  add column max_uses integer check (max_uses is null or max_uses > 0),
  add column uses_count integer not null default 0 check (uses_count >= 0),
  add column expires_at timestamptz;

create or replace function private.invite_is_valid(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.invite_codes c
    where c.active
      and c.code_hash=encode(pg_catalog.sha256(pg_catalog.convert_to(upper(trim(coalesce(p_code,''))),'UTF8')),'hex')
      and (c.expires_at is null or c.expires_at > now())
      and (c.max_uses is null or c.uses_count < c.max_uses)
  );
$$;

create or replace function public.join_with_invite(p_code text,p_display_name text) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  name text := trim(coalesce(p_display_name,''));
  invitation private.invite_codes;
  result public.members;
begin
  if uid is null then raise exception '먼저 로그인해주세요.'; end if;
  if char_length(name) not between 1 and 40 then raise exception '이름은 1~40자로 입력해주세요.'; end if;
  -- 코드 행을 잠가 동시에 가입해도 사용 한도를 넘지 않도록 한다.
  select * into invitation from private.invite_codes c
  where c.code_hash=encode(pg_catalog.sha256(pg_catalog.convert_to(upper(trim(coalesce(p_code,''))),'UTF8')),'hex')
  for update;
  if not found or not invitation.active
    or (invitation.expires_at is not null and invitation.expires_at <= now())
    or (invitation.max_uses is not null and invitation.uses_count >= invitation.max_uses) then
    raise exception '초대 코드가 맞지 않거나 만료됐어요.';
  end if;
  insert into public.members(id,display_name,role,approved)
  values(uid,name,invitation.role,true)
  on conflict(id) do update set approved=true
    where members.role=excluded.role
  returning * into result;
  if result.id is null then
    raise exception '이미 다른 역할로 가입된 계정입니다. 새 계정으로 가입해주세요.';
  end if;
  update private.invite_codes set uses_count=uses_count+1 where code_hash=invitation.code_hash;
  return result;
end;
$$;
-- 기존 함수의 EXECUTE 권한은 유지하며 초대 코드 테이블은 클라이언트에 공개하지 않는다.
