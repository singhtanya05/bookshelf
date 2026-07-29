import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as pdfjsLib from 'pdfjs-dist';
import ePub from 'epubjs';

// Configure pdfjs worker to use CDN to avoid Vite build issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// --- UI Elements ---
const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
const header = document.querySelector('.header') as HTMLElement;
const statusInd = document.querySelector('.status-indicator') as HTMLElement;
const footer = document.querySelector('.footer') as HTMLElement;
const navLeft = document.querySelector('#nav-left') as HTMLButtonElement;
const navRight = document.querySelector('#nav-right') as HTMLButtonElement;
const inspectBtn = document.querySelector('#inspect-button') as HTMLButtonElement;

const focusOverlay = document.querySelector('#focus-overlay') as HTMLElement;
const focusIndex = document.querySelector('#focus-index') as HTMLElement;
const focusTitle = document.querySelector('#focus-title') as HTMLElement;
const focusAuthor = document.querySelector('#focus-author') as HTMLElement;

const returnBtn = document.querySelector('#return-button') as HTMLButtonElement;
const focusDetails = document.querySelector('#focus-details') as HTMLElement;
const viewBookBtn = document.querySelector('.view-book-link') as HTMLButtonElement;

const hoverTooltip = document.querySelector('#hover-tooltip') as HTMLElement;

// PDF UI
const pdfOverlay = document.getElementById('pdf-reader-overlay') as HTMLElement;
const pdfPageWrapper = document.querySelector('.pdf-page-wrapper') as HTMLElement;
const pdfCanvas = document.getElementById('pdf-render-canvas') as HTMLCanvasElement;
const pdfCtx = pdfCanvas.getContext('2d')!;
const pdfTextLayer = document.getElementById('pdf-text-layer') as HTMLElement;
const pdfPageCurrent = document.getElementById('pdf-page-current') as HTMLElement;
const pdfPageTotal = document.getElementById('pdf-page-total') as HTMLElement;
const pdfProgressPercent = document.getElementById('pdf-progress-percent') as HTMLElement;
const pdfPrevBtn = document.getElementById('pdf-prev-btn') as HTMLButtonElement;
const pdfNextBtn = document.getElementById('pdf-next-btn') as HTMLButtonElement;
const closePdfBtn = document.getElementById('close-pdf-btn') as HTMLButtonElement;

const scrubberThumb = document.querySelector('#scrubber-thumb') as HTMLElement;
const scrubberTicks = document.querySelector('.scrubber-ticks') as HTMLElement;

// Search UI
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchResults = document.getElementById('search-results') as HTMLElement;

// EPUB Elements
const epubOverlay = document.getElementById('epub-overlay') as HTMLElement;
const epubViewer = document.getElementById('epub-viewer') as HTMLElement;
const closeEpubBtn = document.getElementById('close-epub-btn') as HTMLElement;
const epubPrevBtn = document.getElementById('epub-prev-btn') as HTMLElement;
const epubNextBtn = document.getElementById('epub-next-btn') as HTMLElement;
const epubProgress = document.getElementById('epub-progress') as HTMLElement;
const epubLayoutBtn = document.getElementById('epub-layout-btn') as HTMLElement;
const textSettingsBtn = document.getElementById('epub-text-settings-btn') as HTMLElement;
const textSettingsMenu = document.getElementById('text-settings-menu') as HTMLElement;
const fontSizeDecBtn = document.getElementById('font-size-dec') as HTMLButtonElement;
const fontSizeIncBtn = document.getElementById('font-size-inc') as HTMLButtonElement;
const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement;
const themeBtns = document.querySelectorAll('.theme-btn');

// --- Data ---
import bookDataJson from './bookData.json';

interface BookData {
  title: string;
  author: string;
  color: string;
  category?: string;
  pdfUrl?: string;
  epubUrl?: string;
}

const bookData: BookData[] = bookDataJson as BookData[];
const bookCount = bookData.length;

// Update Dynamic UI Counts
const headerVolumeCount = document.getElementById('header-volume-count');
if (headerVolumeCount) headerVolumeCount.innerText = `${bookCount} VOLUMES`;

const statusVolumeCount = document.getElementById('status-volume-count');
if (statusVolumeCount) statusVolumeCount.innerText = `${bookCount} VOLUMES READY`;
// Setup scrubber ticks
if (scrubberTicks) {
  scrubberTicks.innerHTML = '';
  for (let i = 0; i < bookCount; i++) {
    const tick = document.createElement('div');
    tick.className = 'scrubber-tick';
    tick.style.left = `${(i / (bookCount - 1)) * 100}%`;
    scrubberTicks.appendChild(tick);
  }
}

