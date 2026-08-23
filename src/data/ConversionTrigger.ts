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
    return { ok: false, message: error.message ?? 'Could not reach the conversion service.' };
  }

  const result = data as { ok: boolean; error?: string };
  return result.ok
    ? { ok: true, message: 'Converting to EPUB — usually ready within a minute or two.' }
    : { ok: false, message: result.error ?? 'Conversion could not be started.' };
}
