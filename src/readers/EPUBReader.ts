import ePub from 'epubjs';
import { ReaderSettings } from '../data/ReaderSettings';
import type { ProgressStore } from '../data/ProgressStore';
import type { AnnotationStore, Annotation } from '../data/AnnotationStore';
import type { AuthManager } from '../auth/AuthManager';

export interface SelectionEvent {
  cfiRange: string;
  text: string;
  /** Viewport coords for placing the highlight popup. */
  x: number;
  y: number;
}

export class EPUBReader {
  public currentBook: any = null;
  public currentRendition: any = null;
  private bookId: string | null = null;
  private data: ArrayBuffer | null = null;

  private epubSpread: 'none' | 'auto';
  private epubFontSize: number;
  private epubFontFamily: string;

  /** Set by UIManager to raise the highlight popup. */
  public onSelection: ((sel: SelectionEvent) => void) | null = null;
  /** Set by UIManager to open an existing annotation. */
  public onAnnotationClick: ((annotation: Annotation) => void) | null = null;

  private epubOverlay: HTMLElement;
  private epubViewer: HTMLElement;
  private epubProgress: HTMLElement;
  private progress: ProgressStore;
  private annotations: AnnotationStore;
  private auth: AuthManager;

  constructor(
    epubOverlay: HTMLElement,
    epubViewer: HTMLElement,
    epubProgress: HTMLElement,
    progress: ProgressStore,
    annotations: AnnotationStore,
    auth: AuthManager,
  ) {
    this.epubOverlay = epubOverlay;
    this.epubViewer = epubViewer;
    this.epubProgress = epubProgress;
    this.progress = progress;
    this.annotations = annotations;
    this.auth = auth;
    this.epubSpread = ReaderSettings.getSpread();
    this.epubFontSize = ReaderSettings.getFontSize();
    this.epubFontFamily = ReaderSettings.getFontFamily();

    // epub.js's own rendition.on('keydown', ...) only fires for keypresses
    // that land inside the book's iframe. Right after clicking READ, focus
    // is still on the outer page, so arrow keys never reach that listener
    // at all — this is the fallback for exactly that case.
    document.addEventListener('keydown', this.handleGlobalKeydown);
  }

