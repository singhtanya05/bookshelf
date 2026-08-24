import type { ShelfManager, BookData } from '../components/ShelfManager';
import type { EPUBReader } from '../readers/EPUBReader';
import type { PDFReader } from '../readers/PDFReader';
import type { AuthManager } from '../auth/AuthManager';
import type { BookVault } from '../data/BookVault';
import type { ProgressStore } from '../data/ProgressStore';
import { triggerConversion } from '../data/ConversionTrigger';
import * as THREE from 'three';

export class UIManager {
  private header!: HTMLElement;
  private statusInd!: HTMLElement;
  private footer!: HTMLElement;
  private navLeft!: HTMLButtonElement;
  private navRight!: HTMLButtonElement;
  private inspectBtn!: HTMLButtonElement;

  private focusOverlay!: HTMLElement;
  private focusIndex!: HTMLElement;
  private focusTitle!: HTMLElement;
  private focusAuthor!: HTMLElement;

  private returnBtn!: HTMLButtonElement;
  private focusDetails!: HTMLElement;
  private viewBookBtn!: HTMLButtonElement;
  private circleNote!: HTMLElement;

  private hoverTooltip!: HTMLElement;
  private scrubberThumb!: HTMLElement;
  private scrubberTicks!: HTMLElement;

  private searchInput!: HTMLInputElement;
  private searchResults!: HTMLElement;

  private authModal!: HTMLElement;
  private emailInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private authError!: HTMLElement;
  private authStatus!: HTMLElement;

  private pendingBook: BookData | null = null;

  private shelfMgr: ShelfManager;
  private epubReader: EPUBReader;
  private pdfReader: PDFReader;
  private auth: AuthManager;
  private vault: BookVault;
  private progress: ProgressStore;
  private activeBookGetter: () => THREE.Group | null;
  private inspectBookHandler: (book: THREE.Group) => void;

  constructor(
    shelfMgr: ShelfManager,
    epubReader: EPUBReader,
    pdfReader: PDFReader,
    auth: AuthManager,
    vault: BookVault,
    progress: ProgressStore,
    activeBookGetter: () => THREE.Group | null,
    inspectBookHandler: (book: THREE.Group) => void,
  ) {
    this.shelfMgr = shelfMgr;
    this.epubReader = epubReader;
    this.pdfReader = pdfReader;
    this.auth = auth;
    this.vault = vault;
    this.progress = progress;
    this.activeBookGetter = activeBookGetter;
    this.inspectBookHandler = inspectBookHandler;

    this.cacheElements();
    this.initScrubber();
    this.initCategoryFilters();
    this.initSearch();
    this.initNavigation();
    this.initReadersTrigger();
    this.initAuth();
    this.refreshAuthUI();
  }

  private cacheElements(): void {
    const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
    const $id = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

    this.header = $('.header');
    this.statusInd = $('.status-indicator');
    this.footer = $('.footer');
    this.navLeft = $('#nav-left');
    this.navRight = $('#nav-right');
    this.inspectBtn = $('#inspect-button');

    this.focusOverlay = $('#focus-overlay');
    this.focusIndex = $('#focus-index');
    this.focusTitle = $('#focus-title');
    this.focusAuthor = $('#focus-author');

    this.returnBtn = $('#return-button');
    this.focusDetails = $('#focus-details');
    this.viewBookBtn = $('.view-book-link');
    this.circleNote = $id('circle-progress');

    this.hoverTooltip = $('#hover-tooltip');
    this.scrubberThumb = $('#scrubber-thumb');
    this.scrubberTicks = $('.scrubber-ticks');

    this.searchInput = $id('search-input');
    this.searchResults = $id('search-results');

    this.authModal = $id('auth-modal');
    this.emailInput = $id('auth-email');
    this.passwordInput = $id('auth-password');
    this.authError = $id('auth-error');
    this.authStatus = $id('auth-status');
  }

