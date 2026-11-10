import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export type ExtendedWebGLPathTracer = WebGLPathTracer & {
  tiles?: THREE.Vector2 & { set(x: number, y: number): void };
  copyQuad?: unknown;
}

export type PathTracingWebGLRenderer = THREE.WebGLRenderer;

export interface PathTracingScene extends THREE.Scene {
  __originalEnvironmentTexture?: THREE.Texture;
}
