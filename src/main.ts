import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { SceneManager } from './core/SceneManager';
import { ShelfManager, type BookData } from './components/ShelfManager';
import { EPUBReader } from './readers/EPUBReader';
import { PDFReader } from './readers/PDFReader';
import { InteractionManager } from './interaction/InteractionManager';
import { UIManager } from './ui/UIManager';
import bookDataJson from './bookData.json';

// Make bookData accessible to dynamic modules
const bookData: BookData[] = bookDataJson as BookData[];
(window as any).bookData = bookData;

// --- Initialize Core Modules ---
const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
const sceneMgr = new SceneManager(canvas);
const shelfMgr = new ShelfManager(sceneMgr.scene, bookData, sceneMgr.renderer.capabilities.getMaxAnisotropy());

// --- Initialize State ---
let isInspectMode = false;
let activeBook: THREE.Group | null = null;
let focusedIndex = -1;

// --- Initialize Readers ---
const epubOverlay = document.getElementById('epub-overlay') as HTMLElement;
const epubViewer = document.getElementById('epub-viewer') as HTMLElement;
const epubProgress = document.getElementById('epub-progress') as HTMLElement;

const epubReader = new EPUBReader(
  epubOverlay,
  epubViewer,
  epubProgress,
  () => activeBook ? bookData[shelfMgr.bookMetaMap.get(activeBook)!.index].title : ''
);

const pdfOverlay = document.getElementById('pdf-reader-overlay') as HTMLElement;
const pdfPageWrapper = document.querySelector('.pdf-page-wrapper') as HTMLElement;
const pdfCanvas = document.getElementById('pdf-render-canvas') as HTMLCanvasElement;
const pdfTextLayer = document.getElementById('pdf-text-layer') as HTMLElement;
const pdfPageCurrent = document.getElementById('pdf-page-current') as HTMLElement;
const pdfPageTotal = document.getElementById('pdf-page-total') as HTMLElement;
const pdfProgressPercent = document.getElementById('pdf-progress-percent') as HTMLElement;
const pdfPrevBtn = document.getElementById('pdf-prev-btn') as HTMLButtonElement;
const pdfNextBtn = document.getElementById('pdf-next-btn') as HTMLButtonElement;

const pdfReader = new PDFReader(
  pdfOverlay,
  pdfPageWrapper,
  pdfCanvas,
  pdfTextLayer,
  pdfPageCurrent,
  pdfPageTotal,
  pdfProgressPercent,
  pdfPrevBtn,
  pdfNextBtn,
  () => activeBook ? bookData[shelfMgr.bookMetaMap.get(activeBook)!.index].title : ''
);

// --- Initialize UI & Interactions ---
const uiMgr = new UIManager(
  shelfMgr,
  epubReader,
  pdfReader,
  bookData,
  () => activeBook || (focusedIndex >= 0 ? shelfMgr.books[focusedIndex] : null),
  inspectBook
);

const interactMgr = new InteractionManager(
  sceneMgr,
  shelfMgr,
  () => isInspectMode,
  inspectBook,
  (idx) => {
    if (focusedIndex !== idx) {
      focusedIndex = idx;
      uiMgr.updateFocusUI(focusedIndex);
    }
  },
  (title, author, x, y, show) => uiMgr.tooltip(title, author, x, y, show)
);

// --- EPUB Layout and Settings Trigger ---
const epubLayoutBtn = document.getElementById('epub-layout-btn') as HTMLElement;
epubLayoutBtn.addEventListener('click', () => {
  if (!activeBook) return;
  const data = bookData[shelfMgr.bookMetaMap.get(activeBook)!.index];
  if (data.epubUrl) {
    epubReader.toggleSpread(data.epubUrl);
  }
});

const fontSizeDecBtn = document.getElementById('font-size-dec') as HTMLButtonElement;
const fontSizeIncBtn = document.getElementById('font-size-inc') as HTMLButtonElement;
const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement;
const themeBtns = document.querySelectorAll('.theme-btn');

fontSizeIncBtn.addEventListener('click', () => epubReader.changeFontSize(10));
fontSizeDecBtn.addEventListener('click', () => epubReader.changeFontSize(-10));
fontFamilySelect.addEventListener('change', (e) => epubReader.changeFontFamily((e.target as HTMLSelectElement).value));

themeBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget as HTMLElement;
    const theme = target.getAttribute('data-theme');
    if (theme) {
      epubReader.applyTheme(theme);
    }
  });
});

const closeEpubBtn = document.getElementById('close-epub-btn') as HTMLElement;
const epubPrevBtn = document.getElementById('epub-prev-btn') as HTMLElement;
const epubNextBtn = document.getElementById('epub-next-btn') as HTMLElement;

epubNextBtn.addEventListener('click', () => epubReader.animateTurn('next'));
epubPrevBtn.addEventListener('click', () => epubReader.animateTurn('prev'));
closeEpubBtn.addEventListener('click', () => epubReader.close());

// --- PDF Header Events ---
const closePdfBtn = document.getElementById('close-pdf-btn') as HTMLButtonElement;
pdfPrevBtn.addEventListener('click', () => pdfReader.prevPage());
pdfNextBtn.addEventListener('click', () => pdfReader.nextPage());
closePdfBtn.addEventListener('click', () => pdfReader.close());

