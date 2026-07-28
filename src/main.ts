import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as pdfjsLib from 'pdfjs-dist';

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
const focusCurrent = document.querySelector('#focus-current') as HTMLElement;
const focusTitle = document.querySelector('#focus-title') as HTMLElement;
const focusAuthor = document.querySelector('#focus-author') as HTMLElement;

const inspectOverlay = document.querySelector('#inspection-overlay') as HTMLElement;
const inspectCurrent = document.querySelector('#inspect-current') as HTMLElement;
const inspectTitle = document.querySelector('#inspect-title') as HTMLElement;
const inspectAuthor = document.querySelector('#inspect-author') as HTMLElement;
const returnBtn = document.querySelector('#return-button') as HTMLButtonElement;
const resetViewBtn = document.querySelector('#reset-view-btn') as HTMLButtonElement;
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

// --- Data ---
interface BookData {
  title: string;
  author: string;
  color: string;
  pdfUrl?: string;
}

const bookData: BookData[] = [
  { title: "Secrets of Divine Love", author: "A. Helwa", color: "#5F4B3C", pdfUrl: "/books/secrets_of_divine_love.pdf" },
  { title: "The Sovereign Individual", author: "James Dale Davidson", color: "#3B4A3F" }, // Dark green
  { title: "The Dream Machine", author: "M. Mitchell Waldrop", color: "#E88D56" }, // Orange
  { title: "The Art of Doing Science", author: "Richard W. Hamming", color: "#C44943" }, // Red
  { title: "Poor Charlie's Almanack", author: "Peter D. Kaufman", color: "#2B3B4C" }, // Dark blue
  { title: "High Growth Handbook", author: "Elad Gil", color: "#D1C9BE" }, // Cream
  { title: "Origins of Efficiency", author: "Brian Potter", color: "#DE8A75" }, // Salmon
  { title: "Scaling People", author: "Claire Hughes Johnson", color: "#D56E52" }, // Bright orange
  { title: "The Revolt of the Public", author: "Martin Gurri", color: "#2A2A28" }, // Dark grey
  { title: "Boom: Bubbles & Stagnation", author: "Byrne Hobart", color: "#2A2A28" }, // Highlighted in sample
  { title: "Pieces of the Action", author: "Vannevar Bush", color: "#879B75" }, // Olive green
  { title: "Working in Public", author: "Nadia Eghbal", color: "#2659A5" }, // Blue
  { title: "Get Together", author: "Bailey Richardson", color: "#E0B739" }, // Yellow
  { title: "Scientific Freedom", author: "Donald W. Braben", color: "#54407B" }, // Purple
  { title: "Stubborn Attachments", author: "Tyler Cowen", color: "#4B7A5C" }, // Green
  { title: "The Psychology of Money", author: "Morgan Housel", color: "#3B4A3F" },
  { title: "Zero to One", author: "Peter Thiel", color: "#E88D56" },
  { title: "Thinking in Systems", author: "Donella Meadows", color: "#C44943" },
  { title: "Range", author: "David Epstein", color: "#2B3B4C" },
  { title: "Superintelligence", author: "Nick Bostrom", color: "#2A2A28" }
];
const bookCount = bookData.length;

// Populate ticks
for(let i=0; i<10; i++) {
  const tick = document.createElement('div');
  tick.className = 'scrubber-tick';
  scrubberTicks.appendChild(tick);
}

// --- Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color('#F5F3ED');
scene.fog = new THREE.Fog('#F5F3ED', 10, 25);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 7.5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;
controls.target.set(0, 1.2, 0);
controls.update();

