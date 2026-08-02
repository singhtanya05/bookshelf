import * as THREE from 'three';
import { SceneManager } from '../core/SceneManager';
import { ShelfManager } from '../components/ShelfManager';

export class InteractionManager {
  private sceneMgr: SceneManager;
  private shelfMgr: ShelfManager;

  public isDragging = false;
  public hoveredBook: THREE.Group | null = null;
  
  private lastX = 0;
  private startX = 0;
  private mouse = new THREE.Vector2(-10, -10);
  private raycaster = new THREE.Raycaster();

  private isInspectModeGetter: () => boolean;
  private inspectBookHandler: (book: THREE.Group) => void;
  private updateFocusUIHandler: (index: number) => void;
  private tooltipHandler: (title: string, author: string, x: number, y: number, show: boolean) => void;

  constructor(
    sceneMgr: SceneManager,
    shelfMgr: ShelfManager,
    isInspectModeGetter: () => boolean,
    inspectBookHandler: (book: THREE.Group) => void,
    updateFocusUIHandler: (index: number) => void,
    tooltipHandler: (title: string, author: string, x: number, y: number, show: boolean) => void
  ) {
    this.sceneMgr = sceneMgr;
    this.shelfMgr = shelfMgr;
    this.isInspectModeGetter = isInspectModeGetter;
    this.inspectBookHandler = inspectBookHandler;
    this.updateFocusUIHandler = updateFocusUIHandler;
    this.tooltipHandler = tooltipHandler;

    this.initEvents();
  }

  private initEvents(): void {
    window.addEventListener('wheel', (e) => {
      if (this.isInspectModeGetter()) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.shelfMgr.scrollTarget += delta * 0.003;
      this.shelfMgr.scrollTarget = THREE.MathUtils.clamp(this.shelfMgr.scrollTarget, 0, this.shelfMgr.maxScroll);
    });

    window.addEventListener('pointerdown', (e) => {
      if (this.isInspectModeGetter()) return;
      if (e.target !== this.sceneMgr.renderer.domElement) return;
      this.isDragging = true;
      this.startX = e.clientX;
      this.lastX = e.clientX;
    });

    window.addEventListener('pointermove', (e) => {
      const isInspect = this.isInspectModeGetter();
      if (this.isDragging && !isInspect) {
        const delta = e.clientX - this.lastX;
        this.shelfMgr.scrollTarget -= delta * 0.01;
        this.shelfMgr.scrollTarget = THREE.MathUtils.clamp(this.shelfMgr.scrollTarget, 0, this.shelfMgr.maxScroll);
        this.lastX = e.clientX;
      }
      
      if (!isInspect && !this.isDragging) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.sceneMgr.camera);
        const intersects = this.raycaster.intersectObjects(this.shelfMgr.shelfGroup.children, true);
        
        this.hoveredBook = null;
        if (intersects.length > 0) {
          let object: THREE.Object3D | null = intersects[0].object;
          while (object && !this.shelfMgr.books.includes(object as THREE.Group)) {
            object = object.parent;
          }
          if (object) {
            this.hoveredBook = object as THREE.Group;
            document.body.style.cursor = 'pointer';
            
            const meta = this.shelfMgr.bookMetaMap.get(this.hoveredBook)!;
            this.updateFocusUIHandler(meta.index);
            
            // Show Tooltip
            const bookData = (window as any).bookData[meta.index];
            this.tooltipHandler(bookData.title, bookData.author, e.clientX, e.clientY, true);
          } else {
            this.resetHover();
          }
        } else {
          this.resetHover();
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      const isInspect = this.isInspectModeGetter();
      if (!isInspect && Math.abs(e.clientX - this.startX) < 5) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.sceneMgr.camera);
        const intersects = this.raycaster.intersectObjects(this.shelfMgr.shelfGroup.children, true);
        
        let clickedBook: THREE.Group | null = null;
        if (intersects.length > 0) {
          let object: THREE.Object3D | null = intersects[0].object;
          while (object && !this.shelfMgr.books.includes(object as THREE.Group)) {
            object = object.parent;
          }
          if (object) {
            clickedBook = object as THREE.Group;
          }
        }

        if (clickedBook) {
          this.tooltipHandler('', '', 0, 0, false);
          this.inspectBookHandler(clickedBook);
        }
      }
    });

    const resetDrag = () => {
      this.isDragging = false;
      this.hoveredBook = null;
      this.tooltipHandler('', '', 0, 0, false);
    };

    window.addEventListener('pointercancel', resetDrag);
    window.addEventListener('pointerleave', resetDrag);

    window.addEventListener('keydown', (e) => {
      if (this.isInspectModeGetter()) return;
      if (e.key === 'ArrowRight') {
        this.shelfMgr.scrollTarget += 0.5;
      } else if (e.key === 'ArrowLeft') {
        this.shelfMgr.scrollTarget -= 0.5;
      }
      this.shelfMgr.scrollTarget = THREE.MathUtils.clamp(this.shelfMgr.scrollTarget, 0, this.shelfMgr.maxScroll);
    });
  }

  private resetHover(): void {
    document.body.style.cursor = 'default';
    this.tooltipHandler('', '', 0, 0, false);
  }
}