// --- Setup ---
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#F5F3ED', 10, 25);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 5.5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;
controls.target.set(0, 0.5, 0);
controls.update();

// --- Lighting ---
const ambientLight = new THREE.AmbientLight('#ffffff', 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 5, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

const backLight = new THREE.DirectionalLight(0xffffff, 1.5);
backLight.position.set(-5, 5, -5);
scene.add(backLight);

// Ancient Lamp Warm Light
const lampLight = new THREE.PointLight(0xffaa55, 3, 20); // Warm orange/yellow
lampLight.position.set(-2, 3, 4);
scene.add(lampLight);

const fillLight = new THREE.DirectionalLight('#F5F3ED', 0.6);
fillLight.position.set(-5, 2, 5);
scene.add(fillLight);

// --- Shelf Setup ---
const shelfGroup = new THREE.Group();
scene.add(shelfGroup);

// Walnut material
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
shelfGroup.add(shelfMesh);

// --- Books Setup ---
const books: THREE.Group[] = [];
let currentX = 0;
const bookMargin = 0.02;

interface BookMeta {
  originalParent: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  index: number;
  centerPosX: number;
}
const bookMetaMap = new Map<THREE.Group, BookMeta>();

function createSpineTexture(title: string, author: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const val = (Math.random() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, data[i] + val));
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + val));
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + val));
  }
  ctx.putImageData(imgData, 0, 0);
  
  // Faux curvature (horizontal shading)
  const spineShading = ctx.createLinearGradient(0, 0, canvas.width, 0);
  spineShading.addColorStop(0, 'rgba(0,0,0,0.4)');
  spineShading.addColorStop(0.15, 'rgba(0,0,0,0.0)');
  spineShading.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  spineShading.addColorStop(0.85, 'rgba(0,0,0,0.0)');
  spineShading.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = spineShading;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Vignette (top and bottom edges)
  const vignette = ctx.createLinearGradient(0, 0, 0, canvas.height);
  vignette.addColorStop(0, 'rgba(0,0,0,0.6)');
  vignette.addColorStop(0.1, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.9, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Foil accents (Metallic Gradient)
  const foilGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  foilGrad.addColorStop(0, '#8B6508');
  foilGrad.addColorStop(0.3, '#FFD700');
  foilGrad.addColorStop(0.5, '#FFF8DC');
  foilGrad.addColorStop(0.7, '#FFD700');
  foilGrad.addColorStop(1, '#8B6508');
  
  ctx.fillStyle = foilGrad;
  ctx.fillRect(30, 100, canvas.width - 60, 6);
  ctx.fillRect(30, 120, canvas.width - 60, 2);
  ctx.fillRect(30, canvas.height - 120, canvas.width - 60, 2);
  ctx.fillRect(30, canvas.height - 100, canvas.width - 60, 6);
  
  ctx.fillStyle = '#ffffff';
  if (color === '#D1C9BE') ctx.fillStyle = '#2A2A28';
  
  ctx.translate(canvas.width / 2, canvas.height - 200);
  ctx.rotate(-Math.PI / 2);
  
  ctx.font = 'italic 50px "Playfair Display", serif';
  const authorWidth = ctx.measureText(author).width;
  
  ctx.font = 'bold 80px "Playfair Display", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  let displayTitle = title;
  const maxW = canvas.height - 400 - authorWidth - 40; // 40px gap
  if (ctx.measureText(displayTitle).width > maxW) {
    while (displayTitle.length > 3 && ctx.measureText(displayTitle + '...').width > maxW) {
      displayTitle = displayTitle.slice(0, -2);
    }
    displayTitle = displayTitle.trim() + '...';
  }
  
  ctx.fillText(displayTitle, 0, 0);
  
  ctx.font = 'italic 50px "Playfair Display", serif';
  ctx.textAlign = 'right';
  ctx.fillText(author, canvas.height - 400, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCoverTexture(title: string, author: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const val = (Math.random() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, data[i] + val));
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + val));
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + val));
  }
  ctx.putImageData(imgData, 0, 0);
  
  // Radial Vignette
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.max(cx, cy) * 1.2;
  const radialVignette = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
  radialVignette.addColorStop(0, 'rgba(0,0,0,0)');
  radialVignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = radialVignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Foil accent line (Metallic Gradient)
  const coverFoil = ctx.createLinearGradient(0, 0, 0, canvas.height);
  coverFoil.addColorStop(0, '#8B6508');
  coverFoil.addColorStop(0.3, '#FFD700');
  coverFoil.addColorStop(0.5, '#FFF8DC');
  coverFoil.addColorStop(0.7, '#FFD700');
  coverFoil.addColorStop(1, '#8B6508');
  
  ctx.fillStyle = coverFoil;
  ctx.fillRect(80, 50, 4, canvas.height - 100);
  
  const isDark = color === '#2A2A28' || color === '#3B4A3F' || color === '#2B3B4C' || color === '#54407B';
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  if (title.includes("Boom")) ctx.strokeStyle = '#D56E52';

  ctx.lineWidth = 15;
  const centerX = canvas.width / 2;
  const centerY = canvas.height * 0.65;
  for (let r = 50; r < 800; r += 60) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  ctx.fillStyle = isDark ? '#ffffff' : '#2A2A28';
  if (color === '#D1C9BE') ctx.fillStyle = '#2A2A28';
  
  ctx.font = '600 30px "Inter", sans-serif';
  ctx.fillText("THE COMPLETE SHELF", 120, 80);
  
  ctx.font = 'bold 110px "Playfair Display", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  const words = title.split(' ');
  let line = '';
  let y = 180;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > canvas.width - 240 && n > 0) {
      ctx.fillText(line, 120, y);
      line = words[n] + ' ';
      y += 120;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 120, y);
  
  ctx.font = 'italic 50px "Playfair Display", serif';
  ctx.fillText(author, 120, y + 160);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPagesTexture() {
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

const sharedPagesTex = createPagesTexture();
const sharedPagesMat = new THREE.MeshStandardMaterial({ map: sharedPagesTex, roughness: 1.0 });

const totalWidths: number[] = [];
for (let i = 0; i < bookCount; i++) {
  const data = bookData[i];
  const bGroup = new THREE.Group();
  
  const bWidth = 0.15 + Math.random() * 0.05;
  const bHeight = 1.3 + Math.random() * 0.3;
  const bDepth = 0.9 + Math.random() * 0.1;
  
  const spineTex = createSpineTexture(data.title, data.author, data.color);
  const coverTex = createCoverTexture(data.title, data.author, data.color);
  
  const bMat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.5, metalness: 0.1 });
  const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.5, metalness: 0.1 });
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.5, metalness: 0.1 });
  
  const coverThickness = 0.015;
  const overhang = 0.015;
  
  const rcGeo = new THREE.BoxGeometry(coverThickness, bHeight + overhang*2, bDepth + overhang);
  const rcMesh = new THREE.Mesh(rcGeo, [coverMat, bMat, bMat, bMat, bMat, bMat]); // +X gets coverMat
  rcMesh.position.set(bWidth/2 - coverThickness/2, bHeight/2, overhang/2);
  rcMesh.castShadow = true; rcMesh.receiveShadow = true;
  
  const lcGeo = new THREE.BoxGeometry(coverThickness, bHeight + overhang*2, bDepth + overhang);
  const lcMesh = new THREE.Mesh(lcGeo, [bMat, coverMat, bMat, bMat, bMat, bMat]); // -X gets coverMat
  lcMesh.position.set(-bWidth/2 + coverThickness/2, bHeight/2, overhang/2);
  lcMesh.castShadow = true; lcMesh.receiveShadow = true;
  
  const spineGeo = new THREE.BoxGeometry(bWidth, bHeight + overhang*2, coverThickness);
  const spineMeshObj = new THREE.Mesh(spineGeo, [bMat, bMat, bMat, bMat, spineMat, bMat]);
  spineMeshObj.position.set(0, bHeight/2, bDepth/2 + coverThickness/2);
  spineMeshObj.castShadow = true; spineMeshObj.receiveShadow = true;
  
  const pagesGeo = new THREE.BoxGeometry(bWidth - coverThickness*2, bHeight * 0.98, bDepth - overhang);
  const pagesMesh = new THREE.Mesh(pagesGeo, sharedPagesMat);
  pagesMesh.position.set(0, bHeight/2, -overhang/2);
  pagesMesh.receiveShadow = true;
  
  bGroup.add(rcMesh, lcMesh, spineMeshObj, pagesMesh);
  
  const posX = currentX + bWidth / 2;
  const posZ = (Math.random() - 0.5) * 0.08; // Organic depth variation
  const rotZ = (Math.random() - 0.5) * 0.06; // Organic leaning
  
  bGroup.position.set(posX, 0, posZ);
  bGroup.rotation.z = rotZ;
  
  shelfGroup.add(bGroup);
  books.push(bGroup);
  
  bookMetaMap.set(bGroup, {
    originalParent: shelfGroup,
    originalPosition: bGroup.position.clone(),
    originalRotation: bGroup.rotation.clone(),
    index: i,
    centerPosX: posX
  });
  
  totalWidths.push(bWidth);
  currentX += bWidth + bookMargin;
}

