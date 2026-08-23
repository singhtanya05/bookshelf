-- Run this if you saw: "column public_catalogue.created_at does not exist"
--
-- Catalogue.ts asks for the newest books last (order by created_at) on every
-- path, but the public_catalogue view never selected that column — it only
-- existed on the underlying books table. Anonymous/demo loads broke; member
-- loads (reading the real books table) never hit this. Safe to re-run.

drop view if exists public_catalogue;

create view public_catalogue
with (security_invoker = off) as
  select id, title, author, category, format, spine_color, cover_path,
         is_public, public_path, created_at
  from books;

revoke all on public_catalogue from anon, authenticated;
grant select on public_catalogue to anon, authenticated;

-- Verify:
select 'public_catalogue has created_at' as check,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'public_catalogue'
  and column_name = 'created_at';
