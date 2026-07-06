import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import HexTile from '../HexTile';
import { HexTileConfig } from '../HexTileConfig';
import { CONTACT_SHADOW_LIVE_NAME } from '../ContactShadowBaker';

export class HexagonalGlassGrid implements IGridStyle {
  name = 'Hexagonal Glass Grid';

  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();

    const radius = options.styleOptions?.hexRadius || Math.floor(options.divisions / 2);
    const tileSize = options.styleOptions?.tileSize || 1;
    const color = String(options.color || '#ffffff');

    // Use centralized configuration for all calculations
    const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
    const width = gridSpacing.width;
    const height = gridSpacing.height;

    for (let q = -radius; q <= radius; q++) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);

      for (let r = r1; r <= r2; r++) {
        const x = width * (q + r / 2);
        const z = height * 0.75 * r;
        const y = HexTileConfig.getYPosition(tileSize);

        const tile = new HexTile(new THREE.Vector3(x, y, z), tileSize, color, {
          metalness: options.styleOptions?.metalness,
          roughness: options.styleOptions?.roughness,
          transmission: options.styleOptions?.transmission,
          thickness: options.styleOptions?.thickness,
          ior: options.styleOptions?.ior,
        });
        const mesh = tile.createMesh();
        group.add(mesh);
      }
    }

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
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    return catcher;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