// Center the entire shelf visually based on scroll
let maxScroll = currentX - totalWidths[bookCount - 1] / 2;
const shelfOffset = window.innerWidth < 800 ? 0 : -2; // Offset center for left UI

// --- Interaction State ---
let isInspectMode = false;
let activeBook: THREE.Group | null = null;
let scrollTarget = maxScroll / 2; // Start in middle
let currentScroll = scrollTarget;
let focusedIndex = -1;
let hoveredBook: THREE.Group | null = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-10, -10); // Start off-screen

// --- Browsing Interaction ---

// Category Filtering
const categoryFiltersContainer = document.getElementById('category-filters')!;
const uniqueCategories = ['All', ...new Set(bookData.map(b => b.category || 'Uncategorized'))];
let activeCategory = 'All';

function filterBooks(category: string) {
  let cx = 0;
  let lastW = 0;
  
  for (let i = 0; i < bookCount; i++) {
    const book = books[i];
    const data = bookData[bookMetaMap.get(book)!.index];
    const match = category === 'All' || (data.category || 'Uncategorized') === category;
    const meta = bookMetaMap.get(book)!;
    
    if (match) {
      const bWidth = totalWidths[i];
      const targetX = cx + bWidth / 2;
      
      gsap.to(book.position, {
        x: targetX,
        y: 0,
        z: meta.originalPosition.z,
        duration: 0.8,
        ease: "power2.out"
      });
      
      // Keep track of new position for scroll focusing
      meta.centerPosX = targetX;
      
      cx += bWidth + bookMargin;
      lastW = bWidth;
    } else {
      // Sink and hide
      gsap.to(book.position, {
        y: -2,
        z: -0.5,
        duration: 0.8,
        ease: "power2.inOut"
      });
    }
  }
  
  if (cx > 0) {
    maxScroll = cx - bookMargin - lastW / 2;
  } else {
    maxScroll = 0;
  }
  
  // Constrain scroll Target
  scrollTarget = Math.max(0, Math.min(scrollTarget, maxScroll));
}

