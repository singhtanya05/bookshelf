import ePub from 'epubjs';
import { HistoryStore } from '../utils/HistoryStore';

export class EPUBReader {
  public currentBook: any = null;
  public currentRendition: any = null;

  private epubOverlay: HTMLElement;
  private epubViewer: HTMLElement;
  private epubProgress: HTMLElement;

  private epubSpread: 'none' | 'auto';
  private epubFontSize: number;
  private epubFontFamily: string;
  private activeBookTitleGetter: () => string;

  constructor(
    epubOverlay: HTMLElement,
    epubViewer: HTMLElement,
    epubProgress: HTMLElement,
    activeBookTitleGetter: () => string
  ) {
    this.epubOverlay = epubOverlay;
    this.epubViewer = epubViewer;
    this.epubProgress = epubProgress;
    this.activeBookTitleGetter = activeBookTitleGetter;

    this.epubSpread = HistoryStore.getEpubSpread();
    this.epubFontSize = HistoryStore.getEpubFontSize();
    this.epubFontFamily = HistoryStore.getEpubFontFamily();
  }

  public load(url: string, startCfi?: string): void {
    this.epubOverlay.classList.remove('hidden');
    if (this.currentBook) {
      this.currentBook.destroy();
    }
    this.epubViewer.innerHTML = '';
    this.currentBook = ePub(url);
    this.currentRendition = this.currentBook.renderTo(this.epubViewer, {
      width: "100%",
      height: "100%",
      spread: this.epubSpread,
      manager: "continuous",
      flow: "paginated"
    });

    if (this.epubSpread === 'auto') {
      this.epubViewer.classList.add('spread-mode');
    } else {
      this.epubViewer.classList.remove('spread-mode');
    }

    this.registerThemes();

    const savedTheme = HistoryStore.getEpubTheme();
    this.applyTheme(savedTheme);

    this.currentRendition.themes.font(this.epubFontFamily);
    this.currentRendition.themes.fontSize(`${this.epubFontSize}%`);

    const title = this.activeBookTitleGetter();
    let targetCfi = startCfi;
    if (!targetCfi) {
      targetCfi = HistoryStore.getEpubCfi(title) || undefined;
    }

    if (targetCfi) {
      this.currentRendition.display(targetCfi);
    } else {
      this.currentRendition.display();
    }

    this.currentBook.ready.then(() => {
      return this.currentBook.locations.generate(1600);
    }).then(() => {
      const currentLocation = this.currentRendition.currentLocation();
      if (currentLocation) {
        this.epubProgress.innerText = Math.round(currentLocation.start.percentage * 100) + '%';
      }
    });

    this.currentRendition.on('relocated', (location: any) => {
      if (location) {
        HistoryStore.setEpubCfi(title, location.start.cfi);
        if (this.currentBook.locations.length() > 0) {
          this.epubProgress.innerText = Math.round(location.start.percentage * 100) + '%';
        }
      }
    });

    this.currentRendition.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') this.animateTurn('next');
      if (e.key === 'ArrowLeft') this.animateTurn('prev');
      if (e.key === 'Escape') this.close();
    });
  }

  private registerThemes(): void {
    this.currentRendition.themes.register('light', {
      html: { 'background-color': '#fff !important' },
      body: { 'color': '#2A2A28 !important', 'background-color': '#fff !important', 'line-height': '1.8' },
      p: { 'color': '#2A2A28 !important', 'margin-bottom': '1.5em' },
      span: { 'color': '#2A2A28 !important' },
      div: { 'color': '#2A2A28 !important' },
      h1: { 'color': '#2A2A28 !important' },
      h2: { 'color': '#2A2A28 !important' },
      h3: { 'color': '#2A2A28 !important' }
    });

    this.currentRendition.themes.register('sepia', {
      html: { 'background-color': '#f4ecd8 !important' },
      body: { 'color': '#5b4636 !important', 'background-color': '#f4ecd8 !important', 'line-height': '1.8' },
      p: { 'color': '#5b4636 !important', 'margin-bottom': '1.5em' },
      span: { 'color': '#5b4636 !important' },
      div: { 'color': '#5b4636 !important' },
      h1: { 'color': '#5b4636 !important' },
      h2: { 'color': '#5b4636 !important' },
      h3: { 'color': '#5b4636 !important' }
    });

    this.currentRendition.themes.register('dark', {
      html: { 'background-color': '#1a1a1a !important' },
      body: { 'color': '#e0e0e0 !important', 'background-color': '#1a1a1a !important', 'line-height': '1.8' },
      p: { 'color': '#e0e0e0 !important', 'margin-bottom': '1.5em' },
      span: { 'color': '#e0e0e0 !important' },
      div: { 'color': '#e0e0e0 !important' },
      h1: { 'color': '#ffffff !important' },
      h2: { 'color': '#ffffff !important' },
      h3: { 'color': '#ffffff !important' }
    });
  }

  public applyTheme(themeName: string): void {
    if (!this.currentRendition) return;
    this.currentRendition.themes.select(themeName);
    HistoryStore.setEpubTheme(themeName);

    if (themeName === 'light') {
      document.documentElement.style.setProperty('--theme-bg', '#FDFBF7');
      document.documentElement.style.setProperty('--theme-reader-bg', '#fff');
      document.documentElement.style.setProperty('--theme-text', '#2A2A28');
    } else if (themeName === 'sepia') {
      document.documentElement.style.setProperty('--theme-bg', '#e8e0cc');
      document.documentElement.style.setProperty('--theme-reader-bg', '#f4ecd8');
      document.documentElement.style.setProperty('--theme-text', '#5b4636');
    } else if (themeName === 'dark') {
      document.documentElement.style.setProperty('--theme-bg', '#121212');
      document.documentElement.style.setProperty('--theme-reader-bg', '#1a1a1a');
      document.documentElement.style.setProperty('--theme-text', '#e0e0e0');
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
    });
  }

  public toggleSpread(url: string): void {
    if (!this.currentRendition) return;
    const currentLocation = this.currentRendition.currentLocation();
    const cfi = currentLocation ? currentLocation.start.cfi : undefined;

    this.epubSpread = this.epubSpread === 'auto' ? 'none' : 'auto';
    HistoryStore.setEpubSpread(this.epubSpread);
    this.load(url, cfi);
  }

  public changeFontSize(delta: number): void {
    this.epubFontSize = Math.max(50, Math.min(250, this.epubFontSize + delta));
    HistoryStore.setEpubFontSize(this.epubFontSize);
    if (this.currentRendition) {
      this.currentRendition.themes.fontSize(`${this.epubFontSize}%`);
    }
  }

  public changeFontFamily(family: string): void {
    this.epubFontFamily = family;
    HistoryStore.setEpubFontFamily(family);
    if (this.currentRendition) {
      this.currentRendition.themes.font(family);
    }
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

      setTimeout(() => {
        this.epubViewer.classList.remove(inClass);
      }, 500);
    }, 300);
  }

  public close(): void {
    this.epubOverlay.classList.add('hidden');
    if (this.currentBook) {
      this.currentBook.destroy();
      this.currentBook = null;
      this.currentRendition = null;
    }
  }
}
