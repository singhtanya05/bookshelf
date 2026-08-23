# shelf-vault (not in use)

This Worker fronts a Cloudflare R2 bucket. **The app does not use it.**
Storage currently runs on Supabase (1GB free, no payment method required).

Keep it for the day the library outgrows 1GB — roughly 800 EPUBs at the
current 1.26MB average. Migrating then means:

1. Create the R2 bucket and deploy this Worker
2. Copy objects from Supabase Storage into R2, preserving `storage_key`
3. Point `BookVault.resolveUrl` at the Worker instead of `createSignedUrl`
4. Set `VITE_VAULT_URL`

The catalogue, accounts, annotations, and reading positions are untouched by
that move — only where the bytes live changes.
