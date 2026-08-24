-- Removes the 3 duplicate "Naval Ravikant" rows stuck in mobi format from
-- repeated upload attempts while the conversion trigger was broken.

-- 1) Confirm these are the right rows before deleting.
select id, title, format, storage_key, created_at
from books
where title ilike '%naval ravikant%'
order by created_at;

-- 2) Delete the catalogue rows. (Run only after step 1 looks right.)
delete from books
where title ilike '%naval ravikant%';
