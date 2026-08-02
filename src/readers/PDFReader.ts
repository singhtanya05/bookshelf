import * as pdfjsLib from 'pdfjs-dist';
import { HistoryStore } from '../utils/HistoryStore';

// Configure pdfjs worker to use CDN to avoid Vite build issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  
  private pdfPageCurrent: HTMLElement;
  private pdfPageTotal: HTMLElement;
  private pdfProgressPercent: HTMLElement;
  private pdfPrevBtn: HTMLButtonElement;
  private pdfNextBtn: HTMLButtonElement;
  
  private activeBookTitleGetter: () => string;

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
    activeBookTitleGetter: () => string
  ) {
    this.pdfOverlay = pdfOverlay;
    this.pdfPageWrapper = pdfPageWrapper;
    this.pdfCanvas = pdfCanvas;
    this.pdfCtx = pdfCanvas.getContext('2d')!;
    this.pdfTextLayer = pdfTextLayer;
    
    this.pdfPageCurrent = pdfPageCurrent;
    this.pdfPageTotal = pdfPageTotal;
    this.pdfProgressPercent = pdfProgressPercent;
    this.pdfPrevBtn = pdfPrevBtn;
    this.pdfNextBtn = pdfNextBtn;
    this.activeBookTitleGetter = activeBookTitleGetter;
  }

  public load(url: string): void {
    this.pdfOverlay.classList.remove('hidden');
    pdfjsLib.getDocument({ url }).promise.then((doc) => {
      this.pdfDoc = doc;
      this.pdfPageTotal.textContent = this.pdfDoc.numPages.toString().padStart(2, '0');
      
      const title = this.activeBookTitleGetter();
      this.pageNum = HistoryStore.getPdfPage(title);
      
      if (this.pageNum < 1) this.pageNum = 1;
      if (this.pageNum > this.pdfDoc.numPages) this.pageNum = this.pdfDoc.numPages;
      
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
    
    HistoryStore.setPdfPage(this.activeBookTitleGetter(), num);
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
  }
}
