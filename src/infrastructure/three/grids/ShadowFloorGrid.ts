import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
 * the group also carries a real matte 3-sided cyclorama (see
 * PATH_TRACING_FLOOR_FLAG) that is normally invisible and only shown to the
 * tracer during scene ingest — that gives the traced render a physical surface
 * to cast a contact shadow onto and a seamless soft-lit backdrop, so the model
 * is grounded and wrapped instead of floating. Left neutral on purpose: the
 * tracer lights it with the scene environment, so it takes on each preset's
 * tone (dark under a dark studio, light under a bright one) by itself.
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
    group.add(this.createPathTracingCyclorama(radius));
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

  /**
   * A 3-sided studio cyclorama for the path tracer: a rounded box with the
   * ceiling and the front (camera side) trimmed away, so the floor sweeps up
   * into a back wall and two side walls through big fillets — no visible seam —
   * while the open top and front let the studio environment and key light in.
   * The model sits in a seamless soft-lit "infinity cove" with a real contact
   * shadow, instead of on a bare plate. Like the flat floor it replaced it is
   * hidden from the raster view and shown to the tracer only during ingest.
   */
  private createPathTracingCyclorama(footprint: number): THREE.Mesh {
    const size = Math.max(footprint, 1);
    const half = size * 0.85; // half-width/depth of the cove floor
    const height = size * 1.4; // wall height before the ceiling is trimmed
    const fillet = size * 0.6; // radius of the floor→wall / wall→wall sweep

    // RoundedBoxGeometry is non-indexed, so the per-triangle trim reads its
    // position attribute directly (no toNonIndexed, which would just warn).
    const box = new RoundedBoxGeometry(half * 2, height, half * 2, 10, fillet);
    const cove = this.openTopAndFront(box, height / 2 - fillet, half - fillet);
    // Sink the geometry so the cove floor sits at the mesh's local origin;
    // addDynamicGrid then lifts the mesh to the catcher height so a floor-
    // snapped model rests flush on the sweep.
    cove.translate(0, height / 2, 0);
    cove.computeVertexNormals();

    const mesh = new THREE.Mesh(
      cove,
      new THREE.MeshStandardMaterial({
        color: '#b8b8b8',
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      })
    );
    mesh.userData[PATH_TRACING_FLOOR_FLAG] = true;
    mesh.position.y = 0.001;
    mesh.receiveShadow = true;
    mesh.visible = false;
    return mesh;
  }

  /** Drop every triangle in the ceiling (y above `yCut`) or the front wall
   * (z beyond `zCut`), leaving an open-topped, camera-facing cove. */
  private openTopAndFront(
    geometry: THREE.BufferGeometry,
    yCut: number,
    zCut: number
  ): THREE.BufferGeometry {
    const position = geometry.getAttribute('position');
    const kept: number[] = [];
    for (let i = 0; i < position.count; i += 3) {
      const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
      const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
      if (cy > yCut || cz > zCut) {
        continue;
      }
      for (let v = 0; v < 3; v += 1) {
        kept.push(position.getX(i + v), position.getY(i + v), position.getZ(i + v));
      }
    }
    geometry.dispose();
    const trimmed = new THREE.BufferGeometry();
    trimmed.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    return trimmed;
  }

  dispose(): void {
    // No retained resources.
  }
}
