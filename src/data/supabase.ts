import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isConfigured } from './config';

let client: SupabaseClient | null = null;

/** Null until the backend is configured, so the app can run standalone. */
export function db(): SupabaseClient | null {
  if (!isConfigured) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
