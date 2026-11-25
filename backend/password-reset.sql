-- 2026-11-25 운영 적용 완료: add_owner_managed_password_reset. 서버 API만 실행하며 실제 비밀번호는 Auth Admin API에서 변경한다.
create table private.password_reset_requests (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id),
 login text not null check (login ~ '^[a-z0-9_]{3,20}$'),
 status text not null default 'pending' check(status in ('pending','issued','processing','completed','rejected','locked')),
 created_at timestamptz not null default now(),
 processed_by uuid references public.members(id),
 token_hash text, expires_at timestamptz, attempts integer not null default 0,
 claim text, claimed_at timestamptz,
 check(token_hash is null or token_hash ~ '^[0-9a-f]{64}$')
);
create unique index password_reset_one_active on private.password_reset_requests(member_id) where status in ('pending','issued','processing','locked');
create index password_reset_by_login on private.password_reset_requests(login,created_at desc);
alter table private.password_reset_requests enable row level security;
revoke all on private.password_reset_requests from public,anon,authenticated;
create table private.password_reset_limits(bucket text,action text,hits integer not null,started_at timestamptz not null,primary key(bucket,action));
alter table private.password_reset_limits enable row level security;
revoke all on private.password_reset_limits from public,anon,authenticated;

create function public.password_reset_rate_limit(p_bucket text,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare count_hits integer;
begin
 if p_bucket !~ '^[0-9a-f]{64}$' or p_action not in ('request','list','issue','reject','redeem') then return false;end if;
 insert into private.password_reset_limits as t values(p_bucket,p_action,1,now())
 on conflict(bucket,action) do update set hits=case when t.started_at<now()-interval '1 hour' then 1 else t.hits+1 end,
 started_at=case when t.started_at<now()-interval '1 hour' then now() else t.started_at end returning hits into count_hits;
 return count_hits<=case when p_action='request' then 10 when p_action='redeem' then 20 else 600 end;
end $$;

create function public.request_password_reset(p_login text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if p_login !~ '^[a-z0-9_]{3,20}$' then return;end if;
 select m.id into target from auth.users u join public.members m on m.id=u.id where u.email=p_login||'@igloo-village.eldi96.github.io' and m.approved;
 if target is null then return;end if;
 -- 같은 계정의 요청을 직렬화하고 계정 존재 여부는 반환하지 않는다.
 perform pg_advisory_xact_lock(hashtextextended(p_login,61829));
 if exists(select 1 from private.password_reset_requests where login=p_login and (created_at>now()-interval '15 minutes' or status in ('pending','issued','processing','locked'))) then return;end if;
 insert into private.password_reset_requests(member_id,login) values(target,p_login);
end $$;

create function private.is_password_reset_admin(p_admin uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.members m on m.id=u.id where u.id=p_admin and u.email='eldi@igloo-village.eldi96.github.io' and m.approved);
$$;
revoke all on function private.is_password_reset_admin(uuid) from public,anon,authenticated;
create function public.password_reset_admin_authorized(p_admin uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.is_password_reset_admin(p_admin); $$;
create function public.list_password_reset_requests(p_admin uuid) returns table(id uuid,login text,display_name text,status text,created_at timestamptz,expires_at timestamptz,claimed_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_password_reset_admin(p_admin) then raise insufficient_privilege;end if;
 return query select r.id,r.login,m.display_name,r.status,r.created_at,r.expires_at,r.claimed_at from private.password_reset_requests r join public.members m on m.id=r.member_id order by r.created_at desc limit 100;
end $$;

create function public.issue_password_reset(p_id uuid,p_hash text,p_admin uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false;end if;
 -- 관리 계정은 기존 로그인 ID로 확인하되 클라이언트에서 전달한 이름은 신뢰하지 않는다.
 if not private.is_password_reset_admin(p_admin) then raise insufficient_privilege;end if;
 update private.password_reset_requests set token_hash=p_hash,expires_at=now()+interval '30 minutes',attempts=0,status='issued',processed_by=p_admin,claim=null,claimed_at=null
 where id=p_id and (status in ('pending','issued','locked') or (status='processing' and claimed_at<now()-interval '5 minutes'));
 get diagnostics changed=row_count;return changed=1;
end $$;

create function public.reject_password_reset(p_id uuid,p_admin uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_password_reset_admin(p_admin) then raise insufficient_privilege;end if;
 update private.password_reset_requests set status='rejected',token_hash=null,claim=null,processed_by=p_admin where id=p_id and status in ('pending','issued','locked');
end $$;

create function public.claim_password_reset(p_login text,p_hash text,p_claim text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r private.password_reset_requests%rowtype;
begin
 if p_claim is null or p_claim !~ '^[0-9a-f]{48}$' then return null;end if;
 select * into r from private.password_reset_requests where login=p_login and status='issued' order by created_at desc limit 1 for update;
 if not found or r.expires_at<=now() or r.attempts>=5 then return null;end if;
 if r.token_hash is distinct from p_hash then
 update private.password_reset_requests set attempts=attempts+1,status=case when attempts+1>=5 then 'locked' else status end where id=r.id;return null;
 end if;
 update private.password_reset_requests set status='processing',claim=p_claim,claimed_at=now() where id=r.id;
 return r.member_id;
end $$;

create function public.finish_password_reset(p_login text,p_claim text,p_success boolean) returns void
language sql security definer set search_path='' as $$
 update private.password_reset_requests set status=case when p_success then 'completed' else 'issued' end,
 token_hash=case when p_success then null else token_hash end,claim=null,claimed_at=null
 where login=p_login and claim=p_claim and status='processing';
$$;
-- 공개 클라이언트에서는 함수를 직접 실행할 수 없다.
revoke all on function public.password_reset_rate_limit(text,text),public.request_password_reset(text),public.list_password_reset_requests(uuid),public.password_reset_admin_authorized(uuid),public.issue_password_reset(uuid,text,uuid),public.reject_password_reset(uuid,uuid),public.claim_password_reset(text,text,text),public.finish_password_reset(text,text,boolean) from public,anon,authenticated;
grant execute on function public.password_reset_rate_limit(text,text),public.request_password_reset(text),public.list_password_reset_requests(uuid),public.password_reset_admin_authorized(uuid),public.issue_password_reset(uuid,text,uuid),public.reject_password_reset(uuid,uuid),public.claim_password_reset(text,text,text),public.finish_password_reset(text,text,boolean) to service_role;
