begin;
select set_config('igloo.ca',gen_random_uuid()::text,true),
set_config('igloo.cb',gen_random_uuid()::text,true),
set_config('igloo.cp',gen_random_uuid()::text,true),
set_config('igloo.cp2',gen_random_uuid()::text,true),
set_config('igloo.cr',gen_random_uuid()::text,true),
set_config('igloo.reply',gen_random_uuid()::text,true);
select set_config('igloo.ch',(select id::text from public.igloos where owner_id is null order by id limit 1),true);
do $$ begin if current_setting('igloo.ch',true) is null then raise exception 'No free fixture home'; end if; end $$;
insert into auth.users(id,email,aud,role) values
(current_setting('igloo.ca')::uuid,'reply-a-'||current_setting('igloo.ca')||'@test.invalid','authenticated','authenticated'),
(current_setting('igloo.cb')::uuid,'reply-b-'||current_setting('igloo.cb')||'@test.invalid','authenticated','authenticated');
insert into public.members(id,display_name,role,approved) values
(current_setting('igloo.ca')::uuid,'reply test A','student',true),
(current_setting('igloo.cb')::uuid,'reply test B','student',true);
update public.igloos set owner_id=current_setting('igloo.ca')::uuid,is_public=true,claimed_at=now() where id=current_setting('igloo.ch')::smallint and owner_id is null;
insert into public.projects(id,igloo_id,owner_id,title,url) values
(current_setting('igloo.cp')::uuid,current_setting('igloo.ch')::smallint,current_setting('igloo.ca')::uuid,'reply test','https://example.test'),
(current_setting('igloo.cp2')::uuid,current_setting('igloo.ch')::smallint,current_setting('igloo.ca')::uuid,'other test','https://example.test');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.ca'),'role','authenticated')::text,true);
set local role authenticated;
with saved as (insert into public.project_comments(project_id,member_id,body) values
(current_setting('igloo.cp')::uuid,auth.uid(),'root') returning id) select set_config('igloo.cr',(select id::text from saved),true);
do $$ begin if exists(select 1 from public.comment_notifications where project_id=current_setting('igloo.cp')::uuid) then raise exception 'FAIL self notification'; end if; end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.cb'),'role','authenticated')::text,true);
set local role authenticated;
with saved as (insert into public.project_comments(project_id,member_id,body,parent_id) values
(current_setting('igloo.cp')::uuid,auth.uid(),'reply',current_setting('igloo.cr')::uuid) returning id) select set_config('igloo.reply',(select id::text from saved),true);
do $$ declare n integer; begin
  if exists(select 1 from public.comment_notifications where project_id=current_setting('igloo.cp')::uuid) then raise exception 'FAIL other recipient read'; end if;
  update public.comment_notifications set read_at=now() where project_id=current_setting('igloo.cp')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL foreign notification update'; end if;
  if not exists(select 1 from public.get_unread_mailbox_homes() where igloo_id=current_setting('igloo.ch')::smallint) then raise exception 'FAIL visitor glow'; end if;
  begin
    insert into public.comment_notifications(recipient_id,project_id,comment_id) values(auth.uid(),current_setting('igloo.cp')::uuid,current_setting('igloo.cr')::uuid);
    raise exception 'FAIL fake notification';
  exception when insufficient_privilege then null; end;
  update public.project_comments set body='',deleted_at=now() where id=current_setting('igloo.cr')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL foreign delete'; end if;
  begin
    update public.project_comments set body='edit' where id=current_setting('igloo.reply')::uuid;
    raise exception 'FAIL arbitrary edit';
  exception when check_violation then null; end;
  begin
    insert into public.project_comments(project_id,member_id,body,parent_id)
    values(current_setting('igloo.cp2')::uuid,auth.uid(),'cross',current_setting('igloo.cr')::uuid);
    raise exception 'FAIL cross-project';
  exception when check_violation then null; end;
  begin
    insert into public.project_comments(project_id,member_id,body,parent_id)
    values(current_setting('igloo.cp')::uuid,auth.uid(),'nested',current_setting('igloo.reply')::uuid);
    raise exception 'FAIL nested';
  exception when check_violation then null; end;
  begin
    insert into public.project_comments(project_id,member_id,body)
    values(current_setting('igloo.cp')::uuid,current_setting('igloo.ca')::uuid,'spoof');
    raise exception 'FAIL spoof';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.ca'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.comment_notifications where project_id=current_setting('igloo.cp')::uuid and read_at is null)<>1 then raise exception 'FAIL reply notification'; end if;
end $$;
update public.comment_notifications set read_at=now() where project_id=current_setting('igloo.cp')::uuid;
do $$ begin
 if exists(select 1 from public.comment_notifications where project_id=current_setting('igloo.cp')::uuid and read_at is null) then raise exception 'FAIL notification read'; end if;
 if exists(select 1 from public.get_unread_mailbox_homes() where igloo_id=current_setting('igloo.ch')::smallint) then raise exception 'FAIL glow not cleared'; end if;
end $$;
update public.project_comments set body='',deleted_at=now() where id=current_setting('igloo.cr')::uuid;
do $$ begin
  if not exists(select 1 from public.project_comments where id=current_setting('igloo.cr')::uuid and deleted_at is not null and body='') then raise exception 'FAIL tombstone'; end if;
  if not exists(select 1 from public.project_comments where id=current_setting('igloo.reply')::uuid and body='reply') then raise exception 'FAIL reply lost'; end if;
  begin
    insert into public.project_comments(project_id,member_id,body,parent_id)
    values(current_setting('igloo.cp')::uuid,auth.uid(),'deleted parent',current_setting('igloo.cr')::uuid);
    raise exception 'FAIL deleted parent';
  exception when check_violation then null; end;
end $$;
update public.igloos set is_public=false where id=current_setting('igloo.ch')::smallint;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.cb'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; begin
  if exists(select 1 from public.project_comments where project_id=current_setting('igloo.cp')::uuid) then raise exception 'FAIL private read'; end if;
  update public.project_comments set body='',deleted_at=now() where id=current_setting('igloo.reply')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL private delete'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.ca'),'role','authenticated')::text,true);
set local role authenticated;
update public.igloos set is_public=true where id=current_setting('igloo.ch')::smallint;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.cb'),'role','authenticated')::text,true);
set local role authenticated;
update public.project_comments set body='',deleted_at=now() where id=current_setting('igloo.reply')::uuid;
do $$ begin
  if not exists(select 1 from public.project_comments where id=current_setting('igloo.reply')::uuid and body='' and deleted_at is not null) then raise exception 'FAIL own reply delete'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.comment_notifications where project_id=current_setting('igloo.cp')::uuid) then raise exception 'FAIL deleted comment notification cleanup'; end if;
end $$;
set local role anon;
do $$ begin
 perform * from public.get_unread_mailbox_homes();
 begin perform * from public.comment_notifications; raise exception 'FAIL anon notification read'; exception when insufficient_privilege then null; end;
 begin perform * from public.project_comments; raise exception 'FAIL anon read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: replies, soft deletion, ownership, project isolation, one level, visibility; fixtures rolled back' as result;
