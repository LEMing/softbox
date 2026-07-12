import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

/**
 * WebGLPathTracer plus the two members the service actually reads that the
 * library leaves untyped. (Historical extras — renderTarget, camera,
 * environmentIntensity, pause — were dead weight the tracer never exposed.)
 */
export type ExtendedWebGLPathTracer = WebGLPathTracer & {
  tiles?: THREE.Vector2 & { set(x: number, y: number): void };
  copyQuad?: unknown;
}

/**
 * Alias kept for call-site clarity where a WebGLRenderer is used for path tracing.
 */
export type PathTracingWebGLRenderer = THREE.WebGLRenderer;

/**
 * Extended Three.js Scene with original environment texture
 */
export interface PathTracingScene extends THREE.Scene {
  __originalEnvironmentTexture?: THREE.Texture;
}