// --- Return Button ---
const returnBtn = document.querySelector('#return-button') as HTMLButtonElement;
returnBtn.addEventListener('click', () => {
  if (!activeBook) return;
  
  shelfMgr.shelfGroup.visible = true;
  canvas.classList.remove('inspect-shift');
  
  uiMgr.hideInspectUI();
  sceneMgr.controls.enabled = false;
  
  gsap.to(sceneMgr.camera.position, {
    x: 0,
    y: 0.5,
    z: 5.5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(sceneMgr.controls.target, {
    x: 0,
    y: 0.5,
    z: 0,
    duration: 1,
    ease: "power3.inOut"
  });
  
  const meta = shelfMgr.bookMetaMap.get(activeBook)!;
  
  // 1. Save current state
  const currentWorldPos = new THREE.Vector3();
  const currentWorldQuat = new THREE.Quaternion();
  activeBook.getWorldPosition(currentWorldPos);
  activeBook.getWorldQuaternion(currentWorldQuat);
  
  // 2. Calculate target state by temporarily attaching to shelf
  const targetWorldPos = new THREE.Vector3();
  const targetWorldQuat = new THREE.Quaternion();
  
  meta.originalParent.add(activeBook);
  activeBook.position.copy(meta.originalPosition);
  activeBook.rotation.copy(meta.originalRotation);
  activeBook.updateMatrixWorld(true);
  activeBook.getWorldPosition(targetWorldPos);
  activeBook.getWorldQuaternion(targetWorldQuat);
  
  // 3. Move back to scene and restore current state to begin animation
  sceneMgr.scene.add(activeBook);
  activeBook.position.copy(currentWorldPos);
  activeBook.quaternion.copy(currentWorldQuat);
  
  gsap.to(activeBook.position, {
    x: targetWorldPos.x,
    y: targetWorldPos.y,
    z: targetWorldPos.z,
    duration: 1,
    ease: "power3.inOut"
  });
  
  const qObj = { t: 0 };
  const startQuat = activeBook.quaternion.clone();
  gsap.to(qObj, {
    t: 1,
    duration: 1,
    ease: "power3.inOut",
    onUpdate: () => {
      activeBook!.quaternion.slerpQuaternions(startQuat, targetWorldQuat, qObj.t);
    },
    onComplete: () => {
      meta.originalParent.add(activeBook!);
      activeBook!.position.copy(meta.originalPosition);
      activeBook!.rotation.copy(meta.originalRotation);
      activeBook = null;
      isInspectMode = false;
      
      // Update UI Manager
      uiMgr.hideInspectUI();
    }
  });
  
  gsap.to(shelfMgr.shelfGroup.position, {
    y: 0,
    duration: 1,
    ease: "power2.inOut"
  });
});

// --- Inspection Triggers ---
function inspectBook(book: THREE.Group): void {
  isInspectMode = true;
  activeBook = book;
  
  const meta = shelfMgr.bookMetaMap.get(book)!;
  const data = bookData[meta.index];
  
  uiMgr.showInspectUI(data.title, data.author);
  
  shelfMgr.shelfGroup.visible = false;
  
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  book.getWorldPosition(worldPos);
  book.getWorldQuaternion(worldQuat);
  
  sceneMgr.scene.add(book);
  book.position.copy(worldPos);
  book.quaternion.copy(worldQuat);
  
  if (window.innerWidth > 800) {
    canvas.classList.add('inspect-shift');
  }
  
  gsap.to(sceneMgr.camera.position, {
    x: 0,
    y: 0.75,
    z: 10,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(sceneMgr.controls.target, {
    x: 0,
    y: 0.75,
    z: 5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(book.position, {
    x: 0,
    y: 0,
    z: 5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(book.rotation, {
    x: 0,
    y: -Math.PI / 2 + 0.15,
    z: 0,
    duration: 1,
    ease: "power3.inOut",
    onComplete: () => {
      sceneMgr.controls.enabled = true;
    }
  });
}

// --- Mobile tap-to-turn pages inside readers ---
document.getElementById('epub-tap-left')?.addEventListener('click', () => epubReader.animateTurn('prev'));
document.getElementById('epub-tap-right')?.addEventListener('click', () => epubReader.animateTurn('next'));
document.getElementById('pdf-tap-left')?.addEventListener('click', () => pdfReader.prevPage());
document.getElementById('pdf-tap-right')?.addEventListener('click', () => pdfReader.nextPage());

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  
  if (!isInspectMode) {
    const { closestIndex, minDistance } = shelfMgr.update(interactMgr.hoveredBook);
    
    // Dynamic Lighting - lights shift based on scroll
    sceneMgr.dirLight.position.x = 3 + (shelfMgr.currentScroll * 0.1);
    
    // Update Scrubber
    uiMgr.updateScrubber(shelfMgr.currentScroll, shelfMgr.maxScroll);
    
    if (!interactMgr.hoveredBook && closestIndex !== focusedIndex && minDistance < 1.0) {
      focusedIndex = closestIndex;
      uiMgr.updateFocusUI(focusedIndex);
    }
  }
  
  sceneMgr.render();
}

animate();