  private handleGlobalKeydown = (e: KeyboardEvent): void => {
    if (!this.currentRendition || this.epubOverlay.classList.contains('hidden')) return;

    // Don't hijack typing if focus somehow ended up in a real input.
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'ArrowRight') this.animateTurn('next');
    else if (e.key === 'ArrowLeft') this.animateTurn('prev');
    else if (e.key === 'Escape') this.close();
  };

  /**
   * @param bookId  catalogue id — the key for progress and annotations
   * @param data    raw EPUB bytes from BookVault (never a public path)
   */
  public async load(bookId: string, data: ArrayBuffer, startCfi?: string): Promise<void> {
    this.epubOverlay.classList.remove('hidden');
    if (this.currentBook) this.currentBook.destroy();
    this.epubViewer.innerHTML = '';

    this.bookId = bookId;
    this.data = data;

    // epub.js opens an ArrayBuffer as a zip archive directly.
    this.currentBook = ePub(data);
    this.currentBook.opened
      .then(() => console.info('[epub] opened', bookId))
      .catch((e: unknown) => {
        console.error('[epub] failed to open:', e);
        this.showError('This book could not be opened.');
      });
    this.currentRendition = this.currentBook.renderTo(this.epubViewer, {
      width: '100%',
      height: '100%',
      spread: this.epubSpread,
      manager: 'continuous',
      flow: 'paginated',
    });

    this.epubViewer.classList.toggle('spread-mode', this.epubSpread === 'auto');

    this.registerThemes();
    this.applyTheme(ReaderSettings.getTheme());
    this.currentRendition.themes.font(this.epubFontFamily);
    this.currentRendition.themes.fontSize(`${this.epubFontSize}%`);
    this.applyFontOverride();

    // The "continuous" manager renders adjacent sections into their own
    // iframes as you turn pages — each one is a fresh document that never
    // saw our font override. Re-apply it every time a new one appears.
    this.currentRendition.on('rendered', () => this.applyFontOverride());

    // Resume: prefer an explicit target, else whichever saved position is newer.
    let targetCfi = startCfi;
    if (!targetCfi) {
      const resolved = await this.progress.resolve(bookId);
      targetCfi = resolved?.location ?? undefined;
    }
    try {
      await this.currentRendition.display(targetCfi || undefined);
    } catch (e) {
      console.error('[epub] display failed:', e);
      this.showError('This book could not be displayed.');
      return;
    }

    this.currentBook.ready
      .then(() => this.currentBook.locations.generate(1600))
      .then(() => {
        const loc = this.currentRendition.currentLocation();
        if (loc?.start) {
          this.epubProgress.innerText = Math.round(loc.start.percentage * 100) + '%';
        }
      });

    this.currentRendition.on('relocated', (location: any) => {
      if (!location?.start) return;
      const pct = this.currentBook.locations.length() > 0 ? location.start.percentage : 0;
      this.epubProgress.innerText = Math.round(pct * 100) + '%';
      this.progress.save(bookId, location.start.cfi, pct);
    });

    this.currentRendition.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') this.animateTurn('next');
      if (e.key === 'ArrowLeft') this.animateTurn('prev');
      if (e.key === 'Escape') this.close();
    });

    this.wireSelection();

    // Paint the circle's existing marginalia, then keep it live.
    await this.annotations.load(bookId);
    this.renderAnnotations();
    this.annotations.subscribe(bookId);
  }

  /** A failed load must say so rather than leave a blank page. */
  private showError(message: string): void {
    this.epubViewer.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'epub-error';
    p.textContent = message;
    this.epubViewer.appendChild(p);
  }

  /** Text selection inside the iframe -> highlight popup in the parent page. */
  private wireSelection(): void {
    this.currentRendition.on('selected', (cfiRange: string, contents: any) => {
      const selection = contents.window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!text) return;

      // Map iframe-relative coords into the parent viewport.
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const frame = contents.document.defaultView.frameElement as HTMLIFrameElement | null;
      const offset = frame?.getBoundingClientRect() ?? { left: 0, top: 0 };

      this.onSelection?.({
        cfiRange,
        text,
        x: offset.left + rect.left + rect.width / 2,
        y: offset.top + rect.top,
      });
    });
  }

  /** Redraw every highlight, colour-coded by who made it. */
  public renderAnnotations(): void {
    if (!this.currentRendition || !this.bookId) return;

    // epub.js has no "clear all", so remove what we know about first.
    const existing = this.annotations.forBook(this.bookId);
    for (const a of existing) {
      try {
        this.currentRendition.annotations.remove(a.cfi_range, 'highlight');
      } catch {
        /* not currently rendered */
      }
    }

    for (const a of existing) {
      if (a.type === 'bookmark') continue;
      const author = this.auth.memberFor(a.user_id);
      const color = a.color || author?.color || '#FFD54F';
      try {
        this.currentRendition.annotations.highlight(
          a.cfi_range,
          { id: a.id },
          () => this.onAnnotationClick?.(a),
          a.type === 'note' ? 'shelf-note' : 'shelf-highlight',
          { fill: color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' },
        );
      } catch (e) {
        console.warn('[epub] could not render annotation', a.id, e);
      }
    }
  }

  public clearSelection(): void {
    const contents = this.currentRendition?.getContents?.() ?? [];
    for (const c of contents) c.window?.getSelection()?.removeAllRanges();
  }

  private registerThemes(): void {
    const palette: Record<string, { bg: string; fg: string; heading?: string }> = {
      light: { bg: '#fff', fg: '#2A2A28' },
      sepia: { bg: '#f4ecd8', fg: '#5b4636' },
      dark: { bg: '#1a1a1a', fg: '#e0e0e0', heading: '#ffffff' },
    };

    for (const [name, c] of Object.entries(palette)) {
      const head = c.heading ?? c.fg;
      // epub.js keeps every registered theme's stylesheet live inside the
      // iframe at once — select() only toggles a class on <body>, it never
      // disables the sheets for the themes you're NOT on (confirmed:
      // sheet.disabled stays false for all of them here). Since the old
      // rules were bare `html`/`body`/`p` selectors, all three themes'
      // !important backgrounds applied simultaneously and whichever one
      // happened to be registered last in the DOM won every time — so
      // switching themes looked like it did nothing, or only "worked" once.
      // Scoping every selector under body.<name> makes the rules mutually
      // exclusive by construction: at most one theme's body class is ever
      // present, so at most one ruleset can ever match, regardless of how
      // many stylesheets epub.js leaves enabled. :has() reaches <html> from
      // there since CSS has no selector for "my own parent".
      this.currentRendition.themes.register(name, {
        [`html:has(body.${name})`]: { 'background-color': `${c.bg} !important` },
        [`body.${name}`]: { color: `${c.fg} !important`, 'background-color': `${c.bg} !important`, 'line-height': '1.8' },
        [`body.${name} p`]: { color: `${c.fg} !important`, 'margin-bottom': '1.5em' },
        [`body.${name} span`]: { color: `${c.fg} !important` },
        [`body.${name} div`]: { color: `${c.fg} !important` },
        [`body.${name} h1`]: { color: `${head} !important` },
        [`body.${name} h2`]: { color: `${head} !important` },
        [`body.${name} h3`]: { color: `${head} !important` },
      });
    }
  }

  public applyTheme(themeName: string): void {
    if (!this.currentRendition) return;
    this.currentRendition.themes.select(themeName);
    ReaderSettings.setTheme(themeName);

    const vars: Record<string, [string, string, string]> = {
      light: ['#FDFBF7', '#fff', '#2A2A28'],
      sepia: ['#e8e0cc', '#f4ecd8', '#5b4636'],
      dark: ['#121212', '#1a1a1a', '#e0e0e0'],
    };
    const [bg, readerBg, text] = vars[themeName] ?? vars.light;
    document.documentElement.style.setProperty('--theme-bg', bg);
    document.documentElement.style.setProperty('--theme-reader-bg', readerBg);
    document.documentElement.style.setProperty('--theme-text', text);

    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
    });
  }

  public async toggleSpread(): Promise<void> {
    if (!this.currentRendition || !this.bookId || !this.data) return;
    const loc = this.currentRendition.currentLocation();
    const cfi = loc?.start?.cfi;
    this.epubSpread = this.epubSpread === 'auto' ? 'none' : 'auto';
    ReaderSettings.setSpread(this.epubSpread);
    await this.load(this.bookId, this.data, cfi);
  }

  public changeFontSize(delta: number): void {
    this.epubFontSize = Math.max(50, Math.min(250, this.epubFontSize + delta));
    ReaderSettings.setFontSize(this.epubFontSize);
    this.currentRendition?.themes.fontSize(`${this.epubFontSize}%`);
  }

  public changeFontFamily(family: string): void {
    this.epubFontFamily = family;
    ReaderSettings.setFontFamily(family);
    this.currentRendition?.themes.font(family);
    this.applyFontOverride();
  }

  /**
   * epub.js's own themes.font() only sets an inline font-family on <body>
   * and leans on CSS inheritance — fine for a plain Gutenberg text file,
   * but any book with its own typesetting CSS (a real p/span/h1 rule, even
   * without !important) wins over an inherited value regardless of how the
   * ancestor's style was set. Confirmed directly: computed font-family
   * updated correctly for Alice in Wonderland, but real published EPUBs
   * commonly define font-family on the elements themselves.
   *
   * This takes the same approach as the theme-color fix: stop trusting
   * inheritance and write our own !important rule directly onto the
   * elements that actually carry text, in every currently-rendered iframe.
   */
  private applyFontOverride(): void {
    if (!this.currentRendition) return;
    const family = this.epubFontFamily;
    const css =
      `body, p, span, div, li, dd, dt, blockquote, a, em, i, strong, b, ` +
      `small, sub, sup, td, th, caption, label, h1, h2, h3, h4, h5, h6 ` +
      `{ font-family: ${family} !important; }`;

    for (const contents of this.currentRendition.getContents() as any[]) {
      const doc: Document | undefined = contents?.document;
      if (!doc) continue;

      // Updating an existing tag's content in place does NOT move it in the
      // DOM — if the book's own stylesheet ever loads or re-injects after
      // ours, it wins the position tie despite our content being current.
      // Removing and re-appending guarantees we're always last, every call.
      doc.getElementById('shelf-font-override')?.remove();
      const tag = doc.createElement('style');
      tag.id = 'shelf-font-override';
      tag.textContent = css;
      doc.head.appendChild(tag);
    }
  }

  public displayAt(cfi: string): void {
    this.currentRendition?.display(cfi);
  }

  public animateTurn(direction: 'next' | 'prev'): void {
    if (!this.currentRendition) return;
    const outClass = direction === 'next' ? 'epub-slide-out-left' : 'epub-slide-out-right';
    const inClass = direction === 'next' ? 'epub-slide-in-right' : 'epub-slide-in-left';

    this.epubViewer.classList.add(outClass);
    setTimeout(() => {
      if (direction === 'next') this.currentRendition.next();
      else this.currentRendition.prev();
      this.epubViewer.classList.remove(outClass);
      this.epubViewer.classList.add(inClass);
      setTimeout(() => this.epubViewer.classList.remove(inClass), 500);
    }, 300);
  }

  public get activeBookId(): string | null {
    return this.bookId;
  }

  public close(): void {
    this.epubOverlay.classList.add('hidden');
    this.annotations.unsubscribe();
    this.progress.flush();
    if (this.currentBook) {
      this.currentBook.destroy();
      this.currentBook = null;
      this.currentRendition = null;
    }
    this.bookId = null;
    this.data = null;
  }
}
