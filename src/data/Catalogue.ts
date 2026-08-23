import { db } from './supabase';

/** What anyone may see: the shelf art. No path to any file. */
export interface CatalogueEntry {
  id: string;
  title: string;
  author: string;
  category: string;
  format: 'epub' | 'pdf' | 'mobi' | 'azw3' | 'cbz' | 'txt';
  spine_color: string;
  cover_path: string | null;
  is_public: boolean;
  /** Site-relative path for public-domain books. Safe to expose. */
  public_path: string | null;
  /** Private bucket key. Present only for members; anon never receives it. */
  storage_key?: string;
}

/**
 * The shelf catalogue.
 *
 * Members read `books`; everyone else reads `public_catalogue`, a view that
 * simply has no storage_key column. The distinction is enforced in Postgres,
 * not here — this class cannot leak what it was never sent.
 */
/**
 * Shown when no backend is configured — a bare checkout still renders a shelf
 * and still reads the public-domain demo. Also what a visitor sees if the
 * catalogue call fails.
 */
const DEMO_ENTRY: CatalogueEntry = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Demo Volume',
  author: 'Project Gutenberg',
  category: 'Public Domain',
  format: 'epub',
  spine_color: '#5F4B3C',
  cover_path: null,
  is_public: true,
  public_path: 'books/demo.epub',
};

export class Catalogue {
  private entries: CatalogueEntry[] = [];
  /** Set when the backend is configured but unreachable or rejecting us. */
  public lastError: string | null = null;

  async load(isMember: boolean): Promise<CatalogueEntry[]> {
    const supabase = db();
    this.lastError = null;
    if (!supabase) {
      this.entries = [DEMO_ENTRY];
      return this.entries;
    }

    // Members read the table (and get storage_key); everyone else reads the
    // view, which has no such column to give them.
    const source = isMember ? 'books' : 'public_catalogue';
    const columns =
      'id, title, author, category, format, spine_color, cover_path, is_public, public_path' +
      (isMember ? ', storage_key' : '');

    let data: unknown[] | null = null;
    try {
      const res = await supabase
        .from(source)
        .select(columns)
        .order('created_at', { ascending: true });
      if (res.error) throw new Error(res.error.message);
      data = res.data as unknown[];
    } catch (e) {
      // A wrong URL surfaces as a network failure, not a Postgres error, so
      // both paths land here and produce one honest message.
      this.lastError = e instanceof Error ? e.message : 'Unknown error';
      console.error('[catalogue] load failed:', this.lastError);
      this.entries = [DEMO_ENTRY];
      return this.entries;
    }

    this.entries = (data ?? []) as unknown as CatalogueEntry[];
    return this.entries;
  }

  get all(): CatalogueEntry[] {
    return this.entries;
  }

  byId(id: string): CatalogueEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  get categories(): string[] {
    return [...new Set(this.entries.map((e) => e.category || 'Uncategorized'))];
  }
}
