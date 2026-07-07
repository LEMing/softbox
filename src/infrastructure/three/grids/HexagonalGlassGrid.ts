import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import HexTile from '../HexTile';
import { HexTileConfig } from '../HexTileConfig';
import { CONTACT_SHADOW_HELPER_FLAG, CONTACT_SHADOW_LIVE_NAME } from '../ContactShadowBaker';

/**
 * Merge translated copies of one geometry into a single BufferGeometry —
 * the copies differ ONLY by offset, so this is plain attribute replication
 * (positions shifted per copy, normals/uvs repeated verbatim), no general
 * merge machinery needed.
 */
function mergeTranslatedCopies(
  canonical: THREE.BufferGeometry,
  offsets: THREE.Vector3[]
): THREE.BufferGeometry {
  const source = canonical.getIndex() ? canonical.toNonIndexed() : canonical;
  const sourcePositions = source.getAttribute('position').array as Float32Array;
  const sourceNormals = source.getAttribute('normal').array as Float32Array;
  const sourceUvs = source.getAttribute('uv')?.array as Float32Array | undefined;

  const positions = new Float32Array(sourcePositions.length * offsets.length);
  const normals = new Float32Array(sourceNormals.length * offsets.length);
  const uvs = sourceUvs ? new Float32Array(sourceUvs.length * offsets.length) : undefined;

  offsets.forEach((offset, copy) => {
    const base = copy * sourcePositions.length;
    positions.set(sourcePositions, base);
    for (let i = base; i < base + sourcePositions.length; i += 3) {
      positions[i] += offset.x;
      positions[i + 1] += offset.y;
      positions[i + 2] += offset.z;
    }
    normals.set(sourceNormals, copy * sourceNormals.length);
    if (uvs && sourceUvs) {
      uvs.set(sourceUvs, copy * sourceUvs.length);
    }
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvs) {
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  return merged;
}

export class HexagonalGlassGrid implements IGridStyle {
  name = 'Hexagonal Glass Grid';

  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();

    // `??`, not `||`: hexRadius 0 is a real request for a single tile (the
    // dynamic grid sends it for very small objects), not an absent option.
    const radius = options.styleOptions?.hexRadius ?? Math.floor(options.divisions / 2);
    const tileSize = options.styleOptions?.tileSize || 1;
    const color = String(options.color || '#ffffff');

    const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
    const width = gridSpacing.width;
    const height = gridSpacing.height;

    // The whole floor is ONE mesh: every tile is the template geometry at a
    // different offset, merged into a single draw call with one shared
    // material. At real-world paver scale (a fixed physical tile under a
    // large model) the floor runs to thousands of tiles — a mesh+geometry+
    // material per tile multiplied into thousands of draw calls and GPU
    // objects, dominating first paint. A merged mesh (rather than
    // InstancedMesh) also keeps the floor visible to the path tracer, whose
    // scene generator does not expand instances.
    const template = new HexTile(new THREE.Vector3(0, 0, 0), tileSize, color, {
      metalness: options.styleOptions?.metalness,
      roughness: options.styleOptions?.roughness,
      transmission: options.styleOptions?.transmission,
      thickness: options.styleOptions?.thickness,
      ior: options.styleOptions?.ior,
    });
    const canonicalTile = template.createGeometry();
    const y = HexTileConfig.getYPosition(tileSize);

    const tileOffsets: THREE.Vector3[] = [];
    for (let q = -radius; q <= radius; q++) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);

      for (let r = r1; r <= r2; r++) {
        tileOffsets.push(new THREE.Vector3(width * (q + r / 2), y, height * 0.75 * r));
      }
    }

    const floor = new THREE.Mesh(
      mergeTranslatedCopies(canonicalTile, tileOffsets),
      template.createMaterial()
    );
    floor.receiveShadow = true;
    group.add(floor);

    // Never uploaded to the GPU (only its arrays were copied), but keep the
    // teardown explicit to match the rest of the disposal discipline.
    canonicalTile.dispose();

    // A ShadowMaterial only ever shows its shadowed areas — everywhere else
    // it's fully transparent — so it reads as a clean contact shadow
    // regardless of how much the studio environment's ambient/IBL lighting
    // (which isn't blocked by the shadow map at all) washes out the shadow
    // that the tiles' own PBR shading would otherwise show. Add it just
    // above the tile tops (tile tops sit at y=0) so it isn't hidden beneath
    // the now-opaque tiles. It doubles as the real-time fallback while
    // animations play, when the baked contact shadow (see ContactShadowBaker)
    // would lag the moving model. Sized to hug the tiles' actual coverage: a
    // catcher reaching past the last tile shows shadow hovering in mid-air
    // next to the floor's edge. The baked contact shadow also clips itself
    // to this disc's radius for the same reason.
    group.add(this.createShadowCatcher(width * (radius + 0.5)));

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
    // Cleanup if needed
  }
}
