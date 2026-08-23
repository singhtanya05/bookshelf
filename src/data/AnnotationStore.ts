import { db } from './supabase';

export type AnnotationType = 'highlight' | 'note' | 'bookmark';

export interface Annotation {
  id: string;
  user_id: string;
  book_id: string;
  type: AnnotationType;
  cfi_range: string;
  selected_text: string | null;
  note: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

/**
 * Shared marginalia.
 *
 * Everyone in the circle reads every annotation; RLS allows writes only to
 * your own. Realtime means a highlight your friend makes shows up in your
 * copy while you are both reading, without a refresh.
 */
export class AnnotationStore {
  private byBook = new Map<string, Annotation[]>();
  private channel: ReturnType<NonNullable<ReturnType<typeof db>>['channel']> | null = null;
  private listeners: Array<(bookId: string) => void> = [];

  private userIdGetter: () => string | null;

  constructor(
    userIdGetter: () => string | null,
  ) {
    this.userIdGetter = userIdGetter;}

  onChange(fn: (bookId: string) => void): void {
    this.listeners.push(fn);
  }

  private emit(bookId: string): void {
    for (const fn of this.listeners) fn(bookId);
  }

  async load(bookId: string): Promise<Annotation[]> {
    const supabase = db();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[annotations] load failed:', error.message);
      return [];
    }
    const rows = (data ?? []) as Annotation[];
    this.byBook.set(bookId, rows);
    return rows;
  }

  forBook(bookId: string): Annotation[] {
    return this.byBook.get(bookId) ?? [];
  }

  async add(input: {
    book_id: string;
    type: AnnotationType;
    cfi_range: string;
    selected_text?: string;
    note?: string;
    color: string;
  }): Promise<Annotation | null> {
    const supabase = db();
    const userId = this.userIdGetter();
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
      .from('annotations')
      .insert({ ...input, user_id: userId })
      .select()
      .single();

    if (error) {
      console.warn('[annotations] insert failed:', error.message);
      return null;
    }
    const row = data as Annotation;
    this.byBook.set(input.book_id, [...this.forBook(input.book_id), row]);
    return row;
  }

  async updateNote(id: string, note: string): Promise<void> {
    const supabase = db();
    if (!supabase) return;
    await supabase
      .from('annotations')
      .update({ note, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  async remove(id: string, bookId: string): Promise<void> {
    const supabase = db();
    if (!supabase) return;
    const { error } = await supabase.from('annotations').delete().eq('id', id);
    if (error) {
      console.warn('[annotations] delete failed:', error.message);
      return;
    }
    this.byBook.set(bookId, this.forBook(bookId).filter((a) => a.id !== id));
  }

  /** Live updates while two people read the same book. */
  subscribe(bookId: string): void {
    const supabase = db();
    if (!supabase) return;
    this.unsubscribe();

    this.channel = supabase
      .channel(`annotations:${bookId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'annotations', filter: `book_id=eq.${bookId}` },
        async () => {
          await this.load(bookId);
          this.emit(bookId);
        },
      )
      .subscribe();
  }

  unsubscribe(): void {
    if (this.channel) {
      db()?.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