// --- Lighting ---
const ambientLight = new THREE.AmbientLight('#ffffff', 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight('#ffffff', 1.5);
dirLight.position.set(3, 8, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.0001;
scene.add(dirLight);

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
  
  // Foil accents
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(30, 100, canvas.width - 60, 6);
  ctx.fillRect(30, 120, canvas.width - 60, 2);
  ctx.fillRect(30, canvas.height - 120, canvas.width - 60, 2);
  ctx.fillRect(30, canvas.height - 100, canvas.width - 60, 6);
  
  ctx.fillStyle = '#ffffff';
  if (color === '#D1C9BE') ctx.fillStyle = '#2A2A28';
  
  ctx.translate(canvas.width / 2, canvas.height - 200);
  ctx.rotate(-Math.PI / 2);
  
  ctx.font = 'bold 80px "Playfair Display", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 0, 0);
  
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
  
  // Foil accent line
  ctx.fillStyle = '#D4AF37';
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

const totalWidths: number[] = [];
for (let i = 0; i < bookCount; i++) {
  const data = bookData[i];
  const bGroup = new THREE.Group();
  
  const bWidth = 0.15 + Math.random() * 0.05;
  const bHeight = 1.3 + Math.random() * 0.3;
  const bDepth = 0.9 + Math.random() * 0.1;
  
  const spineTex = createSpineTexture(data.title, data.author, data.color);
  const coverTex = createCoverTexture(data.title, data.author, data.color);
  
  const bMat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.9 });
  const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.8 });
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.8 });
  
  const coverThickness = 0.015;
  const overhang = 0.015;
  
  const rcGeo = new THREE.BoxGeometry(coverThickness, bHeight + overhang*2, bDepth + overhang);
  const rcMesh = new THREE.Mesh(rcGeo, [coverMat, bMat, bMat, bMat, bMat, bMat]);
  rcMesh.position.set(bWidth/2 - coverThickness/2, bHeight/2, overhang/2);
  rcMesh.castShadow = true; rcMesh.receiveShadow = true;
  
  const lcGeo = new THREE.BoxGeometry(coverThickness, bHeight + overhang*2, bDepth + overhang);
  const lcMesh = new THREE.Mesh(lcGeo, bMat);
  lcMesh.position.set(-bWidth/2 + coverThickness/2, bHeight/2, overhang/2);
  lcMesh.castShadow = true; lcMesh.receiveShadow = true;
  
  const spineGeo = new THREE.BoxGeometry(bWidth, bHeight + overhang*2, coverThickness);
  const spineMeshObj = new THREE.Mesh(spineGeo, [bMat, bMat, bMat, bMat, spineMat, bMat]);
  spineMeshObj.position.set(0, bHeight/2, bDepth/2 + coverThickness/2);
  spineMeshObj.castShadow = true; spineMeshObj.receiveShadow = true;
  
  const pagesGeo = new THREE.BoxGeometry(bWidth - coverThickness*2, bHeight * 0.98, bDepth - overhang);
  const pagesMat = new THREE.MeshStandardMaterial({ color: '#EBE5D9', roughness: 1.0 });
  const pagesMesh = new THREE.Mesh(pagesGeo, pagesMat);
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
const maxScroll = currentX - totalWidths[bookCount - 1] / 2;
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
let isDragging = false;
let lastX = 0;

window.addEventListener('wheel', (e) => {
  if (isInspectMode) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  scrollTarget += delta * 0.003;
  scrollTarget = THREE.MathUtils.clamp(scrollTarget, 0, maxScroll);
});

window.addEventListener('mousedown', (e) => {
  if (isInspectMode) return;
  if (e.target !== canvas) return; // Only drag on canvas
  isDragging = true;
  lastX = e.clientX;
});

