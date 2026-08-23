# Setup

The app runs without any of this — it renders the shelf and reads the
public-domain demo. Everything below is what turns it into a private library
for two people.

Nothing here costs money. Where a free tier has a real limit, it is named.

---

## 1. Supabase — accounts and data

Handles sign-in, reading positions, and annotations. Not the book files.

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. **SQL Editor** → paste `supabase/migrations/0001_init.sql` → Run.
3. **Storage** → create a bucket named `covers`, marked **public**.
   Covers are thumbnails and are meant to be visible — that is the whole
   point of the shelf being browsable.
4. **Authentication → Providers** → enable Email.
   Turn **off** "Enable new user signups" once both of you have accounts.
   That closes the door behind you.
5. Create your two accounts (Authentication → Users → Add user).
6. Make them members. Membership is deliberately not self-serve — signing up
   is not enough to read anything. In the SQL Editor:

   ```sql
   insert into members (user_id, display_name, color) values
     ('<your-uuid>',   'Tanya',  '#E88D56'),
     ('<friend-uuid>', 'Friend', '#2659A5');
   ```

   The colours are what distinguish your highlights from theirs.

7. From **Settings → API**, note the **Project URL** and the **anon** key.

> The anon key belongs in the bundle — row-level security, not secrecy, is
> what protects the data. The **service_role** key must never go in the
> frontend, in `.env.local`, or in the repo.

**Free tier:** 500MB database, unlimited auth users. Projects pause after
~7 days idle; `.github/workflows/keepalive.yml` pings it weekly to prevent that.

---

## 2. Cloudflare — the book files

Books go here rather than Supabase Storage: **10GB free instead of 1GB, and
egress is free permanently.** Past 10GB it is $0.015/GB-month, so a 50GB
library costs about $0.75/month.

1. Create a Cloudflare account (free).
2. **R2** → create a bucket named `shelf-books`. Leave it **private**.
3. Deploy the Worker:

   ```bash
   cd worker
   npx wrangler login
   npx wrangler deploy
   ```

4. Set the Worker's variables (Workers → shelf-vault → Settings → Variables):

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | your Supabase project URL |
   | `SUPABASE_ANON_KEY` | your anon key |
   | `ALLOWED_ORIGINS` | `https://singhtanya05.github.io,http://localhost:5173` |

5. Note the Worker URL (`https://shelf-vault.<subdomain>.workers.dev`).

The Worker never holds a JWT secret or an S3 credential. It forwards your
token to Supabase and lets row-level security decide whether you get the file.

---

## 3. Wire it together

**Local** — copy `.env.example` to `.env.local` and fill in the three values.

**GitHub** — Settings → Secrets and variables → Actions, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAULT_URL`

Push to `main` and the existing Pages workflow deploys as before. **The repo
can stay public** — it now contains only code and the public-domain demo.

---

## 4. Import your existing books

Your 14 books are backed up at `~/projects/books/library-master`.

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...   # this script only, never the frontend
export VAULT_URL=...
export MEMBER_ID=<your-uuid>
node scripts/import-library.mjs ~/projects/books/library-master
```

It reads each file's real metadata and cover, uploads to R2, and writes the
catalogue rows. Category comes from the folder name.

---

## 5. Purge the books from git history

Deleting them in a commit is not enough — they stay reachable in older
commits, clones, and forks.

```bash
brew install git-filter-repo
./scripts/purge-books-from-history.sh
```

It refuses to run unless the backup exists, takes a safety mirror, and stops
before pushing. The force-push is yours to run once you have checked it.

Afterwards the old files stay live on Pages until the next deploy, and any
existing **fork** keeps its own copy — forks are outside your control.

---

## Formats

| Format | Status |
|---|---|
| EPUB | Read directly |
| PDF  | Read directly |
| MOBI / AZW3 | Uploads accepted, converted to EPUB by `convert-ebook.yml` |
| CBZ / TXT | Accepted by the schema; no reader yet |

Run the conversion from Actions → *Convert MOBI/AZW3 to EPUB* with the book's
catalogue id.

**DRM-protected Kindle files cannot be read or converted by any of this.**
Only DRM-free files work.

---

## Who can see what

| | Anonymous visitor | Member |
|---|---|---|
| 3D shelf, titles, authors, covers | Yes | Yes |
| Demo volume (public domain) | Yes | Yes |
| Any other book file | **No** | Yes |
| Storage paths / bucket names | **Never sent** | Yes |
| Everyone's highlights and notes | No | Yes |
| Everyone's reading position | No | Yes |
| Upload | No | Yes |

A visitor reading the page source finds no book URL, because the public
catalogue view has no `storage_key` column to leak.
