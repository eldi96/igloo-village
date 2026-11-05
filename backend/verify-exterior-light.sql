begin;
select set_config('igloo.light_user',gen_random_uuid()::text,true),set_config('igloo.light_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values(current_setting('igloo.light_user')::uuid,'light@reserved.test','authenticated','authenticated'),(current_setting('igloo.light_other')::uuid,'light-other@reserved.test','authenticated','authenticated');
insert into public.members(id,display_name,role,approved) values(current_setting('igloo.light_user')::uuid,'불빛 시험','student',true),(current_setting('igloo.light_other')::uuid,'다른 사용자','student',true);
select set_config('igloo.light_home',(select id::text from public.igloos where owner_id is null order by id limit 1),true);
update public.igloos set owner_id=current_setting('igloo.light_user')::uuid,claimed_at=now() where id=current_setting('igloo.light_home')::integer;
set local role anon;
do $$ begin
 begin perform public.set_exterior_light('blue');raise exception 'FAIL anon save';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.light_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.set_exterior_light('blue');raise exception 'FAIL locked';exception when insufficient_privilege then null;end;
 begin update public.igloos set exterior_light='blue' where owner_id=auth.uid();raise exception 'FAIL direct color update';exception when insufficient_privilege then null;end;
 begin update public.members set exterior_light_unlocked_at=now() where id=auth.uid();raise exception 'FAIL direct unlock';exception when insufficient_privilege then null;end;
 begin perform public.set_exterior_light('pink');raise exception 'FAIL invalid color';exception when invalid_parameter_value then null;end;
end $$;
insert into public.projects(igloo_id,owner_id,title,url) values(current_setting('igloo.light_home')::smallint,auth.uid(),'첫 번째','https://example.com');
do $$ begin
 if (public.get_exterior_light()->>'unlocked')::boolean then raise exception 'FAIL one project unlock';end if;
end $$;
insert into public.projects(igloo_id,owner_id,title,url) values(current_setting('igloo.light_home')::smallint,auth.uid(),'두 번째','https://example.com');
do $$ begin
 if public.set_exterior_light('blue')->>'color'<>'blue' then raise exception 'FAIL two project unlock';end if;
end $$;
delete from public.projects where owner_id=auth.uid();
do $$ begin
 if public.set_exterior_light('warm')->>'color'<>'warm' then raise exception 'FAIL return warm';end if;
 if public.set_exterior_light('blue')->>'color'<>'blue' then raise exception 'FAIL permanent unlock';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.light_other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.set_exterior_light('blue');raise exception 'FAIL other locked user';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 if (select exterior_light from public.igloos where id=current_setting('igloo.light_home')::integer)<>'blue' then raise exception 'FAIL public map color';end if;
end $$;
reset role;
update public.igloos set owner_id=null,claimed_at=null where id=current_setting('igloo.light_home')::integer;
do $$ begin
 if (select exterior_light from public.igloos where id=current_setting('igloo.light_home')::integer)<>'warm' then raise exception 'FAIL ownership reset';end if;
end $$;
select 'PASS: second project, persistent unlock, warm return, public map, direct grants, ownership reset' as verification;
rollback;
