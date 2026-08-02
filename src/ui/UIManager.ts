import { type BookData, ShelfManager } from '../components/ShelfManager';
import { EPUBReader } from '../readers/EPUBReader';
import { PDFReader } from '../readers/PDFReader';
import * as THREE from 'three';

export class UIManager {
  private shelfMgr: ShelfManager;
  private epubReader: EPUBReader;
  private pdfReader: PDFReader;
  private bookData: BookData[];

  private header: HTMLElement;
  private statusInd: HTMLElement;
  private footer: HTMLElement;
  private navLeft: HTMLButtonElement;
  private navRight: HTMLButtonElement;
  private inspectBtn: HTMLButtonElement;
  
  private focusOverlay: HTMLElement;
  private focusIndex: HTMLElement;
  private focusTitle: HTMLElement;
  private focusAuthor: HTMLElement;
  
  private returnBtn: HTMLButtonElement;
  private focusDetails: HTMLElement;
  private viewBookBtn: HTMLButtonElement;
  
  private hoverTooltip: HTMLElement;
  private scrubberThumb: HTMLElement;
  private scrubberTicks: HTMLElement;
  
  private searchInput: HTMLInputElement;
  private searchResults: HTMLElement;

  private activeBookGetter: () => THREE.Group | null;
  private inspectBookHandler: (book: THREE.Group) => void;

  constructor(
    shelfMgr: ShelfManager,
    epubReader: EPUBReader,
    pdfReader: PDFReader,
    bookData: BookData[],
    activeBookGetter: () => THREE.Group | null,
    inspectBookHandler: (book: THREE.Group) => void
  ) {
    this.shelfMgr = shelfMgr;
    this.epubReader = epubReader;
    this.pdfReader = pdfReader;
    this.bookData = bookData;
    this.activeBookGetter = activeBookGetter;
    this.inspectBookHandler = inspectBookHandler;

    this.header = document.querySelector('.header') as HTMLElement;
    this.statusInd = document.querySelector('.status-indicator') as HTMLElement;
    this.footer = document.querySelector('.footer') as HTMLElement;
    this.navLeft = document.querySelector('#nav-left') as HTMLButtonElement;
    this.navRight = document.querySelector('#nav-right') as HTMLButtonElement;
    this.inspectBtn = document.querySelector('#inspect-button') as HTMLButtonElement;

    this.focusOverlay = document.querySelector('#focus-overlay') as HTMLElement;
    this.focusIndex = document.querySelector('#focus-index') as HTMLElement;
    this.focusTitle = document.querySelector('#focus-title') as HTMLElement;
    this.focusAuthor = document.querySelector('#focus-author') as HTMLElement;

    this.returnBtn = document.querySelector('#return-button') as HTMLButtonElement;
    this.focusDetails = document.querySelector('#focus-details') as HTMLElement;
    this.viewBookBtn = document.querySelector('.view-book-link') as HTMLButtonElement;

    this.hoverTooltip = document.querySelector('#hover-tooltip') as HTMLElement;
    this.scrubberThumb = document.querySelector('#scrubber-thumb') as HTMLElement;
    this.scrubberTicks = document.querySelector('.scrubber-ticks') as HTMLElement;

    this.searchInput = document.getElementById('search-input') as HTMLInputElement;
    this.searchResults = document.getElementById('search-results') as HTMLElement;

    this.initCounters();
    this.initScrubber();
    this.initCategoryFilters();
    this.initSearch();
    this.initNavigation();
    this.initReadersTrigger();
  }

  private initCounters(): void {
    const bookCount = this.bookData.length;
    const headerVolumeCount = document.getElementById('header-volume-count');
    if (headerVolumeCount) headerVolumeCount.innerText = `${bookCount} VOLUMES`;

    const statusVolumeCount = document.getElementById('status-volume-count');
    if (statusVolumeCount) statusVolumeCount.innerText = `${bookCount} VOLUMES READY`;
  }

  private initScrubber(): void {
    const bookCount = this.bookData.length;
    if (this.scrubberTicks) {
      this.scrubberTicks.innerHTML = '';
      for (let i = 0; i < bookCount; i++) {
        const tick = document.createElement('div');
        tick.className = 'scrubber-tick';
        tick.style.left = `${(i / (bookCount - 1)) * 100}%`;
        this.scrubberTicks.appendChild(tick);
      }
    }
  }

