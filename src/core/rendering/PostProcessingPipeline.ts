import * as THREE from 'three';

export interface PostProcessingConfig {
  bloom: boolean;
  vignette: boolean;
  filmGrain: boolean;
  colorGrade: { contrast: number; saturation: number } | null;
}

export function anyPostEffectEnabled(config: PostProcessingConfig): boolean {
  return config.bloom || config.vignette || config.filmGrain || config.colorGrade !== null;
}

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

const BLOOM_STRENGTH = 0.08;
const BLOOM_RADIUS = 0.25;
const BLOOM_THRESHOLD = 2.5;
const VIGNETTE_OFFSET = 1.15;
const VIGNETTE_DARKNESS = 1.05;
const GRAIN_INTENSITY = 0.05;

const STATIC_GRAIN_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: GRAIN_INTENSITY },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
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

export class PostProcessingPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly config: PostProcessingConfig;
  private modules: PostModules | null = null;
  private composer: Composer | null = null;
  private renderPass: RenderPass | null = null;
  private passes: Array<{ dispose?: () => void }> = [];
  private disposed = false;
  private loadFailed = false;
  private readonly onLoadError?: (error: unknown) => void;

  constructor(
    renderer: THREE.WebGLRenderer,
    config: PostProcessingConfig,
    onLoadError?: (error: unknown) => void
  ) {
    this.renderer = renderer;
    this.config = config;
    this.onLoadError = onLoadError;
    void this.load();
  }

  private async load(): Promise<void> {
    try {
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
      if (!this.disposed) {
        this.onLoadError?.(error);
      }
      console.warn('Failed to load post-processing effects; falling back to the plain renderer:', error);
    }
  }

  isReady(): boolean {
    return this.modules !== null && !this.disposed && !this.loadFailed;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): boolean {
    const modules = this.modules;
    if (modules === null || this.disposed || this.loadFailed) {
      return false;
    }
    const composer = this.composer ?? this.build(modules, scene, camera);
    if (this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
    }
    composer.render();
    return true;
  }

  private build(modules: PostModules, scene: THREE.Scene, camera: THREE.Camera): Composer {
    const bufferSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());

    const composer = new modules.EffectComposer(this.renderer);
    const samples = Math.min(4, this.renderer.capabilities.maxSamples || 0);
    if (samples > 0) {
      composer.renderTarget1.samples = samples;
      composer.renderTarget2.samples = samples;
    }
    const renderPass = new modules.RenderPass(scene, camera);
    this.renderPass = renderPass;
    this.addPass(composer, renderPass);

    if (this.config.bloom && modules.UnrealBloomPass) {
      this.addPass(
        composer,
        new modules.UnrealBloomPass(
          new THREE.Vector2(bufferSize.x, bufferSize.y),
          BLOOM_STRENGTH,
          BLOOM_RADIUS,
          BLOOM_THRESHOLD
        )
      );
    }

    this.addPass(composer, new modules.OutputPass());

    const grade = this.config.colorGrade;
    if (grade && modules.ShaderPass && modules.BrightnessContrastShader && modules.HueSaturationShader) {
      const contrastPass = new modules.ShaderPass(modules.BrightnessContrastShader);
      contrastPass.uniforms.contrast.value = grade.contrast;
      this.addPass(composer, contrastPass);
      const saturationPass = new modules.ShaderPass(modules.HueSaturationShader);
      saturationPass.uniforms.saturation.value = grade.saturation;
      this.addPass(composer, saturationPass);
    }

    if (this.config.vignette && modules.ShaderPass && modules.VignetteShader) {
      const vignette = new modules.ShaderPass(modules.VignetteShader);
      vignette.uniforms.offset.value = VIGNETTE_OFFSET;
      vignette.uniforms.darkness.value = VIGNETTE_DARKNESS;
      this.addPass(composer, vignette);
    }

    if (this.config.filmGrain && modules.ShaderPass) {
      this.addPass(composer, new modules.ShaderPass(STATIC_GRAIN_SHADER));
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

  private addPass(composer: Composer, pass: unknown): void {
    this.passes.push(pass as { dispose?: () => void });
    composer.addPass(pass);
  }

  dispose(): void {
    this.disposed = true;
    for (const pass of this.passes) {
      pass.dispose?.();
    }
    this.passes = [];
    this.composer?.dispose?.();
    this.composer = null;
    this.renderPass = null;
    this.modules = null;
  }
}
