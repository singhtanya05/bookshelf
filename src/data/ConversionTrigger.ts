import { FunctionsHttpError } from '@supabase/supabase-js';
import { db } from './supabase';

export interface ConversionResult {
  ok: boolean;
  message: string;
}

/**
 * Asks the convert-book Edge Function to start the MOBI/AZW3 → EPUB GitHub
 * Action for one book.
 *
 * The function re-checks membership itself via RLS, so this cannot be used
 * to convert someone else's private book or to trigger anything as a
 * non-member — the caller's session is what the function trusts, not this
 * client code.
 */
export async function triggerConversion(bookId: string): Promise<ConversionResult> {
  const supabase = db();
  if (!supabase) return { ok: false, message: 'Backend not configured.' };

  const { data, error } = await supabase.functions.invoke('convert-book', {
    body: { book_id: bookId },
  });

  if (error) {
    // supabase-js's own error.message is a fixed generic string ("Edge
    // Function returned a non-2xx status code") for every failure, no
    // matter what the function actually said — the real reason is only in
    // the raw response body, which the client doesn't parse automatically.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body?.error) return { ok: false, message: body.error };
      } catch {
        // Response wasn't JSON — fall through to the generic message below.
      }
    }
    return { ok: false, message: error.message ?? 'Could not reach the conversion service.' };
  }

  const result = data as { ok: boolean; error?: string };
  return result.ok
    ? { ok: true, message: 'Converting to EPUB — usually ready within a minute or two.' }
    : { ok: false, message: result.error ?? 'Conversion could not be started.' };
}
