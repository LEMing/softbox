import * as THREE from 'three';

export class Pass {}

export class FullScreenQuad {
  material: THREE.Material;
  constructor(material: THREE.Material) {
    this.material = material;
  }
  render(): void {
  }
  dispose(): void {
  }
}
