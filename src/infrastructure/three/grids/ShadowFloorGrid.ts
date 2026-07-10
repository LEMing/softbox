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
 * the group also carries a real matte studio "infinity dome" (see
 * PATH_TRACING_FLOOR_FLAG) that is normally invisible and only shown to the
 * tracer during scene ingest — that gives the traced render a physical surface
 * to cast a contact shadow onto and a seamless soft-lit backdrop, so the model
 * is grounded and wrapped instead of floating. It is a surface of revolution
 * (open at the top), so it looks identical from every azimuth — the reason it
 * replaced a 3-sided cove, which broke when the camera orbited to its open
 * side. Left neutral on purpose: the tracer lights it through the open top with
 * the scene environment, so it takes on each preset's tone by itself.
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
    group.add(this.createPathTracingDome(radius));
    return group;
  }

  private createShadowCatcher(discRadius: number): THREE.Mesh {
    const catcher = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(discRadius, 1), 64),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    catcher.name = CONTACT_SHADOW_LIVE_NAME;
    catcher.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    return catcher;
  }

  /**
   * A studio "infinity dome" for the path tracer: a surface of revolution about
   * the vertical axis — a flat floor that sweeps up through a big concave fillet
   * into a near-vertical wall, open at the top. Because it is axisymmetric it
   * looks identical from every azimuth, so free 360° orbit never reveals a seam
   * or an open side (the failing of the 3-sided cove it replaced). The open top
   * lets the studio environment light the interior; a sealed box would occlude
   * the tracer's infinite-env sampling and crush the inside to black. The model
   * sits in a seamless soft-lit cove with a real contact shadow. Hidden from the
   * raster view; shown to the tracer only during ingest.
   */
  private createPathTracingDome(footprint: number): THREE.Mesh {
    const size = Math.max(footprint, 1);
    const wallRadius = size * 1.6; // outer radius of the dome wall
    const wallHeight = size * 2; // how high the wall rises (open above it)
    const fillet = size * 0.5; // radius of the concave floor→wall sweep
    const floorRadius = wallRadius - fillet; // flat floor out to where the fillet starts

    // Lathe profile in (radius, height): flat floor → quarter-circle fillet →
    // vertical wall. Revolving it about Y gives the open-topped dome.
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(floorRadius, 0),
    ];
    const filletSegments = 16;
    for (let i = 1; i <= filletSegments; i += 1) {
      const a = (i / filletSegments) * (Math.PI / 2);
      profile.push(new THREE.Vector2(floorRadius + fillet * Math.sin(a), fillet * (1 - Math.cos(a))));
    }
    profile.push(new THREE.Vector2(wallRadius, wallHeight));

    const mesh = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 96),
      new THREE.MeshStandardMaterial({
        // Near-white seamless-paper matte (not the old muddy grey): the tracer
        // lights it, so its rendered tone still follows the scene environment.
        color: '#f0f0f0',
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      })
    );
    mesh.userData[PATH_TRACING_FLOOR_FLAG] = true;
    // Placeholder; addDynamicGrid lifts the mesh (its floor sits at local y=0)
    // to the catcher height so a floor-snapped model rests flush on the sweep.
    mesh.position.y = 0.001;
    mesh.receiveShadow = true;
    mesh.visible = false;
    return mesh;
  }

  dispose(): void {
    // No retained resources.
  }
}
