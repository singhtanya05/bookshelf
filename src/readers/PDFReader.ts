import * as pdfjsLib from 'pdfjs-dist';
import type { ProgressStore } from '../data/ProgressStore';
import type { AnnotationStore, Annotation } from '../data/AnnotationStore';
import type { AuthManager } from '../auth/AuthManager';

// Configure pdfjs worker to use CDN to avoid Vite build issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PdfSelectionEvent {
  cfiRange: string;
  text: string;
  x: number;
  y: number;
}

/**
 * A PDF has no CFI, so a highlight's location is encoded as a plain string:
 *   pdf:<page>:<x,y,w,h fractions of the page, one rect per line-segment>
 * Fractions rather than pixels because the canvas is re-rendered at a
 * different size on every resize/reopen (renderPage() picks a fresh scale
 * from window.innerHeight) — a rect stored in pixels would drift out from
 * under its text the next time the page renders at a different size.
 */
function encodeLocation(page: number, rects: DOMRect[], pageRect: DOMRect): string {
  const encoded = rects
    .map((r) => {
      const x = (r.left - pageRect.left) / pageRect.width;
      const y = (r.top - pageRect.top) / pageRect.height;
      const w = r.width / pageRect.width;
      const h = r.height / pageRect.height;
      return `${x.toFixed(4)},${y.toFixed(4)},${w.toFixed(4)},${h.toFixed(4)}`;
    })
    .join(';');
  return `pdf:${page}:${encoded}`;
}

function decodeLocation(cfiRange: string): { page: number; rects: Array<[number, number, number, number]> } | null {
  const m = /^pdf:(\d+):(.*)$/.exec(cfiRange);
  if (!m) return null;
  const page = parseInt(m[1], 10);
  const rects = m[2]
    .split(';')
    .filter(Boolean)
    .map((seg) => seg.split(',').map(Number) as [number, number, number, number]);
  return { page, rects };
}

export class PDFReader {
  public pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  public pageNum = 1;
  public pageRendering = false;
  private pageNumPending: number | null = null;

  private pdfOverlay: HTMLElement;
  private pdfPageWrapper: HTMLElement;
  private pdfCanvas: HTMLCanvasElement;
  private pdfCtx: CanvasRenderingContext2D;
  private pdfTextLayer: HTMLElement;
  private pdfHighlightLayer: HTMLElement;

  private pdfPageCurrent: HTMLElement;
  private pdfPageTotal: HTMLElement;
  private pdfProgressPercent: HTMLElement;
  private pdfPrevBtn: HTMLButtonElement;
  private pdfNextBtn: HTMLButtonElement;

  private progress: ProgressStore;
  private annotations: AnnotationStore;
  private auth: AuthManager;
  private bookId: string | null = null;

  /** Set by UIManager/AnnotationUI to raise the highlight popup. */
  public onSelection: ((sel: PdfSelectionEvent) => void) | null = null;
  /** Set by UIManager/AnnotationUI to open an existing annotation. */
  public onAnnotationClick: ((annotation: Annotation) => void) | null = null;

  constructor(
    pdfOverlay: HTMLElement,
    pdfPageWrapper: HTMLElement,
    pdfCanvas: HTMLCanvasElement,
    pdfTextLayer: HTMLElement,
    pdfPageCurrent: HTMLElement,
    pdfPageTotal: HTMLElement,
    pdfProgressPercent: HTMLElement,
    pdfPrevBtn: HTMLButtonElement,
    pdfNextBtn: HTMLButtonElement,
    progress: ProgressStore,
    annotations: AnnotationStore,
    auth: AuthManager,
  ) {
    this.pdfOverlay = pdfOverlay;
    this.pdfPageWrapper = pdfPageWrapper;
    this.pdfCanvas = pdfCanvas;
    this.pdfCtx = pdfCanvas.getContext('2d')!;
    this.pdfTextLayer = pdfTextLayer;
    this.pdfHighlightLayer = document.getElementById('pdf-highlight-layer') as HTMLElement;

    this.pdfPageCurrent = pdfPageCurrent;
    this.pdfPageTotal = pdfPageTotal;
    this.pdfProgressPercent = pdfProgressPercent;
    this.pdfPrevBtn = pdfPrevBtn;
    this.pdfNextBtn = pdfNextBtn;
    this.progress = progress;
    this.annotations = annotations;
    this.auth = auth;

    this.pdfTextLayer.addEventListener('mouseup', () => this.handleSelection());
  }

  /** @param url blob URL from BookVault, never a public path */
  public load(bookId: string, url: string): void {
    this.bookId = bookId;
    this.pdfOverlay.classList.remove('hidden');
    pdfjsLib.getDocument({ url }).promise.then(async (doc) => {
      this.pdfDoc = doc;
      this.pdfPageTotal.textContent = this.pdfDoc.numPages.toString().padStart(2, '0');

      const saved = this.progress.getLocal(bookId);
      this.pageNum = saved?.location ? parseInt(saved.location, 10) || 1 : 1;

      if (this.pageNum < 1) this.pageNum = 1;
      if (this.pageNum > this.pdfDoc.numPages) this.pageNum = this.pdfDoc.numPages;

      await this.annotations.load(bookId);
      this.renderPage(this.pageNum);
    });
  }