uniqueCategories.forEach(cat => {
  if (!cat) return;
  const btn = document.createElement('button');
  btn.className = 'category-btn';
  btn.innerText = cat;
  if (cat === 'All') btn.classList.add('active');
  
  btn.addEventListener('click', () => {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = cat;
    filterBooks(activeCategory);
  });
  
  categoryFiltersContainer.appendChild(btn);
});
let isDragging = false;
let lastX = 0;
let startX = 0;

window.addEventListener('wheel', (e) => {
  if (isInspectMode) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  scrollTarget += delta * 0.003;
  scrollTarget = THREE.MathUtils.clamp(scrollTarget, 0, maxScroll);
});

window.addEventListener('pointerdown', (e) => {
  if (isInspectMode) return;
  if (e.target !== canvas) return; // Only drag on canvas
  isDragging = true;
  startX = e.clientX;
  lastX = e.clientX;
});

window.addEventListener('pointermove', (e) => {
  if (isDragging && !isInspectMode) {
    const delta = e.clientX - lastX;
    scrollTarget -= delta * 0.01;
    scrollTarget = THREE.MathUtils.clamp(scrollTarget, 0, maxScroll);
    lastX = e.clientX;
  }
  
  if (!isInspectMode && !isDragging) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(shelfGroup.children, true);
    
    hoveredBook = null;
    if (intersects.length > 0) {
      let object: THREE.Object3D | null = intersects[0].object;
      while (object && !books.includes(object as THREE.Group)) {
        object = object.parent;
      }
      if (object) {
        hoveredBook = object as THREE.Group;
        document.body.style.cursor = 'pointer';
        
        // Show Tooltip
        const data = bookData[bookMetaMap.get(hoveredBook)!.index];
        hoverTooltip.innerText = `${data.title} — ${data.author}`;
        hoverTooltip.classList.add('visible');
        hoverTooltip.style.left = `${e.clientX}px`;
        hoverTooltip.style.top = `${e.clientY}px`;
        
        // Update Focus UI immediately on hover
        const index = bookMetaMap.get(hoveredBook)!.index;
        if (focusedIndex !== index) {
          focusedIndex = index;
          updateFocusUI(focusedIndex);
        }
      } else {
        document.body.style.cursor = 'default';
        hoverTooltip.classList.remove('visible');
      }
    } else {
      document.body.style.cursor = 'default';
      hoverTooltip.classList.remove('visible');
    }
  }
});

