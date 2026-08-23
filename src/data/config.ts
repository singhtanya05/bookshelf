/**
 * Runtime configuration.
 *
 * Every value here is safe to ship in the bundle. The Supabase anon key is
 * designed to be public — row-level security, not secrecy, is what protects
 * the data. There is no passcode and no storage path in this file, because
 * there is no longer a client-side secret to keep.
 */

/**
 * A freshly copied .env.example still holds its placeholders. Treating those
 * as real config sends the app off to resolve YOUR-PROJECT.supabase.co and
 * leaves a blank shelf with no explanation, so they count as unset.
 */
const PLACEHOLDERS = /YOUR-PROJECT|your-anon-key|YOUR-SUBDOMAIN|xxxxx/i;

function realValue(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  return v && !PLACEHOLDERS.test(v) ? v : '';
}

export const config = {
  supabaseUrl: realValue(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: realValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
};

/** False before the cloud backend is wired up; the shelf still renders. */
export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** True when the file exists but still holds template values. */
export const isPlaceholderConfig =
  !isConfigured &&
  Boolean(
    (import.meta.env.VITE_SUPABASE_URL ?? '').trim() ||
      (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  );
