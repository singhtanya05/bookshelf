-- Run this if you saw: "column public_catalogue.public_path does not exist"
-- That means 0002_supabase_storage.sql did not fully apply — most likely it
-- was run before 0001, or an earlier statement in it errored and the rest
-- was skipped. This block is safe to run again regardless of what state
-- you're in: every statement is idempotent.

-- 1) Confirm the column actually exists on the base table.
alter table books add column if not exists public_path text;

-- 2) Force the view to be dropped and rebuilt, rather than relying on
--    CREATE OR REPLACE (which can silently no-op in odd states).
drop view if exists public_catalogue;

create view public_catalogue
with (security_invoker = off) as
  select id, title, author, category, format, spine_color, cover_path,
         is_public, public_path, created_at
  from books;

revoke all on public_catalogue from anon, authenticated;
grant select on public_catalogue to anon, authenticated;

-- 3) Same treatment for public_files, in case it has the same problem.
drop view if exists public_files;

create view public_files
with (security_invoker = off) as
  select id, storage_key, format
  from books
  where is_public;

revoke all on public_files from anon, authenticated;
grant select on public_files to anon, authenticated;

-- 4) Re-seed the demo row (upsert, safe to repeat).
insert into books (id, title, author, category, format, spine_color,
                   storage_key, is_public, public_path)
values ('00000000-0000-4000-8000-000000000001',
        'Alice''s Adventures in Wonderland', 'Lewis Carroll',
        'Public Domain', 'epub', '#5F4B3C',
        'site:demo', true, 'books/demo.epub')
on conflict (id) do update
  set is_public   = true,
      public_path = excluded.public_path,
      title       = excluded.title,
      author      = excluded.author;

-- 5) Verify. Both should say PASS.
select 'public_catalogue has public_path' as check,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'public_catalogue'
  and column_name = 'public_path'

union all

select 'demo row has public_path set',
       case when public_path = 'books/demo.epub' then 'PASS' else 'FAIL' end
from books where id = '00000000-0000-4000-8000-000000000001';
