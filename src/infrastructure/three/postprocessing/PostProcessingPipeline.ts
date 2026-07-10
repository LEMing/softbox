import * as THREE from 'three';

/** Which opt-in post-processing effects are enabled. */
export interface PostProcessingConfig {
  bloom: boolean;
  vignette: boolean;
  filmGrain: boolean;
  /** Contrast + saturation grade amounts, or null when off. */
  colorGrade: { contrast: number; saturation: number } | null;
}

/** True when at least one effect is on (so a composer is worth building). */
export function anyPostEffectEnabled(config: PostProcessingConfig): boolean {
  return config.bloom || config.vignette || config.filmGrain || config.colorGrade !== null;
}

// Structural typing over the three/examples pass classes we lazy-load, so this
// module needs no compile-time dependency on them (they ship as a separate
// chunk that only opt-in consumers download).
interface Composer {
  addPass(pass: unknown): void;
  render(): void;
  setSize(width: number, height: number): void;
  setPixelRatio?(ratio: number): void;
  dispose?(): void;
  renderTarget1: THREE.WebGLRenderTarget;
  renderTarget2: THREE.WebGLRenderTarget;
}
interface RenderPass {
  scene: THREE.Scene;
  camera: THREE.Camera;
}
interface ShaderPassInstance {
  uniforms: Record<string, { value: unknown }>;
}
interface PostModules {
  EffectComposer: new (renderer: THREE.WebGLRenderer, target?: THREE.WebGLRenderTarget) => Composer;
  RenderPass: new (scene: THREE.Scene, camera: THREE.Camera) => RenderPass;
  OutputPass: new () => unknown;
  UnrealBloomPass?: new (resolution: THREE.Vector2, strength: number, radius: number, threshold: number) => unknown;
  ShaderPass?: new (shader: unknown) => ShaderPassInstance;
  VignetteShader?: unknown;
  BrightnessContrastShader?: unknown;
  HueSaturationShader?: unknown;
}

