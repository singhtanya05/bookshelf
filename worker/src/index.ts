/**
 * Shelf book vault.
 *
 * The only route to a book file. Nothing else may read the private bucket.
 *
 * Authorisation is deliberately NOT re-implemented here. The worker forwards
 * the caller's own Supabase token to PostgREST and lets row-level security
 * decide: if `storage_key` comes back, the caller is a member. One source of
 * truth, and the worker never holds a JWT secret or an S3 credential.
 */

export interface Env {
  BOOKS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string; // comma-separated
}

const MAX_UPLOAD = 100 * 1024 * 1024; // Workers request-body ceiling

function cors(env: Env, origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const ok = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin! : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/**
 * Ask PostgREST for the book as this caller. RLS returns a row only for
 * members; anonymous or non-member tokens get an empty array.
 */
async function resolveBook(
  env: Env,
  bookId: string,
  token: string,
): Promise<{ storage_key: string; format: string; title: string } | null> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/books` +
    `?id=eq.${encodeURIComponent(bookId)}` +
    `&select=storage_key,format,title`;

  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;

  const rows = (await res.json()) as Array<{ storage_key: string; format: string; title: string }>;
  return rows.length ? rows[0] : null;
}

/** The one public-domain book anyone may read, gated by is_public. */
async function resolvePublicBook(env: Env, bookId: string) {
  const url =
    `${env.SUPABASE_URL}/rest/v1/public_catalogue` +
    `?id=eq.${encodeURIComponent(bookId)}&is_public=is.true&select=id,format`;
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; format: string }>;
  return rows.length ? rows[0] : null;
}

function parseRange(header: string | null, size: number) {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return undefined;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return undefined;
  // suffix form: bytes=-500
  if (rawStart === '') return { suffix: Math.min(Number(rawEnd), size) };
  const offset = Number(rawStart);
  if (rawEnd === '') return { offset };
  return { offset, length: Number(rawEnd) - offset + 1 };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cx = cors(env, origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cx });

    const url = new URL(request.url);
    const match = /^\/book\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (!match) return json({ error: 'not found' }, 404, cx);
    const bookId = match[1];

    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    // -------------------------------------------------------------- upload --
    if (request.method === 'POST') {
      if (!token) return json({ error: 'sign in required' }, 401, cx);
      const book = await resolveBook(env, bookId, token);
      if (!book) return json({ error: 'not authorised' }, 403, cx);

      const len = Number(request.headers.get('Content-Length') ?? '0');
      if (len > MAX_UPLOAD) {
        return json({ error: 'file exceeds 100MB worker limit' }, 413, cx);
      }
      await env.BOOKS.put(book.storage_key, request.body, {
        httpMetadata: { contentType: request.headers.get('Content-Type') ?? 'application/octet-stream' },
      });
      return json({ ok: true, key: book.storage_key }, 200, cx);
    }

    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cx);

    // ------------------------------------------------------------ download --
    let storageKey: string | null = null;

    if (token) {
      const book = await resolveBook(env, bookId, token);
      if (book) storageKey = book.storage_key;
    }
    if (!storageKey) {
      // Fall back to the public-domain demo, which needs no session.
      const pub = await resolvePublicBook(env, bookId);
      if (pub) storageKey = `public/${pub.id}.${pub.format}`;
    }
    if (!storageKey) {
      // Same answer for "no such book" and "not your book": a stranger
      // probing ids learns nothing either way.
      return json({ error: 'not found' }, 404, cx);
    }

    const head = await env.BOOKS.head(storageKey);
    if (!head) return json({ error: 'not found' }, 404, cx);

    const range = parseRange(request.headers.get('Range'), head.size);
    const object = await env.BOOKS.get(storageKey, range ? { range } : undefined);
    if (!object || !object.body) return json({ error: 'not found' }, 404, cx);

    const headers: Record<string, string> = {
      ...cx,
      'Content-Type': head.httpMetadata?.contentType ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      // Never let an intermediary or the browser treat this as a download link.
      'Content-Disposition': 'inline',
    };

    if (range && object.range) {
      const r = object.range as { offset?: number; length?: number };
      const start = r.offset ?? 0;
      const length = r.length ?? head.size - start;
      headers['Content-Range'] = `bytes ${start}-${start + length - 1}/${head.size}`;
      headers['Content-Length'] = String(length);
      return new Response(object.body, { status: 206, headers });
    }

    headers['Content-Length'] = String(head.size);
    return new Response(object.body, { status: 200, headers });
  },
};
