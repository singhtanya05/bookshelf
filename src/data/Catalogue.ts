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
};

export class Catalogue {
  private entries: CatalogueEntry[] = [];

  async load(isMember: boolean): Promise<CatalogueEntry[]> {
    const supabase = db();
    if (!supabase) {
      this.entries = [DEMO_ENTRY];
      return this.entries;
    }

    const source = isMember ? 'books' : 'public_catalogue';
    const { data, error } = await supabase
      .from(source)
      .select('id, title, author, category, format, spine_color, cover_path, is_public')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[catalogue] load failed:', error.message);
      this.entries = [DEMO_ENTRY];
      return this.entries;
    }

    this.entries = (data ?? []) as CatalogueEntry[];
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
