/**
 * Triggers the MOBI/AZW3 → EPUB GitHub Action on a member's behalf.
 *
 * The GitHub PAT this needs (Actions: write) must never reach the browser —
 * a PAT in the bundle would let anyone holding the public anon key kick off
 * arbitrary workflow runs. It lives only as this function's server-side
 * secret.
 *
 * Membership is not re-implemented here. The caller's own JWT is used to
 * query `books` under RLS: a non-member's token gets zero rows back, same
 * as everywhere else in the app. One rule, enforced once, in Postgres.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GITHUB_PAT = Deno.env.get('GITHUB_PAT');
const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER');
const GITHUB_REPO = Deno.env.get('GITHUB_REPO');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
    return json({ ok: false, error: 'Conversion is not configured on the server yet.' }, 500);
  }

  let body: { book_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const bookId = body.book_id;
  if (!bookId || !UUID_RE.test(bookId)) {
    return json({ ok: false, error: 'A valid book id is required.' }, 400);
  }

  // Forward the caller's own token so Postgres RLS decides membership —
  // not a second copy of that rule living inside this function.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: book, error: bookErr } = await supabase
    .from('books')
    .select('id, format')
    .eq('id', bookId)
    .maybeSingle();

  if (bookErr || !book) {
    // RLS hides the row entirely from a non-member, so this one response
    // correctly covers both "not your book" and "no such book".
    return json({ ok: false, error: 'Not authorised, or no such book.' }, 403);
  }

  if (book.format !== 'mobi' && book.format !== 'azw3') {
    return json({ ok: false, error: 'This book is already in a readable format.' }, 400);
  }

  const dispatch = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/convert-ebook.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main', inputs: { book_id: bookId } }),
    },
  );

  // A successful dispatch returns 204 with no body.
  if (dispatch.status !== 204) {
    console.error('[convert-book] GitHub dispatch failed', dispatch.status, await dispatch.text().catch(() => ''));
    return json({ ok: false, error: `GitHub declined the request (${dispatch.status}).` }, 502);
  }

  return json({ ok: true }, 200);
});