  public renderPage(num: number): void {
    if (!this.pdfDoc) return;
    this.pageRendering = true;

    this.pdfDoc.getPage(num).then((page) => {
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const dynamicScale = (window.innerHeight * 0.75) / unscaledViewport.height;
      const viewport = page.getViewport({ scale: dynamicScale });

      this.pdfCanvas.height = viewport.height;
      this.pdfCanvas.width = viewport.width;

      this.pdfTextLayer.style.width = `${viewport.width}px`;
      this.pdfTextLayer.style.height = `${viewport.height}px`;
      this.pdfHighlightLayer.style.width = `${viewport.width}px`;
      this.pdfHighlightLayer.style.height = `${viewport.height}px`;

      const renderContext: any = {
        canvasContext: this.pdfCtx,
        viewport: viewport
      };

      this.pdfTextLayer.innerHTML = '';

      const renderTask = page.render(renderContext);
      renderTask.promise.then(() => {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: this.pdfTextLayer,
          viewport: viewport
        });
        textLayer.render();

        this.pageRendering = false;
        this.pdfPageWrapper.classList.remove('fade-out', 'fade-in');
        this.renderAnnotations();

        if (this.pageNumPending !== null) {
          this.renderPage(this.pageNumPending);
          this.pageNumPending = null;
        }
      });
    });

    this.pdfPageCurrent.textContent = num.toString().padStart(2, '0');

    const progress = Math.round((num / this.pdfDoc.numPages) * 100);
    this.pdfProgressPercent.textContent = ` (${progress}%)`;

    this.pdfPrevBtn.disabled = num <= 1;
    this.pdfNextBtn.disabled = num >= this.pdfDoc.numPages;

    if (this.bookId) {
      this.progress.save(this.bookId, String(num), num / this.pdfDoc.numPages);
    }
  }

  private handleSelection(): void {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!sel || !text || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Stash the raw selection so commitHighlight/saveNote can re-derive the
    // per-line rects at save time without re-parsing the DOM selection twice.
    this.pendingRange = range.cloneRange();
    this.pendingText = text;

    this.onSelection?.({ cfiRange: '', text, x: rect.left + rect.width / 2, y: rect.top });
  }

  private pendingRange: Range | null = null;
  private pendingText: string | null = null;

  /** Called by AnnotationUI once the user picks a colour or writes a note. */
  public encodePendingSelection(): { cfiRange: string; text: string } | null {
    if (!this.pendingRange || !this.pendingText) return null;
    const pageRect = this.pdfPageWrapper.getBoundingClientRect();
    const rects = [...this.pendingRange.getClientRects()];
    const cfiRange = encodeLocation(this.pageNum, rects, pageRect);
    return { cfiRange, text: this.pendingText };
  }

  public clearSelection(): void {
    window.getSelection()?.removeAllRanges();
    this.pendingRange = null;
    this.pendingText = null;
  }

  /** Redraw every highlight that belongs on the currently-rendered page. */
  public renderAnnotations(): void {
    if (!this.bookId) return;
    this.pdfHighlightLayer.innerHTML = '';

    for (const a of this.annotations.forBook(this.bookId)) {
      if (a.type === 'bookmark') continue;
      const loc = decodeLocation(a.cfi_range);
      if (!loc || loc.page !== this.pageNum) continue;

      const author = this.auth.memberFor(a.user_id);
      const color = a.color || author?.color || '#FFD54F';

      for (const [x, y, w, h] of loc.rects) {
        const mark = document.createElement('div');
        mark.className = 'pdf-highlight-mark';
        mark.style.left = `${x * 100}%`;
        mark.style.top = `${y * 100}%`;
        mark.style.width = `${w * 100}%`;
        mark.style.height = `${h * 100}%`;
        mark.style.background = color;
        mark.addEventListener('click', () => this.onAnnotationClick?.(a));
        this.pdfHighlightLayer.appendChild(mark);
      }
    }
  }

  public displayAt(cfiRange: string): void {
    const loc = decodeLocation(cfiRange);
    if (!loc || !this.pdfDoc) return;
    this.pageNum = Math.min(Math.max(loc.page, 1), this.pdfDoc.numPages);
    this.queueRenderPage(this.pageNum);
  }

  public get activeBookId(): string | null {
    return this.bookId;
  }

  public queueRenderPage(num: number): void {
    this.pdfPageWrapper.classList.add('fade-out');

    setTimeout(() => {
      this.pdfPageWrapper.classList.remove('fade-out');
      this.pdfPageWrapper.classList.add('fade-in');

      if (this.pageRendering) {
        this.pageNumPending = num;
      } else {
        this.renderPage(num);
      }
    }, 250);
  }

  public prevPage(): void {
    if (this.pageNum <= 1) return;
    this.pageNum--;
    this.queueRenderPage(this.pageNum);
  }

  public nextPage(): void {
    if (!this.pdfDoc || this.pageNum >= this.pdfDoc.numPages) return;
    this.pageNum++;
    this.queueRenderPage(this.pageNum);
  }

  public close(): void {
    this.pdfOverlay.classList.add('hidden');
    this.pdfHighlightLayer.innerHTML = '';
    this.bookId = null;
    this.pdfDoc = null;
  }
}
