import { WebGLPathTracer } from 'three-gpu-pathtracer';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import {
  IPathTracingService,
  IPathTracingOptions,
  IPathTracingSettings,
  PathTracingPausedEvent
} from '../../core/services/IPathTracingService';
import type { ViewerRenderer } from '../../core/rendering/ViewerRenderer';
import { DEFAULT_PATH_TRACING_SAMPLES } from '../../core/constants';
import { Result } from '../../utils/Result';
import { smoothstep01 } from '../../utils/smoothstep';
import { ThreeViewerError, ErrorCode } from '../../errors';
import {
  ExtendedWebGLPathTracer,
  PathTracingWebGLRenderer,
  PathTracingScene
} from './types/PathTracerTypes';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { CONTACT_SHADOW_HELPER_FLAG, PATH_TRACING_FLOOR_FLAG } from './ContactShadowBaker';
import { provideCubeUvChunkForPathTracer } from './cubeUvChunkForPathTracer';

export class ThreePathTracingService implements IPathTracingService {
  private ingestSceneWithoutShadowHelpers(
    threeScene: THREE.Scene,
    threeCamera: THREE.Camera
  ): void {
    const hideForIngest: THREE.Object3D[] = [];
    const showForIngest: THREE.Object3D[] = [];
    threeScene.traverse((object) => {
      if (object.userData?.[CONTACT_SHADOW_HELPER_FLAG] && object.visible) {
        hideForIngest.push(object);
      } else if (object.userData?.[PATH_TRACING_FLOOR_FLAG] && !object.visible) {
        showForIngest.push(object);
      }
    });
    hideForIngest.forEach((object) => (object.visible = false));
    showForIngest.forEach((object) => (object.visible = true));
    try {
      this.pathTracer?.setScene(threeScene, threeCamera);
    } finally {
      hideForIngest.forEach((object) => (object.visible = true));
      showForIngest.forEach((object) => (object.visible = false));
    }
  }

  private convertToDataTexture(texture: THREE.Texture): THREE.DataTexture | null {
    if (!texture.image || !(texture.image instanceof HTMLImageElement)) {
      return null;
    }

    const image = texture.image as HTMLImageElement;

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    const data = new Float32Array(imageData.data.length);
    for (let i = 0; i < imageData.data.length; i++) {
      data[i] = imageData.data[i] / 255.0;
    }

    const dataTexture = new THREE.DataTexture(
      data,
      canvas.width,
      canvas.height,
      THREE.RGBAFormat,
      THREE.FloatType
    );

    dataTexture.mapping = texture.mapping;
    dataTexture.wrapS = texture.wrapS;
    dataTexture.wrapT = texture.wrapT;
    dataTexture.magFilter = texture.magFilter;
    dataTexture.minFilter = texture.minFilter;
    dataTexture.anisotropy = texture.anisotropy;
    dataTexture.needsUpdate = true;


    return dataTexture;
  }

  private getThreeRenderer(): PathTracingWebGLRenderer | null {
    return this.renderer?.getWebGLRenderer() ?? null;
  }

  private pathTracer: ExtendedWebGLPathTracer | null = null;
  private settings: IPathTracingSettings;
  private enabled: boolean = false;
  private renderer: ViewerRenderer | null = null;
  private sampleCount: number = 0;
  private createAttempts: number = 0;
  private maxCreateAttempts: number = 10;
  private sceneInitialized: boolean = false;
  private environmentWaitFrames: number = 0;
  private maxEnvironmentWaitFrames: number = 300;
  private disposed: boolean = false;
  private convertedEnvTexture: THREE.DataTexture | null = null;
  private convertedEnvSourceUuid: string | null = null;
  private resumable: boolean = false;
  private lastCameraMoveTime: number = -Infinity;
  private cameraDirty: boolean = false;
  public readonly events = new TypedEventEmitter<{ 'pathtracing:paused': PathTracingPausedEvent }>();

  private rasterFadeTarget: THREE.WebGLRenderTarget | null = null;
  private fadeQuad: FullScreenQuad | null = null;
  private fadeToneMapping: THREE.ToneMapping | null = null;
  private fadeSupported = true;

  private static readonly CAMERA_SETTLE_MS = 200;

  private static readonly FADE_SAMPLES = 256;

  private static readonly FADE_HOLD_SAMPLES = 4;

  private static readonly FADE_PREVIEW_OPACITY = 0.3;

  private static readonly FADE_RELEASE_FRACTION = 0.5;

