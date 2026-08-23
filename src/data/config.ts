/**
 * Runtime configuration.
 *
 * Every value here is safe to ship in the bundle. The Supabase anon key is
 * designed to be public — row-level security, not secrecy, is what protects
 * the data. There is no passcode and no storage path in this file, because
 * there is no longer a client-side secret to keep.
 */
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  /** Cloudflare Worker that gates the private bucket. */
  vaultUrl: (import.meta.env.VITE_VAULT_URL ?? '').replace(/\/$/, ''),
};

/** False before the cloud backend is wired up; the shelf still renders. */
export const isConfigured = Boolean(
  config.supabaseUrl && config.supabaseAnonKey && config.vaultUrl,
);