window.addEventListener('pointerup', (e) => {
  isDragging = false;
  // Use startX to check if the total swipe/drag distance was less than 5px (a true tap)
  if (!isInspectMode && Math.abs(e.clientX - startX) < 5) {
    // Perform a direct raycast at the pointer release coordinates
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(shelfGroup.children, true);
    
    let clickedBook: THREE.Group | null = null;
    if (intersects.length > 0) {
      let object: THREE.Object3D | null = intersects[0].object;
      while (object && !books.includes(object as THREE.Group)) {
        object = object.parent;
      }
      if (object) {
        clickedBook = object as THREE.Group;
      }
    }

    if (clickedBook) {
      hoverTooltip.classList.remove('visible');
      inspectBook(clickedBook);
    }
  }
});
window.addEventListener('pointercancel', () => { 
  isDragging = false;
  hoveredBook = null;
  hoverTooltip.classList.remove('visible');
});
window.addEventListener('pointerleave', () => { 
  isDragging = false;
  hoveredBook = null;
  hoverTooltip.classList.remove('visible');
});

window.addEventListener('keydown', (e) => {
  if (isInspectMode) return;
  if (e.key === 'ArrowRight') {
    scrollTarget += 0.5;
  } else if (e.key === 'ArrowLeft') {
    scrollTarget -= 0.5;
  }
  scrollTarget = THREE.MathUtils.clamp(scrollTarget, 0, maxScroll);
});

navLeft.addEventListener('click', () => {
  if (isInspectMode) return;
  scrollTarget = THREE.MathUtils.clamp(scrollTarget - 0.5, 0, maxScroll);
});
navRight.addEventListener('click', () => {
  if (isInspectMode) return;
  scrollTarget = THREE.MathUtils.clamp(scrollTarget + 0.5, 0, maxScroll);
});

window.addEventListener('keydown', (e) => {
  // EPUB keyboard navigation
  if (!epubOverlay.classList.contains('hidden')) {
    if (e.key === 'ArrowRight') animateEpubTurn('next');
    if (e.key === 'ArrowLeft') animateEpubTurn('prev');
    if (e.key === 'Escape') {
      epubOverlay.classList.add('hidden');
      if (currentBook) {
        currentBook.destroy();
        currentBook = null;
        currentRendition = null;
      }
    }
  }
  
  // PDF keyboard navigation
  if (!pdfOverlay.classList.contains('hidden')) {
    if (e.key === 'ArrowRight') onNextPage();
    if (e.key === 'ArrowLeft') onPrevPage();
    if (e.key === 'Escape') pdfOverlay.classList.add('hidden');
  }
});

// --- Inspection ---
inspectBtn.addEventListener('click', () => {
  if (focusedIndex >= 0 && focusedIndex < books.length) {
    inspectBook(books[focusedIndex]);
  }
});

