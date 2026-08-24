import type { AnnotationStore, AnnotationWithBook } from '../data/AnnotationStore';
import type { AuthManager } from '../auth/AuthManager';
import { formatQuote } from './AnnotationUI';

type FilterId = 'all' | 'mine' | 'tagged' | string;

/**
 * Every mark and note across the whole library, grouped by book.
 *
 * Answers "which one did I keep, which ones did they keep" without opening
 * each book to check — everything here comes straight from the annotations
 * table via annotations_with_book, the same row that backs the per-book
 * sidebar. There's no separate store to fall out of sync with it.
 */
export class NotesLibraryUI {
  private panel: HTMLElement;
  private filtersEl: HTMLElement;
  private body: HTMLElement;

  private items: AnnotationWithBook[] = [];
  private activeFilter: FilterId = 'all';

  private annotations: AnnotationStore;
  private auth: AuthManager;
  private onJump: (bookId: string, cfiRange: string) => void;

  constructor(
    annotations: AnnotationStore,
    auth: AuthManager,
    onJump: (bookId: string, cfiRange: string) => void,
  ) {
    this.annotations = annotations;
    this.auth = auth;
    this.onJump = onJump;

    this.panel = document.getElementById('notes-library-panel') as HTMLElement;
    this.filtersEl = document.getElementById('notes-library-filters') as HTMLElement;
    this.body = document.getElementById('notes-library-body') as HTMLElement;

    document.getElementById('open-notes-library-btn')?.addEventListener('click', () => this.open());
    document.getElementById('close-notes-library-btn')?.addEventListener('click', () => this.close());
  }

  public async open(): Promise<void> {
    if (!this.auth.isMember) return;
    this.panel.classList.remove('hidden');
    this.items = await this.annotations.loadAll();
    this.buildFilters();
    this.render();
  }

  public close(): void {
    this.panel.classList.add('hidden');
  }

  private buildFilters(): void {
    this.filtersEl.innerHTML = '';

    const options: Array<{ id: FilterId; label: string }> = [
      { id: 'all', label: 'All' },
      { id: 'mine', label: 'Mine' },
      ...this.auth.others.map((m) => ({ id: m.user_id, label: m.display_name })),
      { id: 'tagged', label: 'Tagged for me' },
    ];

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'filter-chip';
      btn.classList.toggle('active', this.activeFilter === opt.id);
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        this.activeFilter = opt.id;
        this.buildFilters();
        this.render();
      });
      this.filtersEl.appendChild(btn);
    }
  }

  private filtered(): AnnotationWithBook[] {
    const myId = this.auth.userId;
    switch (this.activeFilter) {
      case 'all':
        return this.items;
      case 'mine':
        return this.items.filter((a) => a.user_id === myId);
      case 'tagged':
        return this.items.filter((a) => a.tagged_user_id === myId);
      default:
        return this.items.filter((a) => a.user_id === this.activeFilter);
    }
  }

  private render(): void {
    this.body.innerHTML = '';
    const items = this.filtered();

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'notes-library-empty';
      empty.textContent = 'Nothing here yet.';
      this.body.appendChild(empty);
      return;
    }

    // Group by book, preserving the newest-annotation-first order the query
    // already gave us — so the book you were both just in shows up first.
    const groups = new Map<string, { title: string; author: string; rows: AnnotationWithBook[] }>();
    for (const a of items) {
      if (!groups.has(a.book_id)) {
        groups.set(a.book_id, { title: a.book_title, author: a.book_author, rows: [] });
      }
      groups.get(a.book_id)!.rows.push(a);
    }

    for (const [bookId, group] of groups) {
      const section = document.createElement('div');
      section.className = 'notes-book-group';

      const heading = document.createElement('div');
      heading.className = 'notes-book-heading';
      heading.textContent = group.title;
      section.appendChild(heading);

      const author = document.createElement('div');
      author.className = 'notes-book-author';
      author.textContent = group.author;
      section.appendChild(author);

      for (const a of group.rows) {
        section.appendChild(this.renderItem(a, bookId));
      }

      this.body.appendChild(section);
    }
  }

  private renderItem(a: AnnotationWithBook, bookId: string): HTMLElement {
    const mine = a.user_id === this.auth.userId;
    const author = this.auth.memberFor(a.user_id);

    const row = document.createElement('div');
    row.className = 'notes-library-item';
    row.style.borderLeftColor = a.color;

    const meta = document.createElement('div');
    meta.className = 'notes-item-meta';

    const who = document.createElement('span');
    who.textContent = mine ? 'You' : (author?.display_name ?? 'Someone');
    meta.appendChild(who);

    if (a.tagged_user_id) {
      const taggedIsMe = a.tagged_user_id === this.auth.userId;
      const tagged = this.auth.memberFor(a.tagged_user_id);
      const tag = document.createElement('span');
      tag.className = 'notes-item-tag';
      tag.textContent = `→ ${taggedIsMe ? 'you' : tagged?.display_name ?? 'someone'}`;
      meta.appendChild(tag);
    }

    const when = document.createElement('span');
    when.textContent = new Date(a.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    meta.appendChild(when);

    row.appendChild(meta);

    if (a.selected_text) {
      const quoteLabel = document.createElement('div');
      quoteLabel.className = 'notes-item-label';
      quoteLabel.textContent = 'HIGHLIGHTED';
      row.appendChild(quoteLabel);

      const quote = document.createElement('p');
      quote.className = 'notes-item-quote';
      quote.textContent = formatQuote(a.selected_text);
      row.appendChild(quote);
    }

    if (a.note) {
      const noteLabel = document.createElement('div');
      noteLabel.className = 'notes-item-label';
      noteLabel.textContent = 'NOTE';
      row.appendChild(noteLabel);

      const note = document.createElement('p');
      note.className = 'notes-item-note';
      note.textContent = a.note;
      row.appendChild(note);
    }

    row.addEventListener('click', () => {
      this.close();
      this.onJump(bookId, a.cfi_range);
    });

    return row;
  }
}
