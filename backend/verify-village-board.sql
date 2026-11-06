-- 읽기 전용 정적 권한 검사. 실제 계정 간 작성/삭제 테스트는 별도로 진행.
select
  'table privileges' as check_name,
  not has_table_privilege('anon', 'public.village_board_posts', 'SELECT')
    and not has_table_privilege('authenticated', 'public.village_board_posts', 'SELECT')
    and not has_table_privilege('authenticated', 'public.village_board_posts', 'DELETE') as pass;
select
  'RPC privileges' as check_name,
  has_function_privilege('anon','public.list_village_board_posts(integer,timestamptz,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.create_village_board_post(text)','EXECUTE')
    and not has_function_privilege('anon','public.delete_village_board_post(uuid)','EXECUTE')
    and has_function_privilege('authenticated','public.create_village_board_post(text)','EXECUTE')
    and has_function_privilege('authenticated','public.delete_village_board_post(uuid)','EXECUTE') as pass;
select 'RLS enabled' as check_name, relrowsecurity as pass
from pg_class where oid = 'public.village_board_posts'::regclass;
select 'public list RPC excludes author_id' as check_name,
  position('author_id' in pg_get_function_result('public.list_village_board_posts(integer,timestamptz,uuid)'::regprocedure)) = 0 as pass;
