import * as THREE from 'three';

export interface BookMeta {
  originalParent: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  index: number;
  centerPosX: number;
}

export class BookComponent {
  public group: THREE.Group;
  public meta: BookMeta;
  
  constructor(
    index: number,
    title: string,
    author: string,
    color: string,
    width: number,
    height: number,
    depth: number,
    posX: number,
    posZ: number,
    rotZ: number,
    originalParent: THREE.Object3D,
    maxAnisotropy: number,
    sharedPagesMat: THREE.MeshStandardMaterial
  ) {
    this.group = new THREE.Group();

    const spineTex = this.createSpineTexture(title, author, color, maxAnisotropy);
    const coverTex = this.createCoverTexture(title, author, color, maxAnisotropy);

    const bMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 });
    const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.5, metalness: 0.1 });
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.5, metalness: 0.1 });

    const coverThickness = 0.015;
    const overhang = 0.015;

    const rcGeo = new THREE.BoxGeometry(coverThickness, height + overhang * 2, depth + overhang);
    const rcMesh = new THREE.Mesh(rcGeo, [coverMat, bMat, bMat, bMat, bMat, bMat]); // +X gets coverMat
    rcMesh.position.set(width / 2 - coverThickness / 2, height / 2, overhang / 2);
    rcMesh.castShadow = true;
    rcMesh.receiveShadow = true;

    const lcGeo = new THREE.BoxGeometry(coverThickness, height + overhang * 2, depth + overhang);
    const lcMesh = new THREE.Mesh(lcGeo, [bMat, coverMat, bMat, bMat, bMat, bMat]); // -X gets coverMat
    lcMesh.position.set(-width / 2 + coverThickness / 2, height / 2, overhang / 2);
    lcMesh.castShadow = true;
    lcMesh.receiveShadow = true;

    const spineGeo = new THREE.BoxGeometry(width, height + overhang * 2, coverThickness);
    const spineMeshObj = new THREE.Mesh(spineGeo, [bMat, bMat, bMat, bMat, spineMat, bMat]);
    spineMeshObj.position.set(0, height / 2, depth / 2 + coverThickness / 2);
    spineMeshObj.castShadow = true;
    spineMeshObj.receiveShadow = true;

    const pagesGeo = new THREE.BoxGeometry(width - coverThickness * 2, height * 0.98, depth - overhang);
    const pagesMesh = new THREE.Mesh(pagesGeo, sharedPagesMat);
    pagesMesh.position.set(0, height / 2, -overhang / 2);
    pagesMesh.receiveShadow = true;

    this.group.add(rcMesh, lcMesh, spineMeshObj, pagesMesh);
    this.group.position.set(posX, 0, posZ);
    this.group.rotation.z = rotZ;

    this.meta = {
      originalParent,
      originalPosition: this.group.position.clone(),
      originalRotation: this.group.rotation.clone(),
      index,
      centerPosX: posX
    };
  }

  private createSpineTexture(title: string, author: string, color: string, maxAnisotropy: number): THREE.CanvasTexture {
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
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + val));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + val));
    }
    ctx.putImageData(imgData, 0, 0);

    const spineShading = ctx.createLinearGradient(0, 0, canvas.width, 0);
    spineShading.addColorStop(0, 'rgba(0,0,0,0.4)');
    spineShading.addColorStop(0.15, 'rgba(0,0,0,0.0)');
    spineShading.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    spineShading.addColorStop(0.85, 'rgba(0,0,0,0.0)');
    spineShading.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = spineShading;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const vignette = ctx.createLinearGradient(0, 0, 0, canvas.height);
    vignette.addColorStop(0, 'rgba(0,0,0,0.6)');
    vignette.addColorStop(0.1, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.9, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
    const maxW = canvas.height - 400 - authorWidth - 40;
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
    texture.anisotropy = maxAnisotropy;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createCoverTexture(title: string, author: string, color: string, maxAnisotropy: number): THREE.CanvasTexture {
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
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + val));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + val));
    }
    ctx.putImageData(imgData, 0, 0);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.max(cx, cy) * 1.2;
    const radialVignette = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    radialVignette.addColorStop(0, 'rgba(0,0,0,0)');
    radialVignette.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = radialVignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
    texture.anisotropy = maxAnisotropy;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
