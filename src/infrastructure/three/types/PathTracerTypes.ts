import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

/**
 * Extended WebGLPathTracer interface with additional properties
 * that are used but not typed in the library
 */
// We need to use intersection types instead of extending
export type ExtendedWebGLPathTracer = WebGLPathTracer & {
  renderTarget?: THREE.WebGLRenderTarget;
  tiles?: THREE.Vector2 & { set(x: number, y: number): void };
  camera?: THREE.Camera;
  copyQuad?: unknown;
  environmentIntensity?: number;
  pause?: () => void;
}

/**
 * Extended WebGLRenderer interface with path tracing flag
 */
export interface PathTracingWebGLRenderer extends THREE.WebGLRenderer {
  __pathTracingActive?: boolean;
}

/**
 * Extended Three.js Scene with original environment texture
 */
export interface PathTracingScene extends THREE.Scene {
  __originalEnvironmentTexture?: THREE.Texture;
}

/**
 * Type guard to check if renderer has getInternalRenderer method
 */
export function hasGetInternalRenderer(renderer: unknown): renderer is { getInternalRenderer(): THREE.WebGLRenderer } {
  return renderer !== null && 
         typeof renderer === 'object' && 
         'getInternalRenderer' in renderer &&
         typeof (renderer as { getInternalRenderer?: unknown }).getInternalRenderer === 'function';
}