import * as THREE from 'three';

export class RoomEnvironment extends THREE.Scene {
  constructor(_renderer?: THREE.WebGLRenderer) {
    super();
  }

  dispose(): void {
  }
}