// A deterministic, per-pixel grain applied once in display space — NOT animated
// (a fixed photographic grain layer, not shimmering noise). The hash seeds off
// gl_FragCoord (the device-pixel coordinate), so the speckle is one pixel wide
// at any canvas resolution and needs no resolution uniform to track resizes.
const STATIC_GRAIN_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: 0.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;
    float hash( vec2 p ) {
      return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    }
    void main() {
      vec4 color = texture2D( tDiffuse, vUv );
      float grain = hash( floor( gl_FragCoord.xy ) ) - 0.5;
      gl_FragColor = vec4( color.rgb + grain * intensity, color.a );
    }
  `,
};

/**
 * A lazy, opt-in post-processing composer for the raster render path. The
 * three/examples pass classes are dynamic-imported on construction so a viewer
 * that uses no effects never downloads them, and the render loop falls back to
 * the plain renderer until the chunk has loaded.
 *
 * Pass order matters: bloom operates in the linear HDR working space BEFORE
 * tone mapping (OutputPass), while the vignette and film grain are display-space
 * touches applied AFTER it.
 */
export class PostProcessingPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly config: PostProcessingConfig;
  private modules: PostModules | null = null;
  private composer: Composer | null = null;
  private renderPass: RenderPass | null = null;
  private disposed = false;
  private loadFailed = false;

  constructor(renderer: THREE.WebGLRenderer, config: PostProcessingConfig) {
    this.renderer = renderer;
    this.config = config;
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      // The vignette, the static grain and the colour grade all run through
      // ShaderPass, so load it when any is on; each shader itself only when its
      // effect is on (grain uses the in-module STATIC_GRAIN_SHADER).
      const grade = this.config.colorGrade !== null;
      const needsShaderPass = this.config.vignette || this.config.filmGrain || grade;
      const [ec, rp, op, bloom, sp, vig, grade2] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/OutputPass.js'),
        this.config.bloom
          ? import('three/examples/jsm/postprocessing/UnrealBloomPass.js')
          : Promise.resolve(null),
        needsShaderPass
          ? import('three/examples/jsm/postprocessing/ShaderPass.js')
          : Promise.resolve(null),
        this.config.vignette
          ? import('three/examples/jsm/shaders/VignetteShader.js')
          : Promise.resolve(null),
        grade
          ? Promise.all([
              import('three/examples/jsm/shaders/BrightnessContrastShader.js'),
              import('three/examples/jsm/shaders/HueSaturationShader.js'),
            ])
          : Promise.resolve(null),
      ]);
      if (this.disposed) {
        return;
      }
      this.modules = {
        EffectComposer: ec.EffectComposer as PostModules['EffectComposer'],
        RenderPass: rp.RenderPass as PostModules['RenderPass'],
        OutputPass: op.OutputPass as PostModules['OutputPass'],
        UnrealBloomPass: bloom?.UnrealBloomPass as PostModules['UnrealBloomPass'],
        ShaderPass: sp?.ShaderPass as PostModules['ShaderPass'],
        VignetteShader: vig?.VignetteShader,
        BrightnessContrastShader: grade2?.[0].BrightnessContrastShader,
        HueSaturationShader: grade2?.[1].HueSaturationShader,
      };
    } catch (error) {
      this.loadFailed = true;
      console.warn('Failed to load post-processing effects; falling back to the plain renderer:', error);
    }
  }

  /** The chunk has loaded and the pipeline can render. */
  isReady(): boolean {
    return this.modules !== null && !this.disposed && !this.loadFailed;
  }

  /**
   * Render the scene through the composer. Returns false when the pipeline
   * isn't ready yet (the caller should fall back to a plain render).
   */
  render(scene: THREE.Scene, camera: THREE.Camera): boolean {
    const modules = this.modules;
    if (modules === null || this.disposed || this.loadFailed) {
      return false;
    }
    const composer = this.composer ?? this.build(modules, scene, camera);
    // Refresh the beauty pass with the live scene/camera every frame: this
    // viewer swaps the camera on auto-fit and can reload the model, so the
    // references captured when the composer was built go stale (RenderPass
    // would keep drawing an empty scene from the wrong camera).
    if (this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
    }
    composer.render();
    return true;
  }

  private build(modules: PostModules, scene: THREE.Scene, camera: THREE.Camera): Composer {
    const bufferSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());

    // Let EffectComposer own its render targets: it creates them HalfFloat with
    // the linear working color space the pass chain expects, so RenderPass
    // writes linear HDR and only OutputPass tone-maps + encodes to sRGB.
    // Passing a hand-built target here instead makes the renderer tone-map and
    // sRGB-encode into it, then OutputPass does it a SECOND time — every frame
    // washes out to near-white.
    const composer = new modules.EffectComposer(this.renderer);
    // MSAA on the composer's ping-pong targets: rendering into a composer
    // bypasses the WebGLRenderer's own antialias, so the beauty buffers carry
    // the samples instead (else the model's edges alias — a visible regression).
    const samples = Math.min(4, this.renderer.capabilities.maxSamples || 0);
    if (samples > 0) {
      composer.renderTarget1.samples = samples;
      composer.renderTarget2.samples = samples;
    }
    const renderPass = new modules.RenderPass(scene, camera);
    this.renderPass = renderPass;
    composer.addPass(renderPass as object);

    if (this.config.bloom && modules.UnrealBloomPass) {
      // Restrained: a HIGH threshold means only genuinely blown highlights
      // (headlights, hot speculars) seed the glow, so it reads as a studio touch
      // rather than a haze over the whole brightly-lit scene. The threshold was
      // raised (1.0 → 1.8) and strength lowered (0.18 → 0.12) once the brighter
      // three-point rig + contrastier studio env pushed far more of the specular
      // above 1.0 — the old values then bloomed broad hot patches. Params:
      // (resolution, strength, radius, threshold).
      composer.addPass(
        new modules.UnrealBloomPass(new THREE.Vector2(bufferSize.x, bufferSize.y), 0.12, 0.25, 1.8) as object
      );
    }

    // Tone mapping + sRGB: reads the renderer's operator/exposure, so the
    // composited frame matches the plain-render look. Everything above runs in
    // linear HDR; everything below is a display-space touch.
    composer.addPass(new modules.OutputPass() as object);

    // Colour grade in display space (after tone mapping): contrast then
    // saturation, via three's stock shaders — they keep the tone-mapping
    // operator's hue while adding punch, unlike swapping to a contrastier
    // operator (which would wash saturated highlights toward white).
    const grade = this.config.colorGrade;
    if (grade && modules.ShaderPass && modules.BrightnessContrastShader && modules.HueSaturationShader) {
      const contrastPass = new modules.ShaderPass(modules.BrightnessContrastShader);
      contrastPass.uniforms.contrast.value = grade.contrast;
      composer.addPass(contrastPass as object);
      const saturationPass = new modules.ShaderPass(modules.HueSaturationShader);
      saturationPass.uniforms.saturation.value = grade.saturation;
      composer.addPass(saturationPass as object);
    }

    if (this.config.vignette && modules.ShaderPass && modules.VignetteShader) {
      const vignette = new modules.ShaderPass(modules.VignetteShader);
      vignette.uniforms.offset.value = 1.15;
      vignette.uniforms.darkness.value = 1.05;
      composer.addPass(vignette as object);
    }

    if (this.config.filmGrain && modules.ShaderPass) {
      composer.addPass(new modules.ShaderPass(STATIC_GRAIN_SHADER) as object);
    }

    this.composer = composer;
    return composer;
  }

  setSize(width: number, height: number): void {
    this.composer?.setSize(width, height);
  }

  setPixelRatio(ratio: number): void {
    this.composer?.setPixelRatio?.(ratio);
  }

  dispose(): void {
    this.disposed = true;
    this.composer?.dispose?.();
    this.composer = null;
    this.renderPass = null;
    this.modules = null;
  }
}
