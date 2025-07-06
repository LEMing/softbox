import * as THREE from 'three';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { IScene } from '../../core/interfaces/IScene';
import { ICamera } from '../../core/interfaces/ICamera';
import { IPathTracingService } from '../../core/services/IPathTracingService';

/**
 * Extended IScene interface with Three.js specific methods
 */
export interface ExtendedScene extends IScene {
  getThreeScene(): THREE.Scene;
}

/**
 * Extended IObject3D interface with Three.js specific methods
 */
// Use intersection type to avoid conflicts
export type ExtendedObject3D = IObject3D & {
  getThreeObject?(): THREE.Object3D;
  // Three.js specific properties
  isMesh?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
}


/**
 * Extended ICamera interface with aspect ratio property
 */
export interface ExtendedCamera extends ICamera {
  aspect?: number;
}

/**
 * Extended path tracing service with disposal check
 */
export interface ExtendedPathTracingService extends IPathTracingService {
  isPathTracerDisposed(): boolean;
}

/**
 * ViewerCore instance with path tracing timer
 */
export interface ViewerCoreWithTimer {
  pathTracingStartTime?: number;
}

/**
 * Screenshot element with resize handler
 */
export interface ScreenshotElement extends HTMLImageElement {
  __resizeHandler?: () => void;
}

/**
 * THREE.js ShadowMap types enum
 */
export enum ThreeShadowMapType {
  BasicShadowMap = 0,
  PCFShadowMap = 1,
  PCFSoftShadowMap = 2,
  VSMShadowMap = 3
}

/**
 * THREE.js ToneMapping types enum
 */
export enum ThreeToneMappingType {
  NoToneMapping = 0,
  LinearToneMapping = 1,
  ReinhardToneMapping = 2,
  CineonToneMapping = 3,
  ACESFilmicToneMapping = 4
}

/**
 * Type guard for ExtendedScene
 */
export function hasGetThreeScene(scene: IScene): scene is ExtendedScene {
  return 'getThreeScene' in scene && typeof (scene as ExtendedScene).getThreeScene === 'function';
}

/**
 * Type guard for ExtendedObject3D
 */
export function hasGetThreeObject(obj: IObject3D): obj is ExtendedObject3D {
  return 'getThreeObject' in obj && typeof (obj as ExtendedObject3D).getThreeObject === 'function';
}

/**
 * Type guard for ExtendedPathTracingService
 */
export function hasIsPathTracerDisposed(service: IPathTracingService): service is ExtendedPathTracingService {
  return 'isPathTracerDisposed' in service && typeof (service as ExtendedPathTracingService).isPathTracerDisposed === 'function';
}