function inspectBook(book: THREE.Group) {
  isInspectMode = true;
  activeBook = book;
  
  // Hide UI
  header.style.opacity = '0';
  statusInd.style.opacity = '0';
  footer.style.opacity = '0';
  navLeft.style.opacity = '0';
  navRight.style.opacity = '0';
  categoryFiltersContainer.style.opacity = '0';
  
  const data = bookData[bookMetaMap.get(book)!.index];
  focusTitle.innerText = data.title;
  focusAuthor.innerText = data.author;
  
  focusOverlay.classList.remove('hidden');
  focusDetails.classList.remove('hidden');
  returnBtn.classList.remove('hidden');
  inspectBtn.classList.add('hidden');
  
  shelfGroup.visible = false;
  
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  book.getWorldPosition(worldPos);
  book.getWorldQuaternion(worldQuat);
  
  scene.add(book);
  book.position.copy(worldPos);
  book.quaternion.copy(worldQuat);
  
  // Shift the canvas via CSS to center the view in the right panel
  if (window.innerWidth > 800) {
    canvas.classList.add('inspect-shift');
  }
  
  gsap.to(camera.position, {
    x: 0,
    y: 0.75,
    z: 10,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(controls.target, {
    x: 0,
    y: 0.75, // Target the center of the book (bMesh is offset by bHeight/2)
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
      controls.enabled = true;
    }
  });
}


// --- PDF Reader Logic ---
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending: number | null = null;

function renderPage(num: number) {
  pageRendering = true;
  pdfDoc!.getPage(num).then((page) => {
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const dynamicScale = (window.innerHeight * 0.75) / unscaledViewport.height;
    const viewport = page.getViewport({ scale: dynamicScale });
    
    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;
    
    // Size text layer to match canvas exactly
    pdfTextLayer.style.width = `${viewport.width}px`;
    pdfTextLayer.style.height = `${viewport.height}px`;

    const renderContext: any = {
      canvasContext: pdfCtx,
      viewport: viewport
    };
    
    // Clear previous text layer
    pdfTextLayer.innerHTML = '';
    
    const renderTask = page.render(renderContext);
    renderTask.promise.then(() => {
      // Render Text Layer
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: pdfTextLayer,
        viewport: viewport
      });
      textLayer.render();
      
      pageRendering = false;
      
      // Animation complete
      pdfPageWrapper.classList.remove('fade-out', 'fade-in');
      
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });

  pdfPageCurrent.textContent = num.toString().padStart(2, '0');
  
  // Progress Calculation
  const progress = Math.round((num / pdfDoc!.numPages) * 100);
  pdfProgressPercent.textContent = ` (${progress}%)`;
  
  // Update Buttons
  pdfPrevBtn.disabled = num <= 1;
  pdfNextBtn.disabled = num >= pdfDoc!.numPages;
  
  // Save History
  if (activeBook) {
    const data = bookData[bookMetaMap.get(activeBook)!.index];
    localStorage.setItem(`pdf-history-${data.title}`, num.toString());
  }
}

function queueRenderPage(num: number) {
  pdfPageWrapper.classList.add('fade-out');
  
  setTimeout(() => {
    pdfPageWrapper.classList.remove('fade-out');
    pdfPageWrapper.classList.add('fade-in');
    
    if (pageRendering) {
      pageNumPending = num;
    } else {
      renderPage(num);
    }
  }, 250);
}

function onPrevPage() {
  if (pageNum <= 1) return;
  pageNum--;
  queueRenderPage(pageNum);
}

function onNextPage() {
  if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
  pageNum++;
  queueRenderPage(pageNum);
}

pdfPrevBtn.addEventListener('click', onPrevPage);
pdfNextBtn.addEventListener('click', onNextPage);

closePdfBtn.addEventListener('click', () => {
  pdfOverlay.classList.add('hidden');
});

// --- Search Logic ---
searchInput.addEventListener('input', (e) => {
  const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
  
  if (query.length === 0) {
    searchResults.classList.add('hidden');
    return;
  }
  
  searchResults.innerHTML = '';
  let matchCount = 0;
  
  for (let i = 0; i < bookCount; i++) {
    const data = bookData[i];
    if (data.title.toLowerCase().includes(query) || data.author.toLowerCase().includes(query)) {
      matchCount++;
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div class="search-item-title">${data.title}</div>
        <div class="search-item-author">${data.author}</div>
      `;
      
      item.addEventListener('click', () => {
        searchInput.value = '';
        searchResults.classList.add('hidden');
        
        // 1. Scroll shelf to book
        const book = books[i];
        const meta = bookMetaMap.get(book)!;
        scrollTarget = meta.centerPosX;
        
        // 2. Trigger inspect after scroll animation finishes
        setTimeout(() => {
          if (!isInspectMode) {
            inspectBook(book);
          }
        }, 800);
      });
      
      searchResults.appendChild(item);
    }
  }
  
  if (matchCount > 0) {
    searchResults.classList.remove('hidden');
  } else {
    searchResults.classList.add('hidden');
  }
});

// Close search if clicked outside
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target as Node) && !searchResults.contains(e.target as Node)) {
    searchResults.classList.add('hidden');
  }
});

viewBookBtn.addEventListener('click', () => {
  if (!activeBook) return;
  const data = bookData[bookMetaMap.get(activeBook)!.index];
  
  if (data.epubUrl) {
    epubOverlay.classList.remove('hidden');
    loadEpub(data.epubUrl);
  } else if (data.pdfUrl) {
    pdfOverlay.classList.remove('hidden');
    pdfjsLib.getDocument({ url: data.pdfUrl }).promise.then((doc) => {
      pdfDoc = doc;
      pdfPageTotal.textContent = pdfDoc.numPages.toString().padStart(2, '0');
      
      // Load History
      const savedPage = localStorage.getItem(`pdf-history-${data.title}`);
      pageNum = savedPage ? parseInt(savedPage, 10) : 1;
      
      // Ensure pageNum is valid
      if (pageNum < 1) pageNum = 1;
      if (pageNum > pdfDoc.numPages) pageNum = pdfDoc.numPages;
      
      renderPage(pageNum);
    });
  } else {
    alert("This physical volume is currently not available for digital reading.");
  }
});

// --- EPUB Logic ---
let currentBook: any = null;
let currentRendition: any = null;
let epubSpread: 'none' | 'auto' = (localStorage.getItem('epub-spread') as 'none' | 'auto') || 'auto';
let epubFontSize = parseInt(localStorage.getItem('epub-font-size') || '110');
let epubFontFamily = localStorage.getItem('epub-font-family') || 'Georgia, serif';

fontFamilySelect.value = epubFontFamily;

textSettingsBtn.addEventListener('click', () => {
  textSettingsMenu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!textSettingsBtn.contains(e.target as Node) && !textSettingsMenu.contains(e.target as Node)) {
    textSettingsMenu.classList.add('hidden');
  }
});

fontSizeIncBtn.addEventListener('click', () => {
  epubFontSize = Math.min(250, epubFontSize + 10);
  localStorage.setItem('epub-font-size', epubFontSize.toString());
  if (currentRendition) currentRendition.themes.fontSize(`${epubFontSize}%`);
});

fontSizeDecBtn.addEventListener('click', () => {
  epubFontSize = Math.max(50, epubFontSize - 10);
  localStorage.setItem('epub-font-size', epubFontSize.toString());
  if (currentRendition) currentRendition.themes.fontSize(`${epubFontSize}%`);
});

fontFamilySelect.addEventListener('change', (e) => {
  epubFontFamily = (e.target as HTMLSelectElement).value;
  localStorage.setItem('epub-font-family', epubFontFamily);
  if (currentRendition) currentRendition.themes.font(epubFontFamily);
});

function loadEpub(url: string, startCfi?: string) {
  if (currentBook) {
    currentBook.destroy();
  }
  epubViewer.innerHTML = ''; // clear
  currentBook = ePub(url);
  currentRendition = currentBook.renderTo(epubViewer, {
    width: "100%",
    height: "100%",
    spread: epubSpread,
    manager: "continuous",
    flow: "paginated"
  });

  // Register Themes
  currentRendition.themes.register('light', {
    body: { 'color': '#2A2A28', 'background': '#fff', 'line-height': '1.8' },
    p: { 'margin-bottom': '1.5em' }
  });
  
  currentRendition.themes.register('sepia', {
    body: { 'color': '#5b4636', 'background': '#f4ecd8', 'line-height': '1.8' },
    p: { 'margin-bottom': '1.5em' }
  });
  
  currentRendition.themes.register('dark', {
    body: { 'color': '#e0e0e0', 'background': '#1a1a1a', 'line-height': '1.8' },
    p: { 'margin-bottom': '1.5em' }
  });

  // Remember active theme
  const savedTheme = localStorage.getItem('epub-theme');
  const activeThemeBtn = Array.from(themeBtns).find(btn => btn.classList.contains('active'));
  let activeTheme = 'light';
  
  if (activeThemeBtn) {
    activeTheme = activeThemeBtn.getAttribute('data-theme') || 'light';
  } else if (savedTheme) {
    activeTheme = savedTheme;
  }
  
  applyTheme(activeTheme);
  
  // Apply Text Settings
  currentRendition.themes.font(epubFontFamily);
  currentRendition.themes.fontSize(`${epubFontSize}%`);

  // Load history if no startCfi provided
  const data = bookData[bookMetaMap.get(activeBook!)!.index];
  let targetCfi = startCfi;
  if (!targetCfi) {
    const savedCfi = localStorage.getItem(`epub-history-${data.title}`);
    if (savedCfi) targetCfi = savedCfi;
  }

  if (targetCfi) {
    currentRendition.display(targetCfi);
  } else {
    currentRendition.display();
  }

  currentBook.ready.then(() => {
    return currentBook.locations.generate(1600);
  }).then(() => {
    // initial progress update once locations are generated
    const currentLocation = currentRendition.currentLocation();
    if (currentLocation) {
      epubProgress.innerText = Math.round(currentLocation.start.percentage * 100) + '%';
    }
  });

  currentRendition.on('relocated', (location: any) => {
    if (location) {
      localStorage.setItem(`epub-history-${data.title}`, location.start.cfi);
      if (currentBook.locations.length() > 0) {
        epubProgress.innerText = Math.round(location.start.percentage * 100) + '%';
      }
    }
  });
}

epubLayoutBtn.addEventListener('click', () => {
  if (!currentRendition || !activeBook) return;
  const currentLocation = currentRendition.currentLocation();
  const cfi = currentLocation ? currentLocation.start.cfi : undefined;
  
  epubSpread = epubSpread === 'auto' ? 'none' : 'auto';
  localStorage.setItem('epub-spread', epubSpread);
  
  const data = bookData[bookMetaMap.get(activeBook)!.index];
  if (data.epubUrl) {
    loadEpub(data.epubUrl, cfi);
  }
});

function applyTheme(themeName: string) {
  if (!currentRendition) return;
  currentRendition.themes.select(themeName);
  
  // Update CSS Variables for surrounding UI
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
  
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
  });
}

themeBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget as HTMLElement;
    const theme = target.getAttribute('data-theme');
    if (theme) {
      applyTheme(theme);
      localStorage.setItem('epub-theme', theme);
    }
  });
});

function animateEpubTurn(direction: 'next'|'prev') {
  if (!currentRendition) return;

  const outClass = direction === 'next' ? 'epub-slide-out-left' : 'epub-slide-out-right';
  const inClass = direction === 'next' ? 'epub-slide-in-right' : 'epub-slide-in-left';

  // Animate Out
  epubViewer.classList.add(outClass);
  
  setTimeout(() => {
    if (direction === 'next') currentRendition.next();
    else currentRendition.prev();

    epubViewer.classList.remove(outClass);
    epubViewer.classList.add(inClass);

    setTimeout(() => {
      epubViewer.classList.remove(inClass);
    }, 500);
  }, 300); // Wait a bit before actually turning the page so it animates out
}

epubNextBtn.addEventListener('click', () => animateEpubTurn('next'));
epubPrevBtn.addEventListener('click', () => animateEpubTurn('prev'));

closeEpubBtn.addEventListener('click', () => {
  epubOverlay.classList.add('hidden');
  if (currentBook) {
    currentBook.destroy();
    currentBook = null;
    currentRendition = null;
  }
});

returnBtn.addEventListener('click', () => {
  if (!activeBook) return;
  
  shelfGroup.visible = true;
  canvas.classList.remove('inspect-shift');
  
  focusDetails.classList.add('hidden');
  returnBtn.classList.add('hidden');
  inspectBtn.classList.remove('hidden');
  
  controls.enabled = false;
  
  gsap.to(camera.position, {
    x: 0,
    y: 0.5,
    z: 5.5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(controls.target, {
    x: 0,
    y: 0.5,
    z: 0,
    duration: 1,
    ease: "power3.inOut"
  });
  
  const meta = bookMetaMap.get(activeBook)!;
  
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
  scene.add(activeBook);
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
      
      // Restore UI
      header.style.opacity = '1';
      statusInd.style.opacity = '1';
      footer.style.opacity = '1';
      navLeft.style.opacity = '1';
      navRight.style.opacity = '1';
      categoryFiltersContainer.style.opacity = '1';
    }
  });
  
  gsap.to(shelfGroup.position, {
    y: 0,
    duration: 1,
    ease: "power2.inOut"
  });
});

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  
  if (!isInspectMode) {
    currentScroll = THREE.MathUtils.lerp(currentScroll, scrollTarget, 0.08);
    shelfGroup.position.x = -currentScroll - shelfOffset;
    
    // Dynamic Lighting - lights shift based on scroll
    dirLight.position.x = 3 + (currentScroll * 0.1);
    
    // Update Scrubber
    const scrollPercent = currentScroll / maxScroll;
    scrubberThumb.style.left = `${scrollPercent * 100}%`;
    
    // Find closest book to center
    let minDistance = Infinity;
    let closestIndex = 0;
    
    for (const [group, meta] of bookMetaMap.entries()) {
      const dist = Math.abs(meta.centerPosX - currentScroll);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = meta.index;
      }
      
      // Hover & Center pop effect
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
    
    if (!hoveredBook && closestIndex !== focusedIndex && minDistance < 1.0) {
      focusedIndex = closestIndex;
      updateFocusUI(focusedIndex);
    }
  }
  
  controls.update();
  renderer.render(scene, camera);
}

function updateFocusUI(index: number) {
  focusOverlay.classList.remove('hidden');
  const data = bookData[index];
  focusIndex.innerHTML = `
    <span>${(index + 1).toString().padStart(2, '0')}</span>
    <div class="focus-line"></div>
    <span>${books.length.toString().padStart(2, '0')}</span>
  `;
  focusTitle.innerText = data.title;
  focusAuthor.innerText = data.author;
}

// Mobile tap-to-turn pages inside readers
document.getElementById('epub-tap-left')?.addEventListener('click', () => {
  if (currentRendition) currentRendition.prev();
});
document.getElementById('epub-tap-right')?.addEventListener('click', () => {
  if (currentRendition) currentRendition.next();
});
document.getElementById('pdf-tap-left')?.addEventListener('click', () => {
  onPrevPage();
});
document.getElementById('pdf-tap-right')?.addEventListener('click', () => {
  onNextPage();
});

animate();
