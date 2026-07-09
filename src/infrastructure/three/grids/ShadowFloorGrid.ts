import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import {
  CONTACT_SHADOW_HELPER_FLAG,
  CONTACT_SHADOW_LIVE_NAME,
  PATH_TRACING_FLOOR_FLAG,
} from '../ContactShadowBaker';

/**
 * A clean studio floor: no visible surface in the raster view, just an
 * invisible shadow-catching disc so the model reads as sitting on the
 * background with a soft contact shadow (the reference "product shot" look)
 * instead of on a patterned tile field. The disc is a `ShadowMaterial`, which
 * only ever shows its shadowed area and is fully transparent elsewhere; it
 * carries the same name/flag as the hex floor's catcher so the baked
 * ContactShadowBaker and the path tracer's helper-hiding treat it identically.
 *
 * `ShadowMaterial` is a raster shadow-map trick the path tracer can't use, so
 * the group also carries a real matte ground disc that is normally invisible
 * and only shown to the tracer during scene ingest (see PATH_TRACING_FLOOR_FLAG)
 * — that gives the traced render a physical surface to cast a contact shadow
 * onto, so the model is grounded there too instead of floating. Left neutral on
 * purpose: the tracer lights it with the scene environment, so it takes on each
 * preset's tone (dark under a dark studio, light under a bright one) by itself.
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
    group.add(this.createPathTracingFloor(radius));
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

  private createPathTracingFloor(discRadius: number): THREE.Mesh {
    // Much larger than the shadow disc so its edge never falls inside the
    // traced frame — it reads as a seamless studio sweep rather than a plate.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(discRadius, 1) * 8, 96),
      new THREE.MeshStandardMaterial({ color: '#b8b8b8', roughness: 1, metalness: 0 })
    );
    floor.userData[PATH_TRACING_FLOOR_FLAG] = true;
    floor.rotation.x = -Math.PI / 2;
    // A placeholder height; addDynamicGrid resets it to the catcher's
    // object-scaled lift so the floor-snapped model sits flush on it. (The
    // catcher and this floor are never visible to the same renderer at once —
    // the raster view hides this, the tracer hides the catcher — so they can
    // share a height without z-fighting.)
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    // Hidden from the raster view; the tracer flips it on only during ingest.
    floor.visible = false;
    return floor;
  }

  dispose(): void {
    // No retained resources.
  }
}