window.addEventListener('mousemove', (e) => {
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

window.addEventListener('mouseup', (e) => {
  isDragging = false;
  if (!isInspectMode && hoveredBook && Math.abs(e.clientX - lastX) < 5) {
    hoverTooltip.classList.remove('visible');
    inspectBook(hoveredBook);
  }
});
window.addEventListener('mouseleave', () => { 
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
  focusOverlay.classList.add('hidden');
  
  // Show Inspection UI
  inspectOverlay.classList.remove('hidden');
  const data = bookData[bookMetaMap.get(book)!.index];
  inspectCurrent.innerText = (bookMetaMap.get(book)!.index + 1).toString().padStart(2, '0');
  inspectTitle.innerText = data.title;
  inspectAuthor.innerText = data.author;
  
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  book.getWorldPosition(worldPos);
  book.getWorldQuaternion(worldQuat);
  
  scene.add(book);
  book.position.copy(worldPos);
  book.quaternion.copy(worldQuat);
  
  const targetX = window.innerWidth > 800 ? -2.5 : 0;
  
  // Animate camera position and target together to look straight at the book
  gsap.to(camera.position, {
    x: targetX,
    y: 0.75, // Camera at eye level with the book center
    z: 10,    // Move camera further back to avoid cropping
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(controls.target, {
    x: targetX,
    y: 0.75, // Target the center of the book (bMesh is offset by bHeight/2)
    z: 5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(book.position, {
    x: targetX,
    y: 0, // Book rests at y=0, its center is at y=~0.75
    z: 5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(book.scale, {
    x: 1, y: 1, z: 1,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(book.rotation, {
    x: 0,
    y: -Math.PI / 2 + 0.15, // Rotate to show the front cover (Index 0 is X+)
    z: 0,
    duration: 1,
    ease: "power3.inOut",
    onComplete: () => {
      controls.enabled = true;
    }
  });
  
  gsap.to(shelfGroup.position, {
    z: -5,
    y: -2,
    duration: 1,
    ease: "power2.inOut"
  });
  
  // Staggered reveal of text elements
  gsap.fromTo('.stagger-el', 
    { y: 20, opacity: 0 }, 
    { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out', delay: 0.4 }
  );
}

resetViewBtn.addEventListener('click', () => {
  if (!activeBook) return;
  const targetX = window.innerWidth > 800 ? -2.5 : 0;
  gsap.to(camera.position, {
    x: targetX,
    y: 0.75,
    z: 10,
    duration: 0.5,
    ease: "power2.inOut"
  });
  gsap.to(controls.target, {
    x: targetX,
    y: 0.75,
    z: 5,
    duration: 0.5,
    ease: "power2.inOut"
  });
});

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

viewBookBtn.addEventListener('click', () => {
  if (!activeBook) return;
  const data = bookData[bookMetaMap.get(activeBook)!.index];
  
  if (data.pdfUrl) {
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

returnBtn.addEventListener('click', () => {
  if (!activeBook) return;
  
  inspectOverlay.classList.add('hidden');
  controls.enabled = false;
  
  gsap.to(camera.position, {
    x: 0,
    y: 1.2,
    z: 7.5,
    duration: 1,
    ease: "power3.inOut"
  });
  
  gsap.to(controls.target, {
    x: 0,
    y: 1.2,
    z: 0,
    duration: 1,
    ease: "power3.inOut"
  });
  
  const meta = bookMetaMap.get(activeBook)!;
  
  const targetWorldPos = new THREE.Vector3();
  const targetWorldQuat = new THREE.Quaternion();
  
  meta.originalParent.add(activeBook);
  activeBook.position.copy(meta.originalPosition);
  activeBook.rotation.copy(meta.originalRotation);
  activeBook.updateMatrixWorld();
  activeBook.getWorldPosition(targetWorldPos);
  activeBook.getWorldQuaternion(targetWorldQuat);
  
  scene.add(activeBook);
  
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
    }
  });
  
  gsap.to(shelfGroup.position, {
    z: 0,
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
      const dist = Math.abs(meta.centerPosX - currentScroll - shelfOffset);
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
    
    if (closestIndex !== focusedIndex && minDistance < 1.0) {
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
  focusCurrent.innerText = (index + 1).toString().padStart(2, '0');
  focusTitle.innerText = data.title;
  focusAuthor.innerText = data.author;
}

animate();
