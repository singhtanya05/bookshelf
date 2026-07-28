import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

const scrubberThumb = document.querySelector('#scrubber-thumb') as HTMLElement;
const scrubberTicks = document.querySelector('.scrubber-ticks') as HTMLElement;

// --- Data ---
const bookData = [
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

function createSpineTexture(title: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#ffffff';
  if (color === '#D1C9BE') ctx.fillStyle = '#2A2A28'; // Dark text for cream book
  
  ctx.translate(canvas.width / 2, canvas.height - 100);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '50px "Playfair Display", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCoverTexture(title: string, author: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536; // Approx 1:1.5
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Concentric circles design
  const isDark = color === '#2A2A28' || color === '#3B4A3F' || color === '#2B3B4C' || color === '#54407B';
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  
  // Custom orange circles for "Boom" to match the sample
  if (title.includes("Boom")) {
    ctx.strokeStyle = '#D56E52';
  }

  ctx.lineWidth = 15;
  const centerX = canvas.width / 2;
  const centerY = canvas.height * 0.65;
  
  for (let r = 50; r < 800; r += 60) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Typography
  ctx.fillStyle = isDark ? '#ffffff' : '#2A2A28';
  if (color === '#D1C9BE') ctx.fillStyle = '#2A2A28'; // Cream book
  
  // "THE COMPLETE SHELF" header
  ctx.font = '600 30px "Inter", sans-serif';
  ctx.fillText("THE COMPLETE SHELF", 100, 80);
  
  ctx.font = 'bold 110px "Playfair Display", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Wrap text
  const words = title.split(' ');
  let line = '';
  let y = 180;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > canvas.width - 200 && n > 0) {
      ctx.fillText(line, 100, y);
      line = words[n] + ' ';
      y += 120;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 100, y);
  
  ctx.font = 'italic 50px "Playfair Display", serif';
  ctx.fillText(author, 100, y + 160);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const totalWidths: number[] = [];
for (let i = 0; i < bookCount; i++) {
  const data = bookData[i];
  const bGroup = new THREE.Group();
  
  const bWidth = 0.15 + Math.random() * 0.1;
  const bHeight = 1.3 + Math.random() * 0.3;
  const bDepth = 0.9 + Math.random() * 0.1;
  
  const spineTex = createSpineTexture(data.title, data.color);
  const coverTex = createCoverTexture(data.title, data.author, data.color);
  
  const bMat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.7 });
  const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.5 });
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.5 });
  
  // Index 0: right (x+) (front cover when rotated +90 deg around Y)
  // Index 1: left (x-) (back cover)
  // Index 2: top (y+)
  // Index 3: bottom (y-)
  // Index 4: front (z+) (spine facing out on shelf)
  // Index 5: back (z-) (pages)
  const materials = [coverMat, bMat, bMat, bMat, spineMat, bMat];
  
  const bGeo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
  const bMesh = new THREE.Mesh(bGeo, materials);
  bMesh.position.y = bHeight / 2;
  bMesh.castShadow = true;
  bMesh.receiveShadow = true;
  
  // Paper pages detail
  const pagesGeo = new THREE.BoxGeometry(bWidth * 0.8, bHeight * 0.96, bDepth * 0.96);
  const pagesMat = new THREE.MeshStandardMaterial({ color: '#EBE5D9', roughness: 1.0 });
  const pagesMesh = new THREE.Mesh(pagesGeo, pagesMat);
  pagesMesh.position.set(-0.01, bHeight / 2, -0.01);
  
  bGroup.add(bMesh);
  bGroup.add(pagesMesh);
  
  const posX = currentX + bWidth / 2;
  bGroup.position.set(posX, 0, 0);
  
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
        // Optionally update focus UI to hovered book instead of center book
        // focusedIndex = bookMetaMap.get(hoveredBook)!.index;
      } else {
        document.body.style.cursor = 'default';
      }
    } else {
      document.body.style.cursor = 'default';
    }
  }
});

window.addEventListener('mouseup', (e) => {
  isDragging = false;
  if (!isInspectMode && hoveredBook && Math.abs(e.clientX - lastX) < 5) {
    inspectBook(hoveredBook);
  }
});
window.addEventListener('mouseleave', () => { 
  isDragging = false;
  hoveredBook = null;
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
  
  const targetX = window.innerWidth > 800 ? -0.8 : 0;
  
  // Animate camera position and target together to look straight at the book
  gsap.to(camera.position, {
    x: targetX,
    y: 0.75, // Camera at eye level with the book center
    z: 8,    // Increased distance to prevent cropping
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
}

resetViewBtn.addEventListener('click', () => {
  if (!activeBook) return;
  const targetX = window.innerWidth > 800 ? -0.8 : 0;
  gsap.to(camera.position, {
    x: targetX,
    y: 0.75,
    z: 8,
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
