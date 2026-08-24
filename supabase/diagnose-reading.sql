-- Run this in the SQL Editor while signed in as project owner (not via the
-- app). Paste back all three result sets.

-- 1) Do the buckets exist with the exact names the code expects, and is
--    `books` actually private? A typo'd name (Books, book, etc.) fails
--    silently in a way that looks like "can't read".
select id as bucket_name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('books', 'covers');

-- 2) Your imported books: does each row have a real storage_key, and does
--    an object with that exact key exist in the bucket? A mismatch here —
--    row exists, file doesn't, or vice versa — is the second likely cause.
select b.id, b.title, b.format, b.storage_key,
       (o.name is not null) as file_exists_in_bucket
from books b
left join storage.objects o
  on o.bucket_id = 'books' and o.name = b.storage_key
where b.is_public = false
order by b.created_at;

-- 3) The policies from migration 0002 — confirm they exist on
--    storage.objects, not just on the `books` table.
select policyname, cmd, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
