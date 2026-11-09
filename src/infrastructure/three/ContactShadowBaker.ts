import * as THREE from 'three';
import { disposeObject3D } from './disposal';

export const CONTACT_SHADOW_BAKED_NAME = 'contact-shadow-baked';
export const CONTACT_SHADOW_LIVE_NAME = 'contact-shadow-live';
export const CONTACT_SHADOW_HELPER_FLAG = 'softboxContactShadowHelper';
export const PATH_TRACING_FLOOR_FLAG = 'softboxPathTracingFloor';

export interface ContactShadowBakeContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  object: THREE.Object3D;
  light: THREE.DirectionalLight;
}

interface BakeRegion {
  center: THREE.Vector3;
  halfExtent: number;
  objectHeight: number;
  boundingRadius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function evictBakedContactShadow(scene: THREE.Scene): void {
  const existing = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME);
  if (existing) {
    scene.remove(existing);
    disposeObject3D(existing);
  }
}

export function restoreLiveContactShadow(scene: THREE.Scene): void {
  evictBakedContactShadow(scene);
  const liveCatcher = scene.getObjectByName(CONTACT_SHADOW_LIVE_NAME);
  if (liveCatcher) {
    liveCatcher.visible = true;
  }
}

export class ContactShadowBaker {
  private readonly explicitPasses?: number;

  private static readonly AMBIENT_RATIO = 0.62;
  private static readonly LIGHT_APERTURE_DEGREES = 13;
  private static readonly DEPTH_PADDING_FACTOR = 1.5;
  private static readonly AMBIENT_MAX_ELEVATION_SIN = 0.98;
  private static readonly AMBIENT_MIN_ELEVATION_DEGREES = 55;
  private static readonly ACCUMULATION_TEXTURE_SIZE = 1024;
  private static readonly BAKE_SHADOW_MAP_SIZE = 1024;
  private static readonly SHADOW_STRENGTH = 0.55;
  private static readonly DISC_FOOTPRINT_MARGIN = 1.4;
  private static readonly DISC_HEIGHT_STRETCH = 0.45;
  private static readonly DISC_MIN_HALF_EXTENT = 0.05;
  private static readonly FLOOR_LIFT_PER_HEIGHT = 0.0025;
  private static readonly FLOOR_LIFT_MIN = 0.0002;
  private static readonly FLOOR_LIFT_MAX = 0.01;
  private static readonly BAKE_BUDGET_MS = 100;
  private static readonly MIN_PASSES = 24;
  private static readonly MAX_PASSES = 96;

  constructor(options?: { passes?: number }) {
    this.explicitPasses = options?.passes;
  }

  bake(context: ContactShadowBakeContext): void {
    const { renderer, scene, object, light } = context;

    if (renderer.getContext().isContextLost()) {
      this.leaveLiveCatcherInCharge(scene);
      return;
    }

    const region = this.measureBakeRegion(object);
    if (!region) {
      return;
    }

    const liveCatcher = scene.getObjectByName(CONTACT_SHADOW_LIVE_NAME) as THREE.Mesh | undefined;
    if (liveCatcher?.geometry instanceof THREE.CircleGeometry) {
      region.halfExtent = Math.min(region.halfExtent, liveCatcher.geometry.parameters.radius);
    }

    const renderTarget = new THREE.WebGLRenderTarget(
      ContactShadowBaker.ACCUMULATION_TEXTURE_SIZE,
      ContactShadowBaker.ACCUMULATION_TEXTURE_SIZE,
      {
        type: renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false,
      }
    );

    const shadowDiscGeometry = new THREE.CircleGeometry(region.halfExtent, 64);
    try {
      this.accumulateShadowPasses(renderer, object, light, region, renderTarget, shadowDiscGeometry);
    } catch (error) {
      renderTarget.dispose();
      shadowDiscGeometry.dispose();
      throw error;
    }

    if (renderer.getContext().isContextLost()) {
      renderTarget.dispose();
      shadowDiscGeometry.dispose();
      this.leaveLiveCatcherInCharge(scene);
      console.warn('Contact-shadow bake aborted: WebGL context was lost mid-bake');
      return;
    }
    this.installBakedMesh(scene, region, renderTarget, shadowDiscGeometry);
  }

  private leaveLiveCatcherInCharge(scene: THREE.Scene): void {
    restoreLiveContactShadow(scene);
  }

  private evictBakedMesh(scene: THREE.Scene): void {
    evictBakedContactShadow(scene);
  }

  private measureBakeRegion(object: THREE.Object3D): BakeRegion | null {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
      return null;
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const footprint = Math.max(size.x, size.z);
    const halfExtent = Math.max(
      footprint * ContactShadowBaker.DISC_FOOTPRINT_MARGIN +
        size.y * ContactShadowBaker.DISC_HEIGHT_STRETCH,
      ContactShadowBaker.DISC_MIN_HALF_EXTENT
    );
    return { center, halfExtent, objectHeight: size.y, boundingRadius: size.length() / 2 };
  }

