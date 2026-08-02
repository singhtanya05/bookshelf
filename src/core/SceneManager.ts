import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  public ambientLight!: THREE.AmbientLight;
  public dirLight!: THREE.DirectionalLight;
  public backLight!: THREE.DirectionalLight;
  public lampLight!: THREE.PointLight;
  public fillLight!: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#F5F3ED', 10, 25);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0.5, 5.5);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.target.set(0, 0.5, 0);
    this.controls.update();

    this.initLighting();
    this.initResizeHandler();
  }

  private initLighting(): void {
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.8);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 2);
    this.dirLight.position.set(5, 5, 5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.scene.add(this.dirLight);

    this.backLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.backLight.position.set(-5, 5, -5);
    this.scene.add(this.backLight);

    // Ancient Lamp Warm Light
    this.lampLight = new THREE.PointLight(0xffaa55, 3, 20);
    this.lampLight.position.set(-2, 3, 4);
    this.scene.add(this.lampLight);

    this.fillLight = new THREE.DirectionalLight('#F5F3ED', 0.6);
    this.fillLight.position.set(-5, 2, 5);
    this.scene.add(this.fillLight);
  }

  private initResizeHandler(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  public render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
