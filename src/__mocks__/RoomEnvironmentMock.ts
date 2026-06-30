import * as THREE from 'three';

export class RoomEnvironment extends THREE.Scene {
  constructor(_renderer?: THREE.WebGLRenderer) {
    super();
    // Mock implementation
  }

  dispose(): void {
    // Real RoomEnvironment exposes dispose(); mirror it so callers don't throw.
  }
}