  private accumulateShadowPasses(
    renderer: THREE.WebGLRenderer,
    object: THREE.Object3D,
    light: THREE.DirectionalLight,
    region: BakeRegion,
    renderTarget: THREE.WebGLRenderTarget,
    shadowDiscGeometry: THREE.CircleGeometry
  ): void {
    const bakeScene = new THREE.Scene();

    const previousParent = object.parent;
    bakeScene.add(object);
    const maskedMaterials = this.disableColorWrite(object);

    const bakeLight = this.createBakeLight(light);
    bakeScene.add(bakeLight);
    bakeScene.add(bakeLight.target);
    bakeLight.target.position.copy(
      light.target.parent
        ? light.target.getWorldPosition(new THREE.Vector3())
        : light.target.position
    );

    const accumulationMaterial = new THREE.ShadowMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    accumulationMaterial.blending = THREE.CustomBlending;
    accumulationMaterial.blendEquation = THREE.AddEquation;
    accumulationMaterial.blendSrc = THREE.OneFactor;
    accumulationMaterial.blendDst = THREE.OneFactor;

    const bakePlane = new THREE.Mesh(shadowDiscGeometry, accumulationMaterial);
    bakePlane.rotation.x = -Math.PI / 2;
    bakePlane.position.set(region.center.x, 0, region.center.z);
    bakePlane.receiveShadow = true;
    bakeScene.add(bakePlane);

    const camera = this.createBakeCamera(region);
    bakeScene.add(camera);

    const previousRenderTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;

    try {
      renderer.shadowMap.autoUpdate = true;
      renderer.setRenderTarget(renderTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.autoClear = false;

      const passCount =
        this.explicitPasses ??
        this.measureAffordablePasses(renderer, bakeScene, camera, light, bakeLight, renderTarget);
      accumulationMaterial.opacity = 1 / passCount;

      for (const lightPosition of this.sampleLightPositions(light, passCount)) {
        bakeLight.position.copy(lightPosition);
        this.fitBakeDepthRange(bakeLight, region);
        renderer.render(bakeScene, camera);
      }
    } finally {
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.setRenderTarget(previousRenderTarget);
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;

      this.restoreColorWrite(maskedMaterials);
      if (previousParent) {
        previousParent.add(object);
      } else {
        bakeScene.remove(object);
      }
      bakeLight.dispose();
      accumulationMaterial.dispose();
    }
  }

  private measureAffordablePasses(
    renderer: THREE.WebGLRenderer,
    bakeScene: THREE.Scene,
    camera: THREE.OrthographicCamera,
    light: THREE.DirectionalLight,
    bakeLight: THREE.DirectionalLight,
    renderTarget: THREE.WebGLRenderTarget
  ): number {
    bakeLight.position.copy(light.position);

    renderer.render(bakeScene, camera);
    this.awaitGpuIdle(renderer, renderTarget);

    const start = performance.now();
    renderer.render(bakeScene, camera);
    this.awaitGpuIdle(renderer, renderTarget);
    const perPassMs = Math.max(performance.now() - start, 0.01);

    return THREE.MathUtils.clamp(
      Math.round(ContactShadowBaker.BAKE_BUDGET_MS / perPassMs),
      ContactShadowBaker.MIN_PASSES,
      ContactShadowBaker.MAX_PASSES
    );
  }

  private awaitGpuIdle(renderer: THREE.WebGLRenderer, renderTarget: THREE.WebGLRenderTarget): void {
    if (!renderer.capabilities.textureTypeReadable(renderTarget.texture.type)) {
      return;
    }
    const readbackPixel =
      renderTarget.texture.type === THREE.HalfFloatType ? new Uint16Array(4) : new Uint8Array(4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, 1, 1, readbackPixel);
  }

  private createBakeLight(light: THREE.DirectionalLight): THREE.DirectionalLight {
    const bakeLight = new THREE.DirectionalLight(0xffffff, 1);
    bakeLight.castShadow = true;
    bakeLight.shadow.mapSize.set(
      ContactShadowBaker.BAKE_SHADOW_MAP_SIZE,
      ContactShadowBaker.BAKE_SHADOW_MAP_SIZE
    );
    bakeLight.shadow.bias = 0;
    bakeLight.shadow.normalBias = 0;
    bakeLight.shadow.radius = 6;

    const sourceCamera = light.shadow.camera;
    const bakeCamera = bakeLight.shadow.camera;
    bakeCamera.left = sourceCamera.left;
    bakeCamera.right = sourceCamera.right;
    bakeCamera.top = sourceCamera.top;
    bakeCamera.bottom = sourceCamera.bottom;
    bakeCamera.updateProjectionMatrix();
    return bakeLight;
  }

  private fitBakeDepthRange(bakeLight: THREE.DirectionalLight, region: BakeRegion): void {
    const viewDirection = bakeLight.target.position.clone().sub(bakeLight.position).normalize();
    const toCenter = region.center.clone().sub(bakeLight.position);
    const centerDepth = toCenter.dot(viewDirection);
    const padding = region.boundingRadius * ContactShadowBaker.DEPTH_PADDING_FACTOR + region.halfExtent;

    const camera = bakeLight.shadow.camera;
    camera.near = Math.max(centerDepth - padding, centerDepth * 0.01);
    camera.far = centerDepth + padding;
    camera.updateProjectionMatrix();
  }

  private createBakeCamera(region: BakeRegion): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(
      -region.halfExtent,
      region.halfExtent,
      region.halfExtent,
      -region.halfExtent,
      0.1,
      Math.max(region.objectHeight, 1) * 4
    );
    camera.position.set(region.center.x, Math.max(region.objectHeight, 1) * 2, region.center.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(region.center.x, 0, region.center.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }

  private sampleLightPositions(light: THREE.DirectionalLight, passes: number): THREE.Vector3[] {
    const basePosition = light.position.clone();
    const targetPosition = light.target.parent
      ? light.target.getWorldPosition(new THREE.Vector3())
      : light.target.position.clone();

    const toTarget = targetPosition.clone().sub(basePosition);
    const baseDistance = toTarget.length();
    const direction = toTarget.normalize();

    const discU = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
    if (discU.lengthSq() < 1e-6) {
      discU.set(1, 0, 0);
    }
    discU.normalize();
    const discV = new THREE.Vector3().crossVectors(direction, discU);

    const ambientPasses = Math.round(passes * ContactShadowBaker.AMBIENT_RATIO);
    const directionalPasses = passes - ambientPasses;
    const apertureRadians = THREE.MathUtils.degToRad(ContactShadowBaker.LIGHT_APERTURE_DEGREES);
    const discRadius = Math.tan(apertureRadians / 2) * baseDistance;

    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < directionalPasses; i++) {
      const radius = discRadius * Math.sqrt((i + 0.5) / directionalPasses);
      const angle = i * GOLDEN_ANGLE;
      positions.push(
        basePosition
          .clone()
          .addScaledVector(discU, radius * Math.cos(angle))
          .addScaledVector(discV, radius * Math.sin(angle))
      );
    }

    const minElevationSin = Math.sin(
      THREE.MathUtils.degToRad(ContactShadowBaker.AMBIENT_MIN_ELEVATION_DEGREES)
    );
    const maxElevationSin = ContactShadowBaker.AMBIENT_MAX_ELEVATION_SIN;
    for (let i = 0; i < ambientPasses; i++) {
      const zenithBiased = Math.sqrt((i + 0.5) / ambientPasses);
      const elevationSin = minElevationSin + (maxElevationSin - minElevationSin) * zenithBiased;
      const elevationCos = Math.sqrt(1 - elevationSin * elevationSin);
      const azimuth = i * GOLDEN_ANGLE;
      positions.push(
        new THREE.Vector3(
          elevationCos * Math.cos(azimuth),
          elevationSin,
          elevationCos * Math.sin(azimuth)
        )
          .multiplyScalar(baseDistance)
          .add(targetPosition)
      );
    }
    return positions;
  }

  private installBakedMesh(
    scene: THREE.Scene,
    region: BakeRegion,
    renderTarget: THREE.WebGLRenderTarget,
    shadowDiscGeometry: THREE.CircleGeometry
  ): void {
    this.evictBakedMesh(scene);

    const material = new THREE.MeshBasicMaterial({
      map: renderTarget.texture,
      transparent: true,
      opacity: ContactShadowBaker.SHADOW_STRENGTH,
      depthWrite: false,
      toneMapped: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.a = pow(diffuseColor.a, 0.75);'
      );
    };
    material.customProgramCacheKey = () => 'contact-shadow-alpha-gamma';
    material.addEventListener('dispose', () => renderTarget.dispose());

    const mesh = new THREE.Mesh(shadowDiscGeometry, material);
    mesh.name = CONTACT_SHADOW_BAKED_NAME;
    mesh.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
    mesh.rotation.x = -Math.PI / 2;
    const floorOffset = THREE.MathUtils.clamp(
      region.objectHeight * ContactShadowBaker.FLOOR_LIFT_PER_HEIGHT,
      ContactShadowBaker.FLOOR_LIFT_MIN,
      ContactShadowBaker.FLOOR_LIFT_MAX
    );
    mesh.position.set(region.center.x, floorOffset, region.center.z);
    mesh.userData.renderTarget = renderTarget;
    scene.add(mesh);

    const liveCatcher = scene.getObjectByName(CONTACT_SHADOW_LIVE_NAME);
    if (liveCatcher) {
      liveCatcher.visible = false;
    }
  }

  private disableColorWrite(object: THREE.Object3D): Map<THREE.Material, boolean> {
    const masked = new Map<THREE.Material, boolean>();
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material && !masked.has(material)) {
          masked.set(material, material.colorWrite);
          material.colorWrite = false;
        }
      }
    });
    return masked;
  }

  private restoreColorWrite(masked: Map<THREE.Material, boolean>): void {
    masked.forEach((colorWrite, material) => {
      material.colorWrite = colorWrite;
    });
  }
}
