import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import { CONTACT_SHADOW_HELPER_FLAG, CONTACT_SHADOW_LIVE_NAME } from '../ContactShadowBaker';

/**
 * A clean studio floor: no visible surface, just an invisible shadow-catching
 * disc so the model reads as sitting on the background with a soft contact
 * shadow (the reference "product shot" look) instead of on a patterned tile
 * field. The disc is a `ShadowMaterial`, which only ever shows its shadowed
 * area and is fully transparent elsewhere; it carries the same name/flag as the
 * hex floor's catcher so the baked ContactShadowBaker and the path tracer's
 * helper-hiding treat it identically.
 *
 * The real-scale hex-paver "ruler" floor is still available via
 * `helpers.grid.type: 'hexagonal_glass'`; this is simply the default.
 */
export class ShadowFloorGrid implements IGridStyle {
  name = 'Shadow Floor';

  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    // Generous radius so the shadow — which spreads outward with the object's
    // height under the steep key light — always lands on the catcher; the
    // baked contact shadow clips itself to this disc, so oversizing is safe.
    const radius = Math.max(options.size || 1, 1) * 1.5;
    group.add(this.createShadowCatcher(radius));
    return group;
  }

  private createShadowCatcher(discRadius: number): THREE.Mesh {
    const catcher = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(discRadius, 1), 64),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    catcher.name = CONTACT_SHADOW_LIVE_NAME;
    catcher.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    return catcher;
  }

  dispose(): void {
    // No retained resources.
  }
}
