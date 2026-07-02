import * as THREE from 'three';
import { IScene, IColor, ITexture, IFog } from '../../core/interfaces/IScene';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { Result } from '../../utils/Result';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { disposeSceneContents } from './disposal';
import { ThreeViewerError, ErrorCode } from '../../errors';

/**
 * Adapter for Three.js Scene to implement IScene
 */
export class ThreeSceneAdapter implements IScene {
  private scene: THREE.Scene;

  constructor(scene?: THREE.Scene) {
    this.scene = scene || new THREE.Scene();
  }

  get id(): string {
    return this.scene.uuid;
  }

  get name(): string {
    return this.scene.name;
  }

  set name(value: string) {
    this.scene.name = value;
  }

  add(object: IObject3D): Result<void> {
    try {
      if (object instanceof ThreeObject3DAdapter) {
        this.scene.add(object.getThreeObject());
        return Result.ok(undefined);
      }
      return Result.err(
        new ThreeViewerError(
          'Object must be a ThreeObject3DAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to add object to scene',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  remove(object: IObject3D): Result<void> {
    try {
      if (object instanceof ThreeObject3DAdapter) {
        this.scene.remove(object.getThreeObject());
        return Result.ok(undefined);
      }
      return Result.err(
        new ThreeViewerError(
          'Object must be a ThreeObject3DAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to remove object from scene',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  clear(): void {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
  }

  disposeContents(options?: { keepBackgrounds?: boolean }): void {
    disposeSceneContents(this.scene, options);
  }

  traverse(callback: (object: IObject3D) => void): void {
    this.scene.traverse((obj) => {
      callback(new ThreeObject3DAdapter(obj));
    });
  }

  get background(): IColor | ITexture | null {
    if (this.scene.background instanceof THREE.Color) {
      return new ThreeColorAdapter(this.scene.background);
    } else if (this.scene.background instanceof THREE.Texture) {
      return new ThreeTextureAdapter(this.scene.background);
    }
    return null;
  }

  set background(value: IColor | ITexture | null) {
    if (value instanceof ThreeColorAdapter) {
      this.scene.background = value.getThreeColor();
    } else if (value instanceof ThreeTextureAdapter) {
      this.scene.background = value.getThreeTexture();
    } else {
      this.scene.background = null;
    }
  }

  get fog(): IFog | null {
    if (this.scene.fog) {
      return new ThreeFogAdapter(this.scene.fog);
    }
    return null;
  }

  set fog(value: IFog | null) {
    if (value instanceof ThreeFogAdapter) {
      this.scene.fog = value.getThreeFog();
    } else {
      this.scene.fog = null;
    }
  }

  get environment(): ITexture | null {
    if (this.scene.environment) {
      return new ThreeTextureAdapter(this.scene.environment);
    }
    return null;
  }

  set environment(value: ITexture | null) {
    if (value instanceof ThreeTextureAdapter) {
      this.scene.environment = value.getThreeTexture();
    } else {
      this.scene.environment = null;
    }
  }

  setEnvironmentIntensity(intensity: number): void {
    this.scene.environmentIntensity = intensity;
  }

  /**
   * Get the internal Three.js scene
   * Implementation of IRendererExtension interface
   */
  getInternalRenderer(): THREE.Scene | null {
    return this.scene;
  }
  
  // Legacy method for backward compatibility
  getThreeScene(): THREE.Scene {
    return this.scene;
  }
}

// Helper adapter classes
class ThreeColorAdapter implements IColor {
  constructor(private color: THREE.Color) {}

  get r(): number {
    return this.color.r;
  }

  set r(value: number) {
    this.color.r = value;
  }

  get g(): number {
    return this.color.g;
  }

  set g(value: number) {
    this.color.g = value;
  }

  get b(): number {
    return this.color.b;
  }

  set b(value: number) {
    this.color.b = value;
  }

  setHex(hex: number): void {
    this.color.setHex(hex);
  }

  setRGB(r: number, g: number, b: number): void {
    this.color.setRGB(r, g, b);
  }

  getHex(): number {
    return this.color.getHex();
  }

  getThreeColor(): THREE.Color {
    return this.color;
  }
}

class ThreeTextureAdapter implements ITexture {
  constructor(private texture: THREE.Texture) {}

  get id(): string {
    return this.texture.uuid;
  }

  get image(): HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData | null {
    return (this.texture.image as HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData | null) || null;
  }

  get needsUpdate(): boolean {
    return this.texture.needsUpdate;
  }

  set needsUpdate(value: boolean) {
    this.texture.needsUpdate = value;
  }

  dispose(): void {
    this.texture.dispose();
  }

  getThreeTexture(): THREE.Texture {
    return this.texture;
  }
}

class ThreeFogAdapter implements IFog {
  constructor(private fog: THREE.Fog | THREE.FogExp2) {}

  get color(): IColor {
    return new ThreeColorAdapter(this.fog.color);
  }

  get near(): number {
    return (this.fog as THREE.Fog).near || 0;
  }

  get far(): number {
    return (this.fog as THREE.Fog).far || 1000;
  }

  getThreeFog(): THREE.Fog | THREE.FogExp2 {
    return this.fog;
  }
}