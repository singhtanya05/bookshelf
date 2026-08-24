-- Removes the accidental "demo" book (title='demo', category='_unsorted').
-- It's a stray copy of demo.epub that got swept into the library-master
-- backup and re-imported as its own catalogue row. The real public demo
-- (Alice's Adventures in Wonderland) is untouched by this.

-- 1) Confirm it's the right one before deleting.
select id, title, author, category, storage_key
from books
where title = 'demo' and category = '_unsorted';

-- 2) Delete the row. (Run this only after confirming step 1 looks right.)
delete from books
where title = 'demo' and category = '_unsorted';
