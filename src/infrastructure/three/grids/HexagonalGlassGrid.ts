import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import HexTile from '../HexTile';
import { HexTileConfig } from '../HexTileConfig';
import { createShadowCatcher } from './shadowCatcher';

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

    const radius = options.styleOptions?.hexRadius ?? Math.floor(options.divisions / 2);
    const tileSize = options.styleOptions?.tileSize || 1;
    const color = String(options.color || '#ffffff');

    const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
    const width = gridSpacing.width;
    const height = gridSpacing.height;

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

    canonicalTile.dispose();

    group.add(createShadowCatcher(width * (radius + 0.5), 0.35));

    return group;
  }

  dispose(): void {
  }
}
