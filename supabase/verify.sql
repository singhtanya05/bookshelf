-- Paste into the Supabase SQL Editor and Run. Every row should say PASS.
-- If anything says FAIL, the migration did not fully apply — re-run
-- migrations/0001_init.sql before continuing.

select 'tables' as check,
       case when count(*) = 4 then 'PASS' else 'FAIL (found ' || count(*) || ' of 4)' end as result,
       string_agg(tablename, ', ' order by tablename) as detail
from pg_tables
where schemaname = 'public'
  and tablename in ('members','books','reading_progress','annotations')

union all

select 'rls enabled',
       case when bool_and(rowsecurity) then 'PASS' else 'FAIL' end,
       string_agg(tablename || '=' || rowsecurity::text, ', ' order by tablename)
from pg_tables
where schemaname = 'public'
  and tablename in ('members','books','reading_progress','annotations')

union all

select 'policies',
       case when count(*) >= 12 then 'PASS' else 'FAIL (found ' || count(*) || ')' end,
       count(*)::text || ' policies'
from pg_policies where schemaname = 'public'

union all

select 'views',
       case when count(*) = 2 then 'PASS' else 'FAIL (found ' || count(*) || ' of 2)' end,
       string_agg(viewname, ', ' order by viewname)
from pg_views
where schemaname = 'public' and viewname in ('public_catalogue','public_files')

union all

-- The critical one: the public view must NOT expose storage_key.
select 'storage_key hidden from public view',
       case when count(*) = 0 then 'PASS' else 'FAIL — storage_key IS EXPOSED' end,
       coalesce(string_agg(column_name, ', '), 'not present, correct')
from information_schema.columns
where table_schema = 'public'
  and table_name = 'public_catalogue'
  and column_name = 'storage_key'

union all

select 'realtime',
       case when count(*) = 2 then 'PASS' else 'WARN (found ' || count(*) || ' of 2)' end,
       coalesce(string_agg(tablename, ', '), 'none')
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('annotations','reading_progress')

union all

select 'is_member() exists',
       case when count(*) = 1 then 'PASS' else 'FAIL' end,
       count(*)::text
from pg_proc where proname = 'is_member';
