import * as THREE from 'three';

export class WebGLPathTracer {
  generator: unknown = {};
  ptRenderer: unknown = {};
  renderer: THREE.WebGLRenderer = {} as THREE.WebGLRenderer;

  constructor() {
    this.generator = null;
    this.ptRenderer = {
      material: {
        materials: {
          updateFrom: jest.fn(),
        },
        setDefines: jest.fn(),
      },
      reset: jest.fn(),
      renderSample: jest.fn(),
      samples: 0,
      setScene: jest.fn(),
      setCamera: jest.fn(),
      updateCamera: jest.fn(),
    };
  }

  setScene(_scene: THREE.Scene, _camera: THREE.Camera, _options?: Record<string, unknown>): void {
    // Mock implementation
  }

  // Parity with the real surface the service calls (the API-drift canary in
  // threeGpuPathtracerContract.test.ts asserts the REAL package still has
  // these; the mock must not lag behind it).
  renderSample(): void {
    // Mock implementation
  }

  updateCamera(): void {
    // Mock implementation
  }

  updateLights(): void {
    // Mock implementation
  }

  reset(): void {
    // Mock implementation
  }

  dispose(): void {
    // Mock implementation
  }
}


export class PhysicalCamera {
  constructor(_fov: number, _aspect: number, _near: number, _far: number) {
    // Mock implementation
  }
}