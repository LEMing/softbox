import * as THREE from 'three';
import { disposeObject3D } from './disposal';

export const CONTACT_SHADOW_BAKED_NAME = 'contact-shadow-baked';
export const CONTACT_SHADOW_LIVE_NAME = 'contact-shadow-live';
/**
 * userData marker set on every viewer-owned contact-shadow helper mesh.
 * Lookups that must not confuse a helper with a same-named node inside a
 * consumer's model (names are consumer-controlled, userData tags are not)
 * key on this instead of the names above.
 */
export const CONTACT_SHADOW_HELPER_FLAG = 'softboxContactShadowHelper';
/**
 * userData marker for a real ground surface that exists ONLY for the path
 * tracer: it stays `visible = false` (so the raster view keeps its clean
 * invisible-floor look) and is flipped visible only while the tracer ingests
 * the scene into its BVH, giving the model a physical surface to cast a
 * contact shadow onto. The raster shadow-catcher above stays raster-only —
 * these two are mirror images (one hidden from the tracer, one shown only to it).
 */
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
  /** Half-diagonal of the object's bounding box: every vertex is within this of `center`. */
  boundingRadius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Bakes a soft area-light contact shadow onto the floor plane by averaging
 * many one-sample shadow renders, each with the key light jittered as if it
 * were a physical light of finite size. A single shadow-map pass has a
 * constant-width penumbra everywhere, which is why it never reads like a
 * studio product render: a real shadow is sharp and dark right at the
 * contact point and grows softer with distance. Averaging jittered passes
 * reproduces that distance-dependent penumbra exactly, and a share of the
 * passes samples the whole upper hemisphere so ambient occlusion pools in
 * the contact area the way skylight does.
 *
 * The accumulation runs in a private throwaway scene (the model is
 * reparented into it for the duration of the synchronous bake): the shadow
 * map renderer only draws casters whose layers match the *view* camera, so
 * baking inside the live scene would force the model into the color pass
 * too, polluting the accumulation texture with its own silhouette. The
 * model's materials have colorWrite disabled during the bake for the same
 * reason. The result replaces the live ShadowMaterial catcher with a static
 * texture, so orbiting the (unchanged) scene costs nothing extra per frame.
 *
 * The bake is synchronous on the main thread, so the pass count adapts to
 * what the device can actually afford: one probe pass is timed with a forced
 * GPU sync, and the count is chosen to fit the frame budget (clamped to
 * [MIN_PASSES, MAX_PASSES]). Passing an explicit `passes` option skips the
 * probe and bakes exactly that count. A lost WebGL context aborts the bake
 * gracefully — the live catcher simply stays in charge.
 */
export class ContactShadowBaker {
  private readonly explicitPasses?: number;

  /**
   * Share of passes that sample the sky hemisphere instead of the key light.
   * Weighted toward ambient: it's what pools darkness at the contact points,
   * and thin upright models (no overhang) get little of it otherwise.
   */
  private static readonly AMBIENT_RATIO = 0.62;
  /** Apex angle of the simulated area light — the main softness control. */
  private static readonly LIGHT_APERTURE_DEGREES = 13;
  /**
   * Ambient samples stay steep: each lower sample casts a long hard
   * silhouette, and with a few dozen discrete azimuths a tall thin model
   * reads as a star of distinct ghost shadows instead of a soft pool. Steep
   * samples also keep the occlusion pool tight around the contact points —
   * a wide gentle gradient makes the floor read as fabric dented by the
   * model rather than a hard surface it stands on.
   */
  private static readonly AMBIENT_MIN_ELEVATION_DEGREES = 55;
  private static readonly ACCUMULATION_TEXTURE_SIZE = 1024;
  /** Jitter averaging blurs far more than map resolution, so a small map is enough. */
  private static readonly BAKE_SHADOW_MAP_SIZE = 1024;
  /** Overall darkness: the floor keeps some ambient bounce even in full shadow. */
  private static readonly SHADOW_STRENGTH = 0.55;
  /**
   * Shadow-disc half-extent = footprint * FOOTPRINT_MARGIN + height *
   * HEIGHT_STRETCH, floored at MIN_HALF_EXTENT. Wide enough that the directional
   * stretch (the object's height tilted along the key light) and the outer
   * penumbra both fade well before the disc edge — a shadow clipped by its own
   * plane reads as a hard-edged artifact immediately. The height term is kept
   * modest so a tall, small-footprint object (a bottle) gets a contact pool at
   * its base rather than a disc that dwarfs it.
   */
  private static readonly DISC_FOOTPRINT_MARGIN = 1.4;
  private static readonly DISC_HEIGHT_STRETCH = 0.45;
  private static readonly DISC_MIN_HALF_EXTENT = 0.05;
  /**
   * The baked disc sits just above the floor (y=0) to avoid z-fighting, lifted
   * in proportion to the object's height and clamped: a fixed offset that is
   * invisible under a car would cover a visible slice of a 6cm avocado's base,
   * reading as the model sunk into a dark pool.
   */
  private static readonly FLOOR_LIFT_PER_HEIGHT = 0.0025;
  private static readonly FLOOR_LIFT_MIN = 0.0002;
  private static readonly FLOOR_LIFT_MAX = 0.01;
  /**
   * Main-thread time the adaptive bake is allowed to burn. The full-quality
   * pass count on a healthy GPU fits well inside it; a software rasterizer
   * or an integrated GPU under a heavy model drops toward MIN_PASSES instead
   * of freezing the page for seconds.
   */
  private static readonly BAKE_BUDGET_MS = 100;
  /** Below this the discrete sample silhouettes read as ghosting. */
  private static readonly MIN_PASSES = 24;
  private static readonly MAX_PASSES = 96;