  private initCategoryFilters(): void {
    const categoryFiltersContainer = document.getElementById('category-filters')!;
    const uniqueCategories = ['All', ...new Set(this.bookData.map(b => b.category || 'Uncategorized'))];

    uniqueCategories.forEach(cat => {
      if (!cat) return;
      const btn = document.createElement('button');
      btn.className = 'category-btn';
      btn.innerText = cat;
      if (cat === 'All') btn.classList.add('active');
      
      btn.addEventListener('click', () => {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.shelfMgr.filterBooks(cat);
      });
      
      categoryFiltersContainer.appendChild(btn);
    });
  }

  private initSearch(): void {
    const bookCount = this.bookData.length;
    this.searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
      
      if (query.length === 0) {
        this.searchResults.classList.add('hidden');
        return;
      }
      
      this.searchResults.innerHTML = '';
      let matchCount = 0;
      
      for (let i = 0; i < bookCount; i++) {
        const data = this.bookData[i];
        if (data.title.toLowerCase().includes(query) || data.author.toLowerCase().includes(query)) {
          matchCount++;
          const item = document.createElement('div');
          item.className = 'search-result-item';
          item.innerHTML = `
            <div class="search-item-title">${data.title}</div>
            <div class="search-item-author">${data.author}</div>
          `;
          
          item.addEventListener('click', () => {
            this.searchInput.value = '';
            this.searchResults.classList.add('hidden');
            
            const book = this.shelfMgr.books[i];
            const meta = this.shelfMgr.bookMetaMap.get(book)!;
            this.shelfMgr.scrollTarget = meta.centerPosX;
            
            setTimeout(() => {
              this.inspectBookHandler(book);
            }, 800);
          });
          
          this.searchResults.appendChild(item);
        }
      }
      
      if (matchCount > 0) {
        this.searchResults.classList.remove('hidden');
      } else {
        this.searchResults.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.searchInput.contains(e.target as Node) && !this.searchResults.contains(e.target as Node)) {
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
      const activeBook = this.activeBookGetter();
      if (activeBook) this.inspectBookHandler(activeBook);
    });
  }

  private initReadersTrigger(): void {
    this.viewBookBtn.addEventListener('click', () => {
      const activeBook = this.activeBookGetter();
      if (!activeBook) return;
      
      const meta = this.shelfMgr.bookMetaMap.get(activeBook)!;
      const data = this.bookData[meta.index];
      
      if (data.epubUrl) {
        this.epubReader.load(data.epubUrl);
      } else if (data.pdfUrl) {
        this.pdfReader.load(data.pdfUrl);
      } else {
        alert("This physical volume is currently not available for digital reading.");
      }
    });
  }

  public showInspectUI(title: string, author: string): void {
    this.header.style.opacity = '0';
    this.statusInd.style.opacity = '0';
    this.footer.style.opacity = '0';
    this.navLeft.style.opacity = '0';
    this.navRight.style.opacity = '0';
    
    const categoryFiltersContainer = document.getElementById('category-filters')!;
    categoryFiltersContainer.style.opacity = '0';

    this.focusTitle.innerText = title;
    this.focusAuthor.innerText = author;
    
    this.focusOverlay.classList.remove('hidden');
    this.focusDetails.classList.remove('hidden');
    this.returnBtn.classList.remove('hidden');
    this.inspectBtn.classList.add('hidden');
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

    const categoryFiltersContainer = document.getElementById('category-filters')!;
    categoryFiltersContainer.style.opacity = '1';
  }

  public updateFocusUI(index: number): void {
    this.focusOverlay.classList.remove('hidden');
    const data = this.bookData[index];
    this.focusIndex.innerHTML = `
      <span>${(index + 1).toString().padStart(2, '0')}</span>
      <div class="focus-line"></div>
      <span>${this.shelfMgr.books.length.toString().padStart(2, '0')}</span>
    `;
    this.focusTitle.innerText = data.title;
    this.focusAuthor.innerText = data.author;
  }

  public updateScrubber(currentScroll: number, maxScroll: number): void {
    const scrollPercent = currentScroll / maxScroll;
    this.scrubberThumb.style.left = `${scrollPercent * 100}%`;
  }

  public tooltip(title: string, author: string, x: number, y: number, show: boolean): void {
    if (show) {
      this.hoverTooltip.innerText = `${title} — ${author}`;
      this.hoverTooltip.classList.add('visible');
      this.hoverTooltip.style.left = `${x}px`;
      this.hoverTooltip.style.top = `${y}px`;
    } else {
      this.hoverTooltip.classList.remove('visible');
    }
  }
}
