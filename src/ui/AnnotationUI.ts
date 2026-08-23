import type { AnnotationStore, Annotation } from '../data/AnnotationStore';
import type { AuthManager } from '../auth/AuthManager';
import type { EPUBReader, SelectionEvent } from '../readers/EPUBReader';

const HIGHLIGHT_COLORS = ['#FFD54F', '#A5D6A7', '#90CAF9', '#F48FB1', '#CE93D8'];

/**
 * Highlights, notes, and the shared margin.
 *
 * Everything rendered here can contain another person's text, so every value
 * goes in via textContent. No innerHTML with data — that was the one real
 * injection route once uploads and shared annotations exist.
 */
export class AnnotationUI {
  private popup: HTMLElement;
  private sidebar: HTMLElement;
  private list: HTMLElement;
  private noteEditor: HTMLElement;
  private noteInput: HTMLTextAreaElement;

  private pendingSelection: SelectionEvent | null = null;
  private editingId: string | null = null;

  private annotations: AnnotationStore;
  private auth: AuthManager;
  private epubReader: EPUBReader;

  constructor(
    annotations: AnnotationStore,
    auth: AuthManager,
    epubReader: EPUBReader,
  ) {
    this.annotations = annotations;
    this.auth = auth;
    this.epubReader = epubReader;
    this.popup = document.getElementById('annotation-popup') as HTMLElement;
    this.sidebar = document.getElementById('annotation-sidebar') as HTMLElement;
    this.list = document.getElementById('annotation-list') as HTMLElement;
    this.noteEditor = document.getElementById('note-editor') as HTMLElement;
    this.noteInput = document.getElementById('note-input') as HTMLTextAreaElement;

    this.buildPalette();
    this.wire();

    this.epubReader.onSelection = (sel) => this.showPopup(sel);
    this.epubReader.onAnnotationClick = (a) => this.openNote(a);
    this.annotations.onChange(() => {
      this.epubReader.renderAnnotations();
      this.refreshList();
    });
  }

  private buildPalette(): void {
    const palette = this.popup.querySelector('.annotation-colors') as HTMLElement;
    palette.innerHTML = '';
    for (const color of HIGHLIGHT_COLORS) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch';
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `Highlight in ${color}`);
      swatch.addEventListener('click', () => this.commitHighlight(color));
      palette.appendChild(swatch);
    }
  }

  private wire(): void {
    document.getElementById('annotation-note-btn')?.addEventListener('click', () => {
      if (!this.pendingSelection) return;
      this.hidePopup();
      this.editingId = null;
      this.noteInput.value = '';
      this.noteEditor.classList.remove('hidden');
      this.noteInput.focus();
    });

    document.getElementById('note-save-btn')?.addEventListener('click', () => this.saveNote());
    document.getElementById('note-cancel-btn')?.addEventListener('click', () => {
      this.noteEditor.classList.add('hidden');
      this.pendingSelection = null;
      this.editingId = null;
    });

    document.getElementById('toggle-annotations-btn')?.addEventListener('click', () => {
      this.sidebar.classList.toggle('hidden');
      if (!this.sidebar.classList.contains('hidden')) this.refreshList();
    });
    document.getElementById('close-annotations-btn')?.addEventListener('click', () => {
      this.sidebar.classList.add('hidden');
    });

    // Any click outside the popup dismisses it.
    document.addEventListener('mousedown', (e) => {
      if (!this.popup.contains(e.target as Node)) this.hidePopup();
    });
  }

  private showPopup(sel: SelectionEvent): void {
    if (!this.auth.isMember) return; // no marginalia without a seat at the table
    this.pendingSelection = sel;

    this.popup.classList.remove('hidden');
    // Clamp so the popup never hangs off the edge on a phone.
    const width = this.popup.offsetWidth || 220;
    const left = Math.min(Math.max(sel.x - width / 2, 8), window.innerWidth - width - 8);
    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${Math.max(sel.y - 56, 8)}px`;
  }

  private hidePopup(): void {
    this.popup.classList.add('hidden');
  }

  private async commitHighlight(color: string): Promise<void> {
    const sel = this.pendingSelection;
    const bookId = this.epubReader.activeBookId;
    if (!sel || !bookId) return;

    await this.annotations.add({
      book_id: bookId,
      type: 'highlight',
      cfi_range: sel.cfiRange,
      selected_text: sel.text,
      color,
    });

    this.hidePopup();
    this.epubReader.clearSelection();
    this.pendingSelection = null;
    this.epubReader.renderAnnotations();
    this.refreshList();
  }

  private async saveNote(): Promise<void> {
    const text = this.noteInput.value.trim();
    const bookId = this.epubReader.activeBookId;
    if (!text || !bookId) return;

    if (this.editingId) {
      await this.annotations.updateNote(this.editingId, text);
      await this.annotations.load(bookId);
    } else if (this.pendingSelection) {
      await this.annotations.add({
        book_id: bookId,
        type: 'note',
        cfi_range: this.pendingSelection.cfiRange,
        selected_text: this.pendingSelection.text,
        note: text,
        color: this.auth.me?.color ?? '#E88D56',
      });
      this.epubReader.clearSelection();
    }

    this.noteEditor.classList.add('hidden');
    this.pendingSelection = null;
    this.editingId = null;
    this.epubReader.renderAnnotations();
    this.refreshList();
  }

  private openNote(a: Annotation): void {
    // Only your own notes are editable; a friend's is read-only.
    if (a.user_id !== this.auth.userId) {
      this.sidebar.classList.remove('hidden');
      this.refreshList();
      return;
    }
    this.editingId = a.id;
    this.noteInput.value = a.note ?? '';
    this.noteEditor.classList.remove('hidden');
    this.noteInput.focus();
  }

  /** The shared margin: every mark from everyone, in reading order. */
  public refreshList(): void {
    const bookId = this.epubReader.activeBookId;
    this.list.innerHTML = '';
    if (!bookId) return;

    const items = this.annotations.forBook(bookId);
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'annotation-empty';
      empty.textContent = 'No marks yet. Select any passage to highlight it.';
      this.list.appendChild(empty);
      return;
    }

    for (const a of items) {
      const author = this.auth.memberFor(a.user_id);
      const mine = a.user_id === this.auth.userId;

      const row = document.createElement('div');
      row.className = 'annotation-item';
      row.style.borderLeftColor = a.color;

      const who = document.createElement('div');
      who.className = 'annotation-author';
      who.textContent = mine ? 'You' : (author?.display_name ?? 'Someone');
      row.appendChild(who);

      if (a.selected_text) {
        const quote = document.createElement('blockquote');
        quote.className = 'annotation-quote';
        quote.textContent = a.selected_text;
        row.appendChild(quote);
      }

      if (a.note) {
        const note = document.createElement('p');
        note.className = 'annotation-note';
        note.textContent = a.note;
        row.appendChild(note);
      }

      row.addEventListener('click', () => this.epubReader.displayAt(a.cfi_range));

      if (mine) {
        const del = document.createElement('button');
        del.className = 'annotation-delete';
        del.textContent = '×';
        del.setAttribute('aria-label', 'Delete this mark');
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.annotations.remove(a.id, bookId);
          this.epubReader.renderAnnotations();
          this.refreshList();
        });
        row.appendChild(del);
      }

      this.list.appendChild(row);
    }
  }
}