  constructor(options?: { passes?: number }) {
    this.explicitPasses = options?.passes;
  }

  bake(context: ContactShadowBakeContext): void {
    const { renderer, scene, object, light } = context;

    // On a lost context every GL call is a silent no-op: the accumulation
    // would come back empty and replace the (working) live catcher with an
    // invisible disc. Leave the live catcher in charge instead.
    if (renderer.getContext().isContextLost()) {
      this.leaveLiveCatcherInCharge(scene);
      return;
    }

    const region = this.measureBakeRegion(object);
    if (!region) {
      return;
    }

    // A shadow only exists where there is floor to receive it: clip the
    // shadow disc to the tile coverage (the live catcher is sized to hug
    // it), otherwise a small floor under a tall model leaves the shadow's
    // tail hovering in mid-air past the last tile.
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

    // CircleGeometry's planar UVs span the full [-radius, radius] square —
    // exactly the bake camera's frustum — so the accumulated texture maps
    // onto the disc 1:1.
    const shadowDiscGeometry = new THREE.CircleGeometry(region.halfExtent, 64);
    this.accumulateShadowPasses(renderer, object, light, region, renderTarget, shadowDiscGeometry);

    // A context lost DURING the accumulation leaves the texture partial or
    // empty — installing it would swap a working live shadow for a broken
    // one. Abort and let the live catcher keep the scene grounded.
    if (renderer.getContext().isContextLost()) {
      renderTarget.dispose();
      shadowDiscGeometry.dispose();
      this.leaveLiveCatcherInCharge(scene);
      console.warn('Contact-shadow bake aborted: WebGL context was lost mid-bake');
      return;
    }
    this.installBakedMesh(scene, region, renderTarget, shadowDiscGeometry);
  }

  /**
   * The graceful-abort state: any previously baked disc is stale (wrong
   * model or wrong pose, and its render target goes blank-black once a lost
   * context is restored), so evict it and put the real-time catcher back in
   * charge rather than leaving the floor shadowless or double-shadowed.
   */
  private leaveLiveCatcherInCharge(scene: THREE.Scene): void {
    this.evictBakedMesh(scene);
    const liveCatcher = scene.getObjectByName(CONTACT_SHADOW_LIVE_NAME);
    if (liveCatcher) {
      liveCatcher.visible = true;
    }
  }

  private evictBakedMesh(scene: THREE.Scene): void {
    const existing = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME);
    if (existing) {
      scene.remove(existing);
      disposeObject3D(existing);
    }
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
    // Aim the stand-in where the real rig aims (the fitted rig re-targets
    // the model's center). Left at its default origin, every sample's light
    // direction would swing toward the world origin — for an off-origin
    // model the bake shadow camera misses the model entirely and the "baked
    // shadow" comes out as a fully transparent disc.
    bakeLight.target.position.copy(
      light.target.parent
        ? light.target.getWorldPosition(new THREE.Vector3())
        : light.target.position
    );

