import * as THREE from 'three';

/**
 * Jest mock for three's RoundedBoxGeometry addon (an ESM .js that ts-jest does
 * not transform). A plain box stands in for the rounded one: the corner fillets
 * are irrelevant to the logic under test (the cove trimming, which iterates the
 * position triangles and drops the ceiling/front), and a box exposes the same
 * position attribute and geometry methods.
 */
export class RoundedBoxGeometry extends THREE.BoxGeometry {
  constructor(width = 1, height = 1, depth = 1, _segments = 1, _radius = 0) {
    super(width, height, depth);
  }
}
