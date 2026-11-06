begin;
select set_config('igloo.theme_a',gen_random_uuid()::text,true),set_config('igloo.theme_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
 (current_setting('igloo.theme_a')::uuid,'theme-a@reserved.test','authenticated','authenticated'),
 (current_setting('igloo.theme_b')::uuid,'theme-b@reserved.test','authenticated','authenticated');
insert into public.members(id,display_name,role,approved) values
 (current_setting('igloo.theme_a')::uuid,'테마 시험 A','student',true),
 (current_setting('igloo.theme_b')::uuid,'테마 시험 B','student',true);
select set_config('igloo.theme_home',(select id::text from public.igloos where owner_id is null order by id limit 1),true);
update public.igloos set owner_id=current_setting('igloo.theme_a')::uuid,claimed_at=now(),is_public=true where id=current_setting('igloo.theme_home')::integer;
set local role anon;
do $$ begin
 begin perform public.set_card_theme('rose');raise exception 'FAIL anon save';exception when insufficient_privilege then null;end;
 begin perform public.get_igloo_card_theme(0);raise exception 'FAIL anon read';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.theme_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if (public.get_igloo_card_theme(current_setting('igloo.theme_home')::integer)->>'unlocked')::boolean then raise exception 'FAIL initially unlocked';end if;
 begin perform public.set_card_theme('rose');raise exception 'FAIL locked save';exception when insufficient_privilege then null;end;
 begin update public.members set card_theme_unlocked_at=now() where id=auth.uid();raise exception 'FAIL direct unlock';exception when insufficient_privilege then null;end;
 begin update public.members set card_theme='mint' where id=auth.uid();raise exception 'FAIL direct theme';exception when insufficient_privilege then null;end;
 begin perform public.set_card_theme('unknown');raise exception 'FAIL invalid theme';exception when invalid_parameter_value then null;end;
end $$;
insert into public.projects(igloo_id,owner_id,title,url) values(current_setting('igloo.theme_home')::smallint,auth.uid(),'테마 해금 시험','https://example.com');
do $$ declare t text;begin
 if not (public.get_igloo_card_theme(current_setting('igloo.theme_home')::integer)->>'unlocked')::boolean then raise exception 'FAIL first project unlock';end if;
 foreach t in array array['rose','cream','graphite','mint','glass'] loop
   if public.set_card_theme(t)->>'theme'<>t then raise exception 'FAIL save theme';end if;
 end loop;
end $$;
delete from public.projects where owner_id=auth.uid();
do $$ begin
 if public.set_card_theme('mint')->>'theme'<>'mint' then raise exception 'FAIL permanent unlock';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.theme_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.get_igloo_card_theme(current_setting('igloo.theme_home')::integer)->>'theme'<>'mint' then raise exception 'FAIL visitor theme';end if;
 begin perform public.set_card_theme('rose');raise exception 'FAIL visitor changes owner setting';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.igloos set is_public=false where id=current_setting('igloo.theme_home')::integer;
set local role authenticated;
do $$ begin
 begin perform public.get_igloo_card_theme(current_setting('igloo.theme_home')::integer);raise exception 'FAIL private room read';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: theme unlock, permanent reward, allowlist, own preference, visitor read, private room, direct column protection' as verification;
rollback;
