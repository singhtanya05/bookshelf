# Setup

The app runs without any of this — it renders the shelf and reads the
public-domain demo. Everything below turns it into a private library for two.

Everything here is free, and no payment method is required anywhere.

---

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. **SQL Editor** → run `supabase/migrations/0001_init.sql`
3. **SQL Editor** → run `supabase/migrations/0002_supabase_storage.sql`
4. **SQL Editor** → run `supabase/verify.sql`. Every row should say `PASS`.

The row to care about is *"storage_key hidden from public view"*. The whole
privacy model rests on it: an anonymous visitor reads a view that has no such
column, so there is no path in the page for anyone to follow.

---

## 2. Buckets

**Storage → New bucket**, twice:

| | `books` | `covers` |
|---|---|---|
| Public bucket | **OFF** | **ON** |
| Restrict file size | 50 MB | 5 MB |
| Restrict MIME types | see below | `image/jpeg`, `image/png` |

Book MIME types:

```
application/epub+zip
application/pdf
application/vnd.comicbook+zip
text/plain
application/octet-stream
```

`application/octet-stream` is required: browsers don't recognise `.mobi` or
`.azw3` and send them as that. It makes the filter loose, but the filter was
never the security boundary — the bucket policies in `0002` are.

50MB is also the free plan's per-file ceiling, so it cannot go higher.

---

## 3. The two accounts

**Authentication → Providers** → make sure **Email** is enabled.

**Authentication → Users → Add user → Create new user**, twice — one for
**Tee**, one for **Vee**. Tick **Auto Confirm User** both times, or the
account stays unverified and cannot sign in.

Then **turn new signups OFF** (Authentication → Sign In / Providers). After
that only you can add accounts.

---

## 4. Grant membership

Copy both UUIDs from the Users list, then:

```bash
cp supabase/seed.members.template.sql supabase/seed.members.sql
```

Fill in the two UUIDs — first line Tee, second Vee — and run it in the SQL
Editor. Check with `select display_name, color from members;`

**This is the step that grants access.** The accounts can sign in without it
and still see nothing: membership is a row only an existing member can create,
so a stranger who somehow signs up gets a session and shelf art, nothing more.

`seed.members.sql` is gitignored — this repo is public and account identifiers
do not belong in it.

---

## 5. Keys

**Settings → API**. Take the **Project URL** and the **anon / public** key
(newer projects label it `sb_publishable_…`).

```bash
cp .env.example .env.local
```

Fill in both values, then `npm run dev`. The yellow "backend not configured"
banner should disappear and **SIGN IN** should accept Tee's password.

> The anon key is *meant* to ship in the bundle — row-level security protects
> the data, not secrecy of that key. The **service_role** / `sb_secret_…` key
> is the opposite: it bypasses RLS entirely. It belongs only in GitHub Actions
> secrets, never in `.env.local` and never in the repo.

---

## 6. Deploy

GitHub → Settings → Secrets and variables → Actions:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(only for the conversion workflow)*

Push to `main`; the existing Pages workflow deploys as before. **The repo can
stay public** — it holds only code and the public-domain demo.

---

## 7. Import your existing books

Your 14 books are backed up at `~/projects/books/library-master`.

```bash
export SUPABASE_URL=https://xxxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...   # this script only
export MEMBER_ID=<Tee's uuid>
node scripts/import-library.mjs ~/projects/books/library-master
```

Reads each EPUB's real OPF metadata, skips byte-identical duplicates (3 of
your 17 files), and takes the category from the folder name.

---

## 8. Purge the books from git history

Deleting them in a commit is not enough — they stay reachable in older
commits, clones, and forks.

```bash
brew install git-filter-repo
./scripts/purge-books-from-history.sh
```

It refuses to run without a verified backup, takes a safety mirror, and stops
before pushing. The force-push is yours to run once you have checked it.

Afterwards: the old files stay live on Pages until the next deploy, and any
existing **fork** keeps its own copy — forks are outside your control.

---

## Capacity

1GB storage, 5GB/month bandwidth, 500MB database.

At your average EPUB of 1.26MB that is roughly **800 books**. Books are cached
in the browser after first open, so bandwidth is spent once per book per
device rather than per read.

If you outgrow it, `worker/README.md` covers moving the files to Cloudflare R2
(10GB free, free egress). Only `storage_key` changes — accounts, annotations,
and reading positions are untouched.

Free projects pause after ~7 days idle; `.github/workflows/keepalive.yml`
pings weekly to prevent that.

---

## Formats

| Format | Status |
|---|---|
| EPUB | Read directly |
| PDF | Read directly |
| MOBI / AZW3 | Uploads accepted, converted to EPUB by `convert-ebook.yml` |
| CBZ / TXT | Accepted by the schema; no reader yet |

**DRM-protected Kindle files cannot be read or converted by any of this.**
Only DRM-free files work.

---

## Who can see what

| | Visitor | Tee / Vee |
|---|---|---|
| Shelf, titles, authors, covers | Yes | Yes |
| Demo volume (public domain) | Yes | Yes |
| Any other book file | **No** | Yes |
| Storage keys / bucket paths | **Never sent** | Yes |
| Each other's highlights and notes | No | Yes |
| Each other's reading position | No | Yes |
| Upload | No | Yes |
| Supabase dashboard | No | **Owner only** |

Vee gets an app login, never database access. Even signed in, Postgres stops
them editing your annotations: writes are allowed only where
`user_id = auth.uid()`.
