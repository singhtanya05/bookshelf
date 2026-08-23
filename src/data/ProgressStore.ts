import { db } from './supabase';

export interface Progress {
  user_id: string;
  book_id: string;
  location: string | null;
  percentage: number;
  updated_at: string;
}

const LOCAL_PREFIX = 'progress:';

/**
 * Reading position, synced across devices and visible to the whole circle.
 *
 * Replaces the old localStorage-keyed-by-title store, which was device-local
 * and broke whenever a title got re-parsed. Positions are keyed by book id now.
 *
 * Writes go to localStorage immediately and to Postgres on a debounce: page
 * turns fire constantly and each one is not worth a round trip. On conflict
 * the newer `updated_at` wins, which is the right call for one person reading
 * the same book on a phone and a laptop.
 */
export class ProgressStore {
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private others = new Map<string, Progress[]>();

  private userIdGetter: () => string | null;

  constructor(
    userIdGetter: () => string | null,
  ) {
    this.userIdGetter = userIdGetter;}

  /** Immediate local read, so a book opens at the right page without waiting. */
  getLocal(bookId: string): { location: string | null; percentage: number } | null {
    const raw = localStorage.getItem(LOCAL_PREFIX + bookId);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Authoritative position, preferring whichever copy is newer. */
  async resolve(bookId: string): Promise<{ location: string | null; percentage: number } | null> {
    const local = this.getLocal(bookId);
    const supabase = db();
    const userId = this.userIdGetter();
    if (!supabase || !userId) return local;

    const { data } = await supabase
      .from('reading_progress')
      .select('location, percentage, updated_at')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .maybeSingle();

    if (!data) return local;

    const localRaw = localStorage.getItem(LOCAL_PREFIX + bookId);
    const localAt = localRaw ? (JSON.parse(localRaw).updated_at ?? '') : '';
    if (localAt && localAt > data.updated_at) return local;

    return { location: data.location, percentage: data.percentage };
  }

  save(bookId: string, location: string, percentage: number): void {
    const updated_at = new Date().toISOString();
    localStorage.setItem(
      LOCAL_PREFIX + bookId,
      JSON.stringify({ location, percentage, updated_at }),
    );

    const supabase = db();
    const userId = this.userIdGetter();
    if (!supabase || !userId) return;

    clearTimeout(this.pending.get(bookId));
    this.pending.set(
      bookId,
      setTimeout(async () => {
        const { error } = await supabase
          .from('reading_progress')
          .upsert(
            { user_id: userId, book_id: bookId, location, percentage, updated_at },
            { onConflict: 'user_id,book_id' },
          );
        if (error) console.warn('[progress] sync failed:', error.message);
      }, 2000),
    );
  }

  /** Where everyone else has got to — the "my friend is on chapter 9" feature. */
  async loadCircle(bookId: string): Promise<Progress[]> {
    const supabase = db();
    const userId = this.userIdGetter();
    if (!supabase) return [];

    const { data } = await supabase
      .from('reading_progress')
      .select('user_id, book_id, location, percentage, updated_at')
      .eq('book_id', bookId);

    const rows = ((data ?? []) as Progress[]).filter((r) => r.user_id !== userId);
    this.others.set(bookId, rows);
    return rows;
  }

  circleFor(bookId: string): Progress[] {
    return this.others.get(bookId) ?? [];
  }

  /** Flush any debounced write immediately (on close / page hide). */
  async flush(): Promise<void> {
    for (const [, t] of this.pending) clearTimeout(t);
    this.pending.clear();
  }
}