  /** Called after the catalogue changes (sign in reveals the full library). */
  public refreshCounts(): void {
    const count = this.shelfMgr.entries.length;
    const header = document.getElementById('header-volume-count');
    if (header) header.innerText = `${count} VOLUMES`;
    const status = document.getElementById('status-volume-count');
    if (status) status.innerText = `${count} VOLUMES READY`;
    this.initScrubber();
    this.initCategoryFilters();
  }

  private initScrubber(): void {
    const count = this.shelfMgr.entries.length;
    if (!this.scrubberTicks) return;
    this.scrubberTicks.innerHTML = '';
    if (count < 2) return; // avoid dividing by zero on an empty or single shelf
    for (let i = 0; i < count; i++) {
      const tick = document.createElement('div');
      tick.className = 'scrubber-tick';
      tick.style.left = `${(i / (count - 1)) * 100}%`;
      this.scrubberTicks.appendChild(tick);
    }
  }

  private initCategoryFilters(): void {
    const container = document.getElementById('category-filters')!;
    container.innerHTML = '';
    const cats = ['All', ...new Set(this.shelfMgr.entries.map((b) => b.category || 'Uncategorized'))];

    for (const cat of cats) {
      const btn = document.createElement('button');
      btn.className = 'category-btn';
      btn.textContent = cat;
      if (cat === 'All') btn.classList.add('active');
      btn.addEventListener('click', () => {
        document.querySelectorAll('.category-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.shelfMgr.filterBooks(cat);
      });
      container.appendChild(btn);
    }
  }

  private initSearch(): void {
    this.searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
      this.searchResults.innerHTML = '';

      if (!query) {
        this.searchResults.classList.add('hidden');
        return;
      }

      const entries = this.shelfMgr.entries;
      let matches = 0;

      for (let i = 0; i < entries.length; i++) {
        const data = entries[i];
        if (
          !data.title.toLowerCase().includes(query) &&
          !data.author.toLowerCase().includes(query)
        ) continue;

        matches++;
        // textContent, not innerHTML: titles are user-supplied now.
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const t = document.createElement('div');
        t.className = 'search-item-title';
        t.textContent = data.title;
        const a = document.createElement('div');
        a.className = 'search-item-author';
        a.textContent = data.author;
        item.append(t, a);

        item.addEventListener('click', () => {
          this.searchInput.value = '';
          this.searchResults.classList.add('hidden');
          const book = this.shelfMgr.books[i];
          const meta = this.shelfMgr.bookMetaMap.get(book)!;
          this.shelfMgr.scrollTarget = meta.centerPosX;
          setTimeout(() => this.inspectBookHandler(book), 800);
        });

        this.searchResults.appendChild(item);
      }

      this.searchResults.classList.toggle('hidden', matches === 0);
    });

