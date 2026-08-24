import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { SceneManager } from './core/SceneManager';
import { ShelfManager } from './components/ShelfManager';
import { EPUBReader } from './readers/EPUBReader';
import { PDFReader } from './readers/PDFReader';
import { InteractionManager } from './interaction/InteractionManager';
import { UIManager } from './ui/UIManager';
import { AnnotationUI } from './ui/AnnotationUI';
import { NotesLibraryUI } from './ui/NotesLibraryUI';
import { UploadPanel } from './ui/UploadPanel';
import { AuthManager } from './auth/AuthManager';
import { Catalogue } from './data/Catalogue';
import { BookVault } from './data/BookVault';
import { ProgressStore } from './data/ProgressStore';
import { AnnotationStore } from './data/AnnotationStore';
import { isConfigured, isPlaceholderConfig } from './data/config';

async function bootstrap(): Promise<void> {
  const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
  const sceneMgr = new SceneManager(canvas);

  // --- Session first: what you may see depends on who you are -------------
  const auth = new AuthManager();
  await auth.init();

  const catalogue = new Catalogue();
  const vault = new BookVault();
  const progress = new ProgressStore(() => auth.userId);
  const annotations = new AnnotationStore(() => auth.userId);

  await catalogue.load(auth.isMember);

  // Three distinct states, each with its own message. Silently showing an
  // empty shelf is the one outcome that helps nobody.
  const notice = document.getElementById('setup-notice');
  if (notice) {
    const setNotice = (text: string) => {
      notice.textContent = text;
      notice.title = text; // full message on hover, since the bar clips to one line
      notice.classList.remove('hidden');
    };

    if (isPlaceholderConfig) {
      setNotice('.env.local still has template values — fill in your Supabase URL and anon key, then restart the dev server.');
    } else if (!isConfigured) {
      setNotice('Backend not configured (see docs/SETUP.md) — only the demo book will open.');
    } else if (catalogue.lastError) {
      setNotice(`Cannot reach the library: ${catalogue.lastError}`);
    }
  }

  const shelfMgr = new ShelfManager(
    sceneMgr.scene,
    catalogue.all,
    sceneMgr.renderer.capabilities.getMaxAnisotropy(),
  );

  let isInspectMode = false;
  let activeBook: THREE.Group | null = null;
  let focusedIndex = -1;

  /**
   * True during the normal 3D inspect flow, AND while a reader is open via
   * UIManager.openBookById() — the notes panel's "jump straight into this
   * book" path, which deliberately skips the 3D animation and so never
   * touches isInspectMode itself. Without this, the shelf's per-frame
   * update kept running the whole time you were reading a book opened that
   * way: still scrolling, still hover-scaling books, and arrow-key page
   * turns doubled as shelf-scroll input on the hidden shelf underneath —
   * live state drifting behind an opaque overlay, ready to surprise you
   * the moment you closed the reader.
   */
  function isReaderOpen(): boolean {
    return !epubOverlayEl.classList.contains('hidden') || !pdfOverlayEl.classList.contains('hidden');
  }

  // --- Readers -------------------------------------------------------------
  const epubOverlayEl = document.getElementById('epub-overlay') as HTMLElement;
  const pdfOverlayEl = document.getElementById('pdf-reader-overlay') as HTMLElement;

  const epubReader = new EPUBReader(
    epubOverlayEl,
    document.getElementById('epub-viewer') as HTMLElement,
    document.getElementById('epub-progress') as HTMLElement,
    progress,
    annotations,
    auth,
  );

  const pdfReader = new PDFReader(
    pdfOverlayEl,
    document.querySelector('.pdf-page-wrapper') as HTMLElement,
    document.getElementById('pdf-render-canvas') as HTMLCanvasElement,
    document.getElementById('pdf-text-layer') as HTMLElement,
    document.getElementById('pdf-page-current') as HTMLElement,
    document.getElementById('pdf-page-total') as HTMLElement,
    document.getElementById('pdf-progress-percent') as HTMLElement,
    document.getElementById('pdf-prev-btn') as HTMLButtonElement,
    document.getElementById('pdf-next-btn') as HTMLButtonElement,
    progress,
    annotations,
    auth,
  );

  // --- UI ------------------------------------------------------------------
  const uiMgr = new UIManager(
    shelfMgr,
    epubReader,
    pdfReader,
    auth,
    vault,
    progress,
    () => activeBook || (focusedIndex >= 0 ? shelfMgr.books[focusedIndex] : null),
    inspectBook,
  );
  uiMgr.refreshCounts();

  new AnnotationUI(annotations, auth, epubReader, pdfReader);
  new NotesLibraryUI(annotations, auth, (bookId, cfiRange) => uiMgr.openBookById(bookId, cfiRange));
  const uploadPanel = new UploadPanel(auth, refreshCatalogue);

  async function refreshCatalogue(): Promise<void> {
    await catalogue.load(auth.isMember);
    shelfMgr.rebuild(catalogue.all);
    uiMgr.refreshCounts();
  }

  // Signing in reveals the rest of the library, so the shelf is rebuilt.
  auth.onChange(async () => {
    uiMgr.refreshAuthUI();
    await refreshCatalogue();
  });

  document.getElementById('auth-signin-trigger')?.addEventListener('click', () => {
    document.getElementById('auth-modal')?.classList.remove('hidden');
  });

  const interactMgr = new InteractionManager(
    sceneMgr,
    shelfMgr,
    () => isInspectMode || isReaderOpen(),
    inspectBook,
    (idx) => {
      if (focusedIndex !== idx) {
        focusedIndex = idx;
        uiMgr.updateFocusUI(focusedIndex);
      }
    },
    (title, author, x, y, show) => uiMgr.tooltip(title, author, x, y, show),
  );

  // --- Reader chrome -------------------------------------------------------
  // The "Aa" button reveals font size / font family — it had never been
  // wired to anything in this project's history, so the panel could never
  // actually open even though the controls inside it worked fine once shown.
  const textSettingsBtn = document.getElementById('epub-text-settings-btn');
  const textSettingsMenu = document.getElementById('text-settings-menu');
  textSettingsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    textSettingsMenu?.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (
      textSettingsMenu &&
      !textSettingsMenu.classList.contains('hidden') &&
      !textSettingsMenu.contains(e.target as Node) &&
      e.target !== textSettingsBtn
    ) {
      textSettingsMenu.classList.add('hidden');
    }
  });

  document.getElementById('epub-layout-btn')?.addEventListener('click', () => epubReader.toggleSpread());
  document.getElementById('font-size-inc')?.addEventListener('click', () => epubReader.changeFontSize(10));
  document.getElementById('font-size-dec')?.addEventListener('click', () => epubReader.changeFontSize(-10));
  document.getElementById('font-family-select')?.addEventListener('change', (e) =>
    epubReader.changeFontFamily((e.target as HTMLSelectElement).value),
  );
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const theme = (e.currentTarget as HTMLElement).getAttribute('data-theme');
      if (theme) epubReader.applyTheme(theme);
    });
  });

  document.getElementById('epub-next-btn')?.addEventListener('click', () => epubReader.animateTurn('next'));
  document.getElementById('epub-prev-btn')?.addEventListener('click', () => epubReader.animateTurn('prev'));
  document.getElementById('close-epub-btn')?.addEventListener('click', () => epubReader.close());

  document.getElementById('pdf-prev-btn')?.addEventListener('click', () => pdfReader.prevPage());
  document.getElementById('pdf-next-btn')?.addEventListener('click', () => pdfReader.nextPage());
  document.getElementById('close-pdf-btn')?.addEventListener('click', () => pdfReader.close());

  document.getElementById('epub-tap-left')?.addEventListener('click', () => epubReader.animateTurn('prev'));
  document.getElementById('epub-tap-right')?.addEventListener('click', () => epubReader.animateTurn('next'));
  document.getElementById('pdf-tap-left')?.addEventListener('click', () => pdfReader.prevPage());
  document.getElementById('pdf-tap-right')?.addEventListener('click', () => pdfReader.nextPage());

  void uploadPanel;

  // --- Return to shelf -----------------------------------------------------
  const returnBtn = document.querySelector('#return-button') as HTMLButtonElement;
  returnBtn.addEventListener('click', () => {
    if (!activeBook) return;

    shelfMgr.shelfGroup.visible = true;
    canvas.classList.remove('inspect-shift');
    uiMgr.hideInspectUI();
    sceneMgr.controls.enabled = false;

    gsap.to(sceneMgr.camera.position, { x: 0, y: 0.5, z: 5.5, duration: 1, ease: 'power3.inOut' });
    gsap.to(sceneMgr.controls.target, { x: 0, y: 0.5, z: 0, duration: 1, ease: 'power3.inOut' });

    const meta = shelfMgr.bookMetaMap.get(activeBook)!;

    const currentWorldPos = new THREE.Vector3();
    const currentWorldQuat = new THREE.Quaternion();
    activeBook.getWorldPosition(currentWorldPos);
    activeBook.getWorldQuaternion(currentWorldQuat);

    const targetWorldPos = new THREE.Vector3();
    const targetWorldQuat = new THREE.Quaternion();

    meta.originalParent.add(activeBook);
    activeBook.position.copy(meta.originalPosition);
    activeBook.rotation.copy(meta.originalRotation);
    activeBook.updateMatrixWorld(true);
    activeBook.getWorldPosition(targetWorldPos);
    activeBook.getWorldQuaternion(targetWorldQuat);

    sceneMgr.scene.add(activeBook);
    activeBook.position.copy(currentWorldPos);
    activeBook.quaternion.copy(currentWorldQuat);

    gsap.to(activeBook.position, {
      x: targetWorldPos.x,
      y: targetWorldPos.y,
      z: targetWorldPos.z,
      duration: 1,
      ease: 'power3.inOut',
    });

    const qObj = { t: 0 };
    const startQuat = activeBook.quaternion.clone();
    gsap.to(qObj, {
      t: 1,
      duration: 1,
      ease: 'power3.inOut',
      onUpdate: () => activeBook!.quaternion.slerpQuaternions(startQuat, targetWorldQuat, qObj.t),
      onComplete: () => {
        meta.originalParent.add(activeBook!);
        activeBook!.position.copy(meta.originalPosition);
        activeBook!.rotation.copy(meta.originalRotation);
        activeBook = null;
        isInspectMode = false;
        uiMgr.hideInspectUI();
      },
    });

    gsap.to(shelfMgr.shelfGroup.position, { y: 0, duration: 1, ease: 'power2.inOut' });
  });

  function inspectBook(book: THREE.Group): void {
    isInspectMode = true;
    activeBook = book;

    const meta = shelfMgr.bookMetaMap.get(book)!;
    void uiMgr.showInspectUI(shelfMgr.entries[meta.index]);

    shelfMgr.shelfGroup.visible = false;

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    book.getWorldPosition(worldPos);
    book.getWorldQuaternion(worldQuat);

    sceneMgr.scene.add(book);
    book.position.copy(worldPos);
    book.quaternion.copy(worldQuat);

    if (window.innerWidth > 800) canvas.classList.add('inspect-shift');

    gsap.to(sceneMgr.camera.position, { x: 0, y: 0.75, z: 10, duration: 1, ease: 'power3.inOut' });
    gsap.to(sceneMgr.controls.target, { x: 0, y: 0.75, z: 5, duration: 1, ease: 'power3.inOut' });
    gsap.to(book.position, { x: 0, y: 0, z: 5, duration: 1, ease: 'power3.inOut' });
    gsap.to(book.rotation, {
      x: 0,
      y: -Math.PI / 2 + 0.15,
      z: 0,
      duration: 1,
      ease: 'power3.inOut',
      onComplete: () => { sceneMgr.controls.enabled = true; },
    });
  }

  // --- Loop ----------------------------------------------------------------
  function animate(): void {
    requestAnimationFrame(animate);

    if (!isInspectMode && !isReaderOpen()) {
      const { closestIndex, minDistance } = shelfMgr.update(interactMgr.hoveredBook);
      sceneMgr.dirLight.position.x = 3 + shelfMgr.currentScroll * 0.1;
      uiMgr.updateScrubber(shelfMgr.currentScroll, shelfMgr.maxScroll);

      if (!interactMgr.hoveredBook && closestIndex !== focusedIndex && minDistance < 1.0) {
        focusedIndex = closestIndex;
        uiMgr.updateFocusUI(focusedIndex);
      }
    }

    sceneMgr.render();
  }

  animate();
}

void bootstrap();
