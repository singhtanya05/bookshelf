import * as THREE from 'three';
import gsap from 'gsap';
import { BookComponent, type BookMeta } from './BookComponent';

import type { CatalogueEntry } from '../data/Catalogue';

/** The shelf renders straight from the catalogue; there is no second shape. */
export type BookData = CatalogueEntry;

export class ShelfManager {
  public shelfGroup: THREE.Group;
  public books: THREE.Group[] = [];
  public bookMetaMap = new Map<THREE.Group, BookMeta>();
  
  public scrollTarget = 0;
  public currentScroll = 0;
  public maxScroll = 0;
  public shelfOffset = 0;

  private bookData: BookData[];
  private bookMargin = 0.02;
  private totalWidths: number[] = [];
  private maxAnisotropy: number;

  constructor(scene: THREE.Scene, bookData: BookData[], maxAnisotropy: number) {
    this.bookData = bookData;
    this.maxAnisotropy = maxAnisotropy;
    this.shelfGroup = new THREE.Group();
    scene.add(this.shelfGroup);

    this.initShelfGeometry();
    this.initBooks(maxAnisotropy);

    this.shelfOffset = window.innerWidth < 800 ? 0 : -2;
    this.scrollTarget = this.maxScroll / 2;
    this.currentScroll = this.scrollTarget;
  }

  private initShelfGeometry(): void {
    const shelfMat = new THREE.MeshStandardMaterial({ 
      color: '#4A3525', 
      roughness: 0.9,
      metalness: 0.05
    });
    const shelfGeo = new THREE.BoxGeometry(60, 0.3, 2.5);
    const shelfMesh = new THREE.Mesh(shelfGeo, shelfMat);
    shelfMesh.position.y = -0.15;
    shelfMesh.position.z = 0.5;
    shelfMesh.receiveShadow = true;
    this.shelfGroup.add(shelfMesh);
  }

  private createPagesTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = '#EBE5D9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#dcd5c7';
    for (let i = 0; i < canvas.height; i += 4) {
      if (Math.random() > 0.3) {
        ctx.fillRect(0, i, canvas.width, 1.5);
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 10);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private initBooks(maxAnisotropy: number): void {
    const pagesTex = this.createPagesTexture();
    const sharedPagesMat = new THREE.MeshStandardMaterial({ map: pagesTex, roughness: 1.0 });

    let currentX = 0;
    const bookCount = this.bookData.length;

    for (let i = 0; i < bookCount; i++) {
      const data = this.bookData[i];
      const bWidth = 0.15 + Math.random() * 0.05;
      const bHeight = 1.3 + Math.random() * 0.3;
      const bDepth = 0.9 + Math.random() * 0.1;

      const posX = currentX + bWidth / 2;
      const posZ = (Math.random() - 0.5) * 0.08;
      const rotZ = (Math.random() - 0.5) * 0.06;

      const book = new BookComponent(
        i,
        data.title,
        data.author,
        data.spine_color,
        bWidth,
        bHeight,
        bDepth,
        posX,
        posZ,
        rotZ,
        this.shelfGroup,
        maxAnisotropy,
        sharedPagesMat
      );

      this.shelfGroup.add(book.group);
      this.books.push(book.group);
      this.bookMetaMap.set(book.group, book.meta);

      this.totalWidths.push(bWidth);
      currentX += bWidth + this.bookMargin;
    }

    this.maxScroll =
      bookCount > 0 ? currentX - this.totalWidths[bookCount - 1] / 2 : 0;
  }

  /** Swap the whole shelf — used when signing in reveals the full library. */
  public rebuild(bookData: BookData[]): void {
    for (const group of this.books) {
      this.shelfGroup.remove(group);
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    }

    this.books = [];
    this.bookMetaMap.clear();
    this.totalWidths = [];
    this.bookData = bookData;

    this.initBooks(this.maxAnisotropy);
    this.scrollTarget = this.maxScroll / 2;
    this.currentScroll = this.scrollTarget;
  }

  public get entries(): BookData[] {
    return this.bookData;
  }

  public filterBooks(category: string): void {
    let cx = 0;
    let lastW = 0;
    const bookCount = this.books.length;

    for (let i = 0; i < bookCount; i++) {
      const book = this.books[i];
      const meta = this.bookMetaMap.get(book)!;
      const data = this.bookData[meta.index];
      const match = category === 'All' || (data.category || 'Uncategorized') === category;

      if (match) {
        const bWidth = this.totalWidths[i];
        const targetX = cx + bWidth / 2;

        gsap.to(book.position, {
          x: targetX,
          y: 0,
          z: meta.originalPosition.z,
          duration: 0.8,
          ease: "power2.out"
        });

        meta.centerPosX = targetX;
        cx += bWidth + this.bookMargin;
        lastW = bWidth;
      } else {
        gsap.to(book.position, {
          y: -2,
          z: -0.5,
          duration: 0.8,
          ease: "power2.inOut"
        });
      }
    }

    if (cx > 0) {
      this.maxScroll = cx - this.bookMargin - lastW / 2;
    } else {
      this.maxScroll = 0;
    }

    this.scrollTarget = THREE.MathUtils.clamp(this.scrollTarget, 0, this.maxScroll);
  }

  public update(hoveredBook: THREE.Group | null): { closestIndex: number; minDistance: number } {
    this.currentScroll = THREE.MathUtils.lerp(this.currentScroll, this.scrollTarget, 0.08);
    this.shelfGroup.position.x = -this.currentScroll - this.shelfOffset;

    let minDistance = Infinity;
    let closestIndex = 0;

    for (const [group, meta] of this.bookMetaMap.entries()) {
      const dist = Math.abs(meta.centerPosX - this.currentScroll);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = meta.index;
      }

      let targetZ = 0;
      let targetScale = 1.0;

      if (group === hoveredBook) {
        targetZ = 0.4;
        targetScale = 1.15;
      } else if (dist < 0.5) {
        targetZ = 0.1;
        targetScale = 1.02;
      }

      group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, 0.15);
      group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, targetScale, 0.15));
    }

    return { closestIndex, minDistance };
  }
}