    document.addEventListener('click', (e) => {
      if (
        !this.searchInput.contains(e.target as Node) &&
        !this.searchResults.contains(e.target as Node)
      ) {
        this.searchResults.classList.add('hidden');
      }
    });
  }

  private initNavigation(): void {
    this.navLeft.addEventListener('click', () => {
      this.shelfMgr.scrollTarget = THREE.MathUtils.clamp(this.shelfMgr.scrollTarget - 0.5, 0, this.shelfMgr.maxScroll);
    });
    this.navRight.addEventListener('click', () => {
      this.shelfMgr.scrollTarget = THREE.MathUtils.clamp(this.shelfMgr.scrollTarget + 0.5, 0, this.shelfMgr.maxScroll);
    });
    this.inspectBtn.addEventListener('click', () => {
      const active = this.activeBookGetter();
      if (active) this.inspectBookHandler(active);
    });
  }

  // ------------------------------------------------------------------ auth --
  private initAuth(): void {
    document.getElementById('auth-signin-btn')?.addEventListener('click', async () => {
      this.authError.classList.add('hidden');
      this.authStatus.textContent = 'Signing in…';
      const { error } = await this.auth.signInWithPassword(
        this.emailInput.value.trim(),
        this.passwordInput.value,
      );
      this.authStatus.textContent = '';
      if (error) {
        this.authError.textContent = error.message;
        this.authError.classList.remove('hidden');
        return;
      }
      this.passwordInput.value = '';
      this.authModal.classList.add('hidden');
      if (this.pendingBook) {
        const book = this.pendingBook;
        this.pendingBook = null;
        await this.openBook(book);
      }
    });

    document.getElementById('auth-magic-btn')?.addEventListener('click', async () => {
      const email = this.emailInput.value.trim();
      if (!email) {
        this.authError.textContent = 'Enter your email first.';
        this.authError.classList.remove('hidden');
        return;
      }
      this.authError.classList.add('hidden');
      const { error } = await this.auth.sendMagicLink(email);
      this.authStatus.textContent = error ? '' : 'Check your email for a sign-in link.';
      if (error) {
        this.authError.textContent = error.message;
        this.authError.classList.remove('hidden');
      }
    });

    document.getElementById('auth-signout-btn')?.addEventListener('click', async () => {
      await this.auth.signOut();
      // A cached book must not outlive the session that earned it.
      await this.vault.clearCache();
    });

    document.getElementById('close-auth-btn')?.addEventListener('click', () => {
      this.authModal.classList.add('hidden');
      this.pendingBook = null;
    });

    this.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('auth-signin-btn')?.click();
    });

    this.auth.onChange(() => this.refreshAuthUI());
  }

  public refreshAuthUI(): void {
    const signedIn = this.auth.isSignedIn;
    const member = this.auth.isMember;

    document.getElementById('auth-signin-trigger')?.classList.toggle('hidden', signedIn);
    document.getElementById('auth-signout-btn')?.classList.toggle('hidden', !signedIn);
    document.getElementById('open-upload-btn')?.classList.toggle('hidden', !member);
    document.getElementById('open-notes-library-btn')?.classList.toggle('hidden', !member);

    const who = document.getElementById('current-member');
    if (who) who.textContent = member ? (this.auth.me?.display_name ?? '') : '';

    // Signed in but not in the circle: say so plainly rather than failing later.
    const notice = document.getElementById('member-notice');
    if (notice) notice.classList.toggle('hidden', !signedIn || member);
  }

  private openAuthModal(): void {
    this.authError.classList.add('hidden');
    this.authStatus.textContent = '';
    this.passwordInput.value = '';
    this.authModal.classList.remove('hidden');
    this.emailInput.focus();
  }

  /**
   * Jump straight into a book from outside the 3D shelf — used by the
   * library-wide notes panel, where a book may not even be on screen.
   * Skips the shelf/inspect theatrics entirely; the reader overlay is
   * already a fixed full-screen layer, so there's nothing it needs from
   * the 3D scene to open.
   */
  public async openBookById(bookId: string, cfiRange?: string): Promise<void> {
    const data = this.shelfMgr.entries.find((b) => b.id === bookId);
    if (!data) {
      alert('This book is no longer in the library.');
      return;
    }
    await this.openBook(data);
    if (cfiRange && data.format === 'epub') {
      this.epubReader.displayAt(cfiRange);
    }
  }

  // ------------------------------------------------------------- open book --
  private async openBook(data: BookData): Promise<void> {
    try {
      if (data.format === 'pdf') {
        this.pdfReader.load(data.id, await this.vault.urlFor(data));
      } else if (data.format === 'epub') {
        const blob = await this.vault.blobFor(data);
        await this.epubReader.load(data.id, await blob.arrayBuffer());
      } else {
        // Covers a book uploaded before automatic conversion existed, or one
        // whose automatic trigger silently failed — this doubles as retry.
        const result = await triggerConversion(data.id);
        alert(
          result.ok
            ? `${result.message} Come back in a bit and try again.`
            : `Could not convert this ${data.format.toUpperCase()} file: ${result.message}`,
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not open this book.');
    }
  }

  private initReadersTrigger(): void {
    this.viewBookBtn.addEventListener('click', async () => {
      const active = this.activeBookGetter();
      if (!active) return;

      const meta = this.shelfMgr.bookMetaMap.get(active)!;
      const data = this.shelfMgr.entries[meta.index];

      // The public-domain demo opens for anyone; everything else needs a seat.
      if (data.is_public || this.auth.isMember) {
        await this.openBook(data);
        return;
      }
      this.pendingBook = data;
      this.openAuthModal();
    });
  }

  // ------------------------------------------------------------- inspect UI --
  public async showInspectUI(data: BookData): Promise<void> {
    this.header.style.opacity = '0';
    this.statusInd.style.opacity = '0';
    this.footer.style.opacity = '0';
    this.navLeft.style.opacity = '0';
    this.navRight.style.opacity = '0';
    document.getElementById('category-filters')!.style.opacity = '0';

    this.focusTitle.innerText = data.title;
    this.focusAuthor.innerText = data.author;

    this.focusOverlay.classList.remove('hidden');
    this.focusDetails.classList.remove('hidden');
    this.returnBtn.classList.remove('hidden');
    this.inspectBtn.classList.add('hidden');

    this.viewBookBtn.textContent =
      data.is_public || this.auth.isMember ? 'READ' : 'SIGN IN TO READ';

    await this.showCircleProgress(data);
  }

  /** "Where has my friend got to" — shown on the book detail panel. */
  private async showCircleProgress(data: BookData): Promise<void> {
    this.circleNote.textContent = '';
    if (!this.auth.isMember) return;

    const others = await this.progress.loadCircle(data.id);
    if (others.length === 0) return;

    const lines = others.map((p) => {
      const who = this.auth.memberFor(p.user_id)?.display_name ?? 'Someone';
      return `${who} is at ${Math.round(p.percentage * 100)}%`;
    });
    this.circleNote.textContent = lines.join(' · ');
  }

  public hideInspectUI(): void {
    this.focusDetails.classList.add('hidden');
    this.returnBtn.classList.add('hidden');
    this.inspectBtn.classList.remove('hidden');

    this.header.style.opacity = '1';
    this.statusInd.style.opacity = '1';
    this.footer.style.opacity = '1';
    this.navLeft.style.opacity = '1';
    this.navRight.style.opacity = '1';
    document.getElementById('category-filters')!.style.opacity = '1';
  }

  public updateFocusUI(index: number): void {
    const data = this.shelfMgr.entries[index];
    if (!data) return;
    this.focusOverlay.classList.remove('hidden');

    this.focusIndex.innerHTML = '';
    const cur = document.createElement('span');
    cur.textContent = (index + 1).toString().padStart(2, '0');
    const line = document.createElement('div');
    line.className = 'focus-line';
    const total = document.createElement('span');
    total.textContent = this.shelfMgr.books.length.toString().padStart(2, '0');
    this.focusIndex.append(cur, line, total);

    this.focusTitle.innerText = data.title;
    this.focusAuthor.innerText = data.author;
  }

  public updateScrubber(currentScroll: number, maxScroll: number): void {
    const pct = maxScroll > 0 ? currentScroll / maxScroll : 0;
    this.scrubberThumb.style.left = `${pct * 100}%`;
  }

  public tooltip(title: string, author: string, x: number, y: number, show: boolean): void {
    if (!show) {
      this.hoverTooltip.classList.remove('visible');
      return;
    }
    this.hoverTooltip.innerText = `${title} — ${author}`;
    this.hoverTooltip.classList.add('visible');
    this.hoverTooltip.style.left = `${x}px`;
    this.hoverTooltip.style.top = `${y}px`;
  }
}