    const accumulationMaterial = new THREE.ShadowMaterial({
      transparent: true,
      // Set to 1/passCount once the count is known; 0 keeps the probe pass
      // contributing nothing to the additive accumulation.
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

  /**
   * How many passes fit the time budget on THIS device with THIS model:
   * times one probe pass (the same shadow-map render + accumulation draw the
   * real passes do, made inert by the material's zero opacity) and divides
   * the budget by it.
   *
   * The first render after a model load also pays one-time costs the real
   * passes never see again — vertex buffer uploads, shadow program links —
   * so an untimed warm-up pass runs first; timing it instead would punish
   * big models on fast GPUs with a low pass count for the wrong reason.
   *
   * render() only measures command submission, so a 1×1 readback forces the
   * GPU to actually finish each stage. Where the target's texel type is not
   * readable the readback is skipped and the timing degrades to submission
   * cost — the bake simply stays at full quality, the status quo, never
   * worse.
   */
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

  /** A 1×1 readback is the only reliable GPU sync fence WebGL offers. */
  private awaitGpuIdle(renderer: THREE.WebGLRenderer, renderTarget: THREE.WebGLRenderTarget): void {
    // readRenderTargetPixels does not throw on an unreadable type — it logs
    // a console error and returns without syncing — so ask first.
    if (!renderer.capabilities.textureTypeReadable(renderTarget.texture.type)) {
      return;
    }
    const readbackPixel =
      renderTarget.texture.type === THREE.HalfFloatType ? new Uint16Array(4) : new Uint8Array(4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, 1, 1, readbackPixel);
  }

  /**
   * A private stand-in light so the scene's real key light — position,
   * shadow map, radius — is never touched. Shadow frustum bounds are copied
   * from the real light, which fitShadowCameraToObject has already sized to
   * the object.
   */
  private createBakeLight(light: THREE.DirectionalLight): THREE.DirectionalLight {
    const bakeLight = new THREE.DirectionalLight(0xffffff, 1);
    bakeLight.castShadow = true;
    bakeLight.shadow.mapSize.set(
      ContactShadowBaker.BAKE_SHADOW_MAP_SIZE,
      ContactShadowBaker.BAKE_SHADOW_MAP_SIZE
    );
    // No depth bias: the accumulation receiver (the ShadowMaterial plane)
    // casts no shadow, so it is absent from the bake depth map and shadow
    // acne on it is impossible. Copying the live light's bias — specified in
    // NORMALIZED depth against its huge fixed 0.5..200 range — would instead
    // erase a constant ~2cm world-space band of shadow at every contact
    // (classic peter-panning): invisible under a car, but a third of a 6cm
    // avocado, whose entire contact pool vanished and left the shadow as a
    // detached blob.
    bakeLight.shadow.bias = 0;
    bakeLight.shadow.normalBias = 0;
    // A touch of per-pass PCF blur melts the individual sample silhouettes
    // into each other (they are otherwise recognizable on thin models even
    // at 1% opacity each); the averaging still provides the real softness,
    // so the contact core stays sharp.
    bakeLight.shadow.radius = 6;

    const sourceCamera = light.shadow.camera;
    const bakeCamera = bakeLight.shadow.camera;
    bakeCamera.left = sourceCamera.left;
    bakeCamera.right = sourceCamera.right;
    bakeCamera.top = sourceCamera.top;
    bakeCamera.bottom = sourceCamera.bottom;
    // near/far are NOT copied: fitBakeDepthRange brackets the object per
    // sample, keeping depth precision object-scaled at any model size.
    bakeCamera.updateProjectionMatrix();
    return bakeLight;
  }

  /**
   * Bracket the depth range tightly around the object for the CURRENT sample
   * position. The distance is the exact projection of the object's centre onto
   * the light's view axis (aperture-jittered samples sit off-axis, so a plain
   * centre distance would over-estimate and could clip the object). The padding
   * must cover BOTH every caster vertex (within `boundingRadius` of the centre)
   * AND every fragment of the receiver disc: the shadow lookup treats a
   * receiver whose depth falls past `far` as lit (`frustumTest`), so a tilted
   * key sample would otherwise truncate the shadow tail at the disc edge —
   * hence the extra `halfExtent` (the disc radius, an upper bound on a
   * receiver fragment's along-axis depth offset at any tilt).
   */
  private fitBakeDepthRange(bakeLight: THREE.DirectionalLight, region: BakeRegion): void {
    const viewDirection = bakeLight.target.position.clone().sub(bakeLight.position).normalize();
    const toCenter = region.center.clone().sub(bakeLight.position);
    const centerDepth = toCenter.dot(viewDirection);
    const padding = region.boundingRadius * 1.5 + region.halfExtent;

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
    // With the camera looking straight down, "screen up" must map to world -z
    // so the accumulated texture lands on the (x-rotated) display plane with
    // the same orientation it was rendered in.
    camera.up.set(0, 0, -1);
    camera.lookAt(region.center.x, 0, region.center.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }

  /**
   * Deterministic light sample sequence: golden-angle spirals cover the area
   * light's disc and the sky hemisphere evenly at any pass count, without the
   * clumping (visible as lumpy penumbra) that random sampling produces.
   */
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
    const maxElevationSin = 0.98;
    for (let i = 0; i < ambientPasses; i++) {
      // sqrt biases the sequence toward the zenith, like cosine-weighted sky
      // light: high samples pool darkness tightly around the contact points,
      // while the rare low ones are individually too faint to read as
      // separate ghost silhouettes.
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
    // Lift the accumulated shadow's mid-tones (gamma < 1): the partially
    // occluded ring around the contact points — the part that visually
    // grounds a thin upright model — sits in the mid-alphas, while the fully
    // shadowed core and the faint penumbra tails stay nearly unchanged.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.a = pow(diffuseColor.a, 0.75);'
      );
    };
    material.customProgramCacheKey = () => 'contact-shadow-alpha-gamma';
    // The render target owns GPU framebuffers beyond the texture itself, so
    // tie its lifetime to the material every disposal path already handles.
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
