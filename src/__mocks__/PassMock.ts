import * as THREE from 'three';

/**
 * Jest mock for three's postprocessing Pass addon (an ESM .js that ts-jest does
 * not transform). FullScreenQuad's real job is to render a material to a
 * full-screen triangle; under test there is no GL context, so render() is a
 * no-op and only the material plumbing + disposal need to exist.
 */
export class Pass {}

export class FullScreenQuad {
  material: THREE.Material;
  constructor(material: THREE.Material) {
    this.material = material;
  }
  render(): void {
    // no-op: no GL context in jsdom
  }
  dispose(): void {
    // no-op
  }
}
