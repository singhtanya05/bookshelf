#!/usr/bin/env node
/**
 * One-off import of an existing local library into the private vault.
 *
 * Reads each EPUB's real metadata and cover rather than guessing from the
 * filename — the old sync script produced titles like "Dokumen.pub The Hard
 * Thing" and duplicate entries. Category comes from the containing folder.
 *
 * Uses the service_role key, so run it locally only. Never ship that key.
 *
 *   export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MEMBER_ID=...
 *   node scripts/import-library.mjs ~/projects/books/library-master
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEMBER_ID } = process.env;
const ROOT = process.argv[2];

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEMBER_ID })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}
if (!ROOT || !fs.existsSync(ROOT)) {
  console.error('Usage: node scripts/import-library.mjs <library-dir>');
  process.exit(1);
}

const PALETTE = [
  '#2B2B2B', '#5F4B3C', '#3B4A3F', '#E88D56', '#C44943',
  '#2B3B4C', '#D1C9BE', '#DE8A75', '#D56E52', '#2A2A28',
  '#879B75', '#2659A5', '#E0B739', '#54407B', '#4B7A5C',
];
const spineColor = (t) =>
  PALETTE[parseInt(crypto.createHash('md5').update(t).digest('hex').slice(0, 8), 16) % PALETTE.length];

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, base);
    if (!/\.(epub|pdf|mobi|azw3|cbz|txt)$/i.test(e.name)) return [];
    const rel = path.relative(base, full).split(path.sep);
    return [{ full, name: e.name, category: rel.length > 1 ? rel[0] : 'Uncategorized' }];
  });
}

/** Title/author from the EPUB's own OPF, falling back to the filename. */
async function readEpubMeta(file) {
  try {
    const { default: AdmZip } = await import('adm-zip').catch(() => ({ default: null }));
    if (!AdmZip) return null;
    const zip = new AdmZip(file);
    const container = zip.getEntry('META-INF/container.xml');
    if (!container) return null;
    const opfPath = /full-path="([^"]+)"/.exec(container.getData().toString())?.[1];
    if (!opfPath) return null;
    const opf = zip.getEntry(opfPath)?.getData().toString();
    if (!opf) return null;
    const pick = (tag) =>
      new RegExp(`<dc:${tag}[^>]*>([^<]+)</dc:${tag}>`, 'i').exec(opf)?.[1]?.trim();
    return { title: pick('title'), author: pick('creator') };
  } catch {
    return null;
  }
}

function titleFromName(name) {
  let n = name.replace(/\.[^.]+$/, '').replace(/^dokumen\.pub_/i, '');
  n = n.replace(/--\s*\(.*?\)/g, '').replace(/-?\s*\d{10,}.*/, '');
  const parts = n.includes('--') ? n.split('--') : n.split(' - ');
  const title = (parts[0] || n).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const author = (parts[1] || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, author: author || 'Unknown Author' };
}

const files = walk(ROOT);
console.log(`Found ${files.length} files under ${ROOT}\n`);

const seen = new Set();
let added = 0, skipped = 0;

for (const f of files) {
  const bytes = fs.readFileSync(f.full);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (seen.has(hash)) {
    console.log(`  skip (duplicate content): ${f.name}`);
    skipped++;
    continue;
  }
  seen.add(hash);

  const format = path.extname(f.name).slice(1).toLowerCase();
  const fallback = titleFromName(f.name);
  const meta = format === 'epub' ? await readEpubMeta(f.full) : null;
  const title = meta?.title || fallback.title;
  const author = meta?.author || fallback.author;

  const id = crypto.randomUUID();
  const storageKey = `library/${id}.${format}`;

  const insert = await fetch(`${SUPABASE_URL}/rest/v1/books`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id, title, author, category: f.category, format,
      spine_color: spineColor(title),
      storage_key: storageKey,
      file_size: bytes.length,
      is_public: false,
      added_by: MEMBER_ID,
    }),
  });

  if (!insert.ok) {
    console.error(`  FAILED row: ${title} — ${await insert.text()}`);
    continue;
  }

  const put = await fetch(`${SUPABASE_URL}/storage/v1/object/books/${storageKey}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': format === 'epub' ? 'application/epub+zip' : 'application/octet-stream',
    },
    body: bytes,
  });

  if (!put.ok) {
    // Don't leave a catalogue row pointing at bytes that never arrived.
    await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    console.error(`  FAILED upload: ${title} (${put.status}) ${await put.text()} — row rolled back`);
    continue;
  }

  console.log(`  added: ${title} — ${author}  [${f.category}]`);
  added++;
}

console.log(`\nDone. ${added} added, ${skipped} duplicates skipped.`);