  constructor() {
    this.settings = {
      samples: DEFAULT_PATH_TRACING_SAMPLES,
      bounces: 4,
      transmissiveBounces: 2,
      renderScale: 1,
      lowResScale: 0.5,
      dynamicLowRes: true,
      enablePathTracing: true,
    };
  }

  async initialize(options: IPathTracingOptions): Promise<Result<void>> {
    try {
      this.renderer = options.renderer;
      this.enabled = options.enabled;


      if (!this.isSupported()) {
        return Result.err(
          new ThreeViewerError(
            'Path tracing is not supported in this environment',
            ErrorCode.PATH_TRACING_INIT_FAILED,
            { reason: 'WebGL2 or required extensions not available' }
          )
        );
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to initialize path tracing',
          ErrorCode.PATH_TRACING_INIT_FAILED,
          { originalError: error }
        )
      );
    }
  }

  private createPathTracer(): Result<void> {
    if (this.disposed) {
      return Result.err(
        new ThreeViewerError(
          'Instance is disposed',
          ErrorCode.INVALID_STATE
        )
      );
    }

    try {
      const threeRenderer = this.getThreeRenderer();
      if (!threeRenderer) {
        return Result.err(
          new ThreeViewerError(
            'Renderer not ready, will retry',
            ErrorCode.RENDERER_NOT_INITIALIZED
          )
        );
      }

      provideCubeUvChunkForPathTracer();
      this.pathTracer = new WebGLPathTracer(threeRenderer) as ExtendedWebGLPathTracer;

      if (this.pathTracer.tiles && 'set' in this.pathTracer.tiles) {
        this.pathTracer.tiles.set(1, 1);
      }
      this.pathTracer.bounces = this.settings.bounces;

      if (this.settings.transmissiveBounces !== undefined) {
        this.pathTracer.transmissiveBounces = this.settings.transmissiveBounces;
      }

      this.pathTracer.renderScale = this.settings.renderScale;
      this.pathTracer.dynamicLowRes = this.settings.dynamicLowRes;
      this.pathTracer.lowResScale = this.settings.lowResScale;

      threeRenderer.setRenderTarget(null);

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to create path tracer',
          ErrorCode.PATH_TRACING_INIT_FAILED,
          { originalError: error }
        )
      );
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    if (!enabled) {
      this.resumable = false;
      this.reset();
      this.sceneInitialized = false;

      const threeRenderer = this.getThreeRenderer();
      if (threeRenderer) {
        threeRenderer.autoClear = true;
      }
    }
  }

  private disableAfterSelfPause(reason: PathTracingPausedEvent['reason']): void {
    this.enabled = false;
    this.resumable = reason === 'completed';
    this.events.emit('pathtracing:paused', { samples: this.sampleCount, reason });
  }

  updateSettings(settings: Partial<IPathTracingSettings>): void {
    this.settings = { ...this.settings, ...settings };

    if (settings.enablePathTracing !== undefined) {
      this.setEnabled(settings.enablePathTracing);
    }

    if (this.pathTracer) {
      if (settings.bounces !== undefined) {
        this.pathTracer.bounces = settings.bounces;
      }
      if (settings.transmissiveBounces !== undefined) {
        this.pathTracer.transmissiveBounces = settings.transmissiveBounces;
      }
      if (settings.renderScale !== undefined) {
        this.pathTracer.renderScale = settings.renderScale;
      }
      if (settings.lowResScale !== undefined) {
        this.pathTracer.lowResScale = settings.lowResScale;
      }
      if (settings.dynamicLowRes !== undefined) {
        this.pathTracer.dynamicLowRes = settings.dynamicLowRes;
      }
    }
  }

  async render(scene: THREE.Scene, camera: THREE.Camera): Promise<Result<void>> {
    if (this.disposed) {
      return Result.ok(undefined);
    }

    const renderer = this.renderer;
    if (!renderer) {
      return Result.ok(undefined);
    }

    if (!this.enabled) {
      return this.renderWhileDisabled(scene, camera);
    }

    if (!this.pathTracer) {
      const creationOutcome = this.ensurePathTracerCreated(renderer, scene, camera);
      if (creationOutcome) {
        return creationOutcome;
      }
    }

    try {
      if (!this.sceneInitialized) {
        const initOutcome = await this.initializeSceneForPathTracing(renderer, scene, camera);
        if (initOutcome) {
          return initOutcome;
        }
      }

      if (!this.sceneInitialized) {
        return renderer.render(scene, camera);
      }

      return this.accumulateSample(renderer, scene, camera);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to render with path tracing',
          ErrorCode.RENDER_FAILED,
          { originalError: error }
        )
      );
    }
  }

  private ensurePathTracerCreated(
    renderer: ViewerRenderer, scene: THREE.Scene, camera: THREE.Camera
  ): Result<void> | null {
    this.createAttempts++;
    const createResult = this.createPathTracer();
    if (createResult.ok) {
      this.createAttempts = 0;
      return null;
    }

    if (
      this.createAttempts < this.maxCreateAttempts &&
      createResult.error?.message === 'Renderer not ready, will retry'
    ) {
      return renderer.render(scene, camera);
    }

    this.disableAfterSelfPause('gave-up');
    this.createAttempts = 0;
    return renderer.render(scene, camera);
  }

  private async initializeSceneForPathTracing(
    renderer: ViewerRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): Promise<Result<void> | null> {
    try {
      const originalEnvTexture = (scene as PathTracingScene).__originalEnvironmentTexture;
      if (!scene.environment && !originalEnvTexture) {
        this.environmentWaitFrames++;
        if (this.environmentWaitFrames >= this.maxEnvironmentWaitFrames) {
          this.disableAfterSelfPause('gave-up');
          this.environmentWaitFrames = 0;
        }
        return renderer.render(scene, camera);
      }

      this.environmentWaitFrames = 0;

      if (originalEnvTexture && (originalEnvTexture as THREE.CubeTexture).isCubeTexture) {
        const currentEnv = scene.environment;
        scene.environment = originalEnvTexture;
        try {
          this.ingestSceneWithoutShadowHelpers(scene, camera);
          this.sceneInitialized = true;
        } finally {
          scene.environment = currentEnv;
        }
      } else if (originalEnvTexture && originalEnvTexture.mapping === THREE.EquirectangularReflectionMapping) {
        let textureForPathTracing: THREE.Texture = originalEnvTexture;
        if (originalEnvTexture.image instanceof HTMLImageElement) {
          if (this.convertedEnvTexture && this.convertedEnvSourceUuid === originalEnvTexture.uuid) {
            textureForPathTracing = this.convertedEnvTexture;
          } else {
            this.convertedEnvTexture?.dispose();
            this.convertedEnvTexture = null;
            this.convertedEnvSourceUuid = null;
            const dataTexture = this.convertToDataTexture(originalEnvTexture);
            if (!dataTexture) {
              throw new Error('Failed to convert environment texture to DataTexture');
            }
            this.convertedEnvTexture = dataTexture;
            this.convertedEnvSourceUuid = originalEnvTexture.uuid;
            textureForPathTracing = dataTexture;
          }
        }

        const currentEnv = scene.environment;
        scene.environment = textureForPathTracing;

        try {
          const texImage = originalEnvTexture.image as HTMLImageElement | (ImageData & { data?: unknown }) | null;
          if (texImage && !("data" in texImage && texImage.data)) {
            if (texImage instanceof HTMLImageElement && !texImage.complete) {
              await new Promise<void>((resolve) => {
                texImage.onload = () => {
                  originalEnvTexture.needsUpdate = true;
                  resolve();
                };
                texImage.onerror = () => {
                  resolve();
                };
                if (texImage.complete) {
                  resolve();
                }
              });
            }
          }

          this.ingestSceneWithoutShadowHelpers(scene, camera);
          this.sceneInitialized = true;

          scene.environment = currentEnv;
        } catch (setSceneError) {
          scene.environment = currentEnv;
          throw setSceneError;
        }
      } else if (scene.environment?.mapping === THREE.EquirectangularReflectionMapping) {
        this.ingestSceneWithoutShadowHelpers(scene, camera);
        this.sceneInitialized = true;
      } else {
        this.disableAfterSelfPause('gave-up');
        return renderer.render(scene, camera);
      }
    } catch (error) {
      console.warn('Scene initialization error:', error);
      return renderer.render(scene, camera);
    }

    return null;
  }

  private accumulateSample(renderer: ViewerRenderer, scene: THREE.Scene, camera: THREE.Camera): Result<void> {
    if (this.sampleCount === 0) {
      try {
        this.pathTracer?.updateLights();
      } catch (lightError) {
        console.warn('Failed to update lights for path tracing:', lightError);
      }
    }

    const standardRenderResult = renderer.render(scene, camera);
    if (!standardRenderResult.ok) {
      return standardRenderResult;
    }

    if (performance.now() - this.lastCameraMoveTime < ThreePathTracingService.CAMERA_SETTLE_MS) {
      return Result.ok(undefined);
    }

    if (this.cameraDirty) {
      this.cameraDirty = false;
      this.pathTracer?.updateCamera();
    }

    if (this.fadeSupported && this.sampleCount === 0) {
      this.runFadeStep(() => this.captureRasterFade(renderer, scene, camera));
    }

    this.accumulateOneSample();
    this.sampleCount++;

    if (this.fadeSupported && this.sampleCount < this.fadeWindowSamples()) {
      const rasterOpacity = 1 - this.pathTracedLayerOpacity(this.sampleCount);
      this.runFadeStep(() => this.renderRasterFade(rasterOpacity));
    }

    if (this.sampleCount === this.settings.samples) {
      return this.captureCompletedFrame();
    }

    return Result.ok(undefined);
  }

  private runFadeStep(step: () => void): void {
    try {
      step();
    } catch (fadeError) {
      console.warn('Path-tracing startup dissolve unavailable; showing samples directly:', fadeError);
      this.fadeSupported = false;
    }
  }

  private fadeWindowSamples(): number {
    const floor = ThreePathTracingService.FADE_HOLD_SAMPLES + 2;
    return Math.max(floor, Math.min(ThreePathTracingService.FADE_SAMPLES, this.settings.samples));
  }

  private pathTracedLayerOpacity(sampleCount: number): number {
    const hold = ThreePathTracingService.FADE_HOLD_SAMPLES;
    const full = this.fadeWindowSamples();
    const cap = ThreePathTracingService.FADE_PREVIEW_OPACITY;
    const release = hold + (full - hold) * ThreePathTracingService.FADE_RELEASE_FRACTION;
    if (sampleCount < release) {
      return cap * ThreePathTracingService.smoothstep(hold, release, sampleCount);
    }
    return cap + (1 - cap) * ThreePathTracingService.smoothstep(release, full, sampleCount);
  }

  private static smoothstep(edge0: number, edge1: number, x: number): number {
    return smoothstep01(Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))));
  }

  private captureRasterFade(renderer: ViewerRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const threeRenderer = this.getThreeRenderer();
    if (!threeRenderer) {
      return;
    }
    const size = threeRenderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rasterFadeTarget) {
      this.rasterFadeTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
      this.rasterFadeTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    } else if (this.rasterFadeTarget.width !== size.x || this.rasterFadeTarget.height !== size.y) {
      this.rasterFadeTarget.setSize(size.x, size.y);
    }
    const prevTarget = threeRenderer.getRenderTarget();
    threeRenderer.setRenderTarget(this.rasterFadeTarget);
    renderer.render(scene, camera);
    threeRenderer.setRenderTarget(prevTarget);
  }

  private renderRasterFade(opacity: number): void {
    const threeRenderer = this.getThreeRenderer();
    if (!threeRenderer || !this.rasterFadeTarget) {
      return;
    }
    if (!this.fadeQuad || this.fadeToneMapping !== threeRenderer.toneMapping) {
      (this.fadeQuad?.material as THREE.Material | undefined)?.dispose();
      this.fadeToneMapping = threeRenderer.toneMapping;
      this.fadeQuad = new FullScreenQuad(this.createFadeMaterial(threeRenderer.toneMapping));
    }
    const material = this.fadeQuad.material as THREE.ShaderMaterial;
    material.uniforms.tRaster.value = this.rasterFadeTarget.texture;
    material.uniforms.uOpacity.value = opacity;

    const prevAutoClear = threeRenderer.autoClear;
    const prevTarget = threeRenderer.getRenderTarget();
    threeRenderer.setRenderTarget(null);
    threeRenderer.autoClear = false;
    try {
      this.fadeQuad.render(threeRenderer);
    } finally {
      threeRenderer.autoClear = prevAutoClear;
      threeRenderer.setRenderTarget(prevTarget);
    }
  }

  private createFadeMaterial(toneMapping: THREE.ToneMapping): THREE.ShaderMaterial {
    const toneMappingDefine: Record<number, string> = {
      [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING',
      [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
      [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING',
      [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
      [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
      [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
    };
    const defines: Record<string, string> = {};
    const operator = toneMappingDefine[toneMapping];
    if (operator) {
      defines[operator] = '';
    }
    return new THREE.ShaderMaterial({
      defines,
      uniforms: {
        tRaster: { value: null },
        uOpacity: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
      `,
      fragmentShader: `
        uniform sampler2D tRaster;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D( tRaster, vUv ).rgb;
          #ifdef LINEAR_TONE_MAPPING
            color = LinearToneMapping( color );
          #elif defined( REINHARD_TONE_MAPPING )
            color = ReinhardToneMapping( color );
          #elif defined( CINEON_TONE_MAPPING )
            color = CineonToneMapping( color );
          #elif defined( ACES_FILMIC_TONE_MAPPING )
            color = ACESFilmicToneMapping( color );
          #elif defined( AGX_TONE_MAPPING )
            color = AgXToneMapping( color );
          #elif defined( NEUTRAL_TONE_MAPPING )
            color = NeutralToneMapping( color );
          #endif
          gl_FragColor = vec4( sRGBTransferOETF( vec4( color, 1.0 ) ).rgb, uOpacity );
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }

  private renderWhileDisabled(scene: THREE.Scene, camera: THREE.Camera): Result<void> {
    if (!this.renderer) {
      return Result.ok(undefined);
    }

    const completed = this.sampleCount >= this.settings.samples && this.sampleCount > 0;
    if (completed) {
      const presentRenderer = this.getThreeRenderer();
      if (this.pathTracer && presentRenderer) {
        const threeRenderer = presentRenderer;
        threeRenderer.setRenderTarget(null);
      }
      return Result.ok(undefined);
    }

    return this.renderer.render(scene, camera);
  }

  private accumulateOneSample(): void {
    const threeRenderer = this.getThreeRenderer();
    if (!threeRenderer) {
      throw new Error('Three.js renderer not available');
    }

    const originalAutoClear = threeRenderer.autoClear;
    const originalRenderTarget = threeRenderer.getRenderTarget();

    threeRenderer.autoClear = false;
    if (this.pathTracer) {
      this.pathTracer.renderSample();
    }
    threeRenderer.autoClear = originalAutoClear;
    threeRenderer.setRenderTarget(originalRenderTarget);
  }

  private captureCompletedFrame(): Result<void> {
    const threeRenderer = this.getThreeRenderer();
    if (threeRenderer && this.pathTracer) {
      try {
        const originalAutoClear = threeRenderer.autoClear;
        threeRenderer.autoClear = true;
        threeRenderer.setRenderTarget(null);
        threeRenderer.clear(true, true, true);

        const copyQuad = this.pathTracer.copyQuad as { render: (renderer: THREE.WebGLRenderer) => void } | undefined;
        if (copyQuad && typeof copyQuad.render === 'function') {
          copyQuad.render(threeRenderer);
        } else {
          threeRenderer.autoClear = false;
          this.pathTracer.renderSample();
        }

        threeRenderer.autoClear = originalAutoClear;
      } catch (error) {
        console.warn('Failed to present path traced result:', error);
      }
    }

    this.disableAfterSelfPause('completed');

    return Result.ok(undefined);
  }

  getSampleCount(): number {
    return this.sampleCount;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isPathTracerDisposed(): boolean {
    return this.disposed;
  }

  canResume(): boolean {
    return this.resumable && this.pathTracer !== null && !this.disposed;
  }

  reset(force = false): void {
    this.sampleCount = 0;
    if (!this.pathTracer) {
      return;
    }
    if (force) {
      this.pathTracer.reset();
      this.sceneInitialized = false;
      return;
    }
    this.lastCameraMoveTime = performance.now();
    this.cameraDirty = true;
    this.pathTracer.reset();
  }

  dispose(): void {
    this.disposed = true;
    this.events.removeAllListeners();

    if (this.pathTracer) {
      try {
        this.pathTracer.dispose();
      } catch (error) {
        console.warn('Failed to dispose path tracer during service disposal:', error);
      }
      this.pathTracer = null;
    }

    if (this.convertedEnvTexture) {
      this.convertedEnvTexture.dispose();
      this.convertedEnvTexture = null;
      this.convertedEnvSourceUuid = null;
    }

    if (this.fadeQuad) {
      (this.fadeQuad.material as THREE.Material).dispose();
      this.fadeQuad = null;
    }
    this.fadeToneMapping = null;
    if (this.rasterFadeTarget) {
      this.rasterFadeTarget.dispose();
      this.rasterFadeTarget = null;
    }

    this.sampleCount = 0;
    this.sceneInitialized = false;
    this.createAttempts = 0;
    this.renderer = null;
  }

  isSupported(): boolean {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  }
}
