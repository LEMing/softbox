import * as THREE from 'three';
import { HexTileConfig } from './HexTileConfig';

export interface HexTileMaterialOptions {
  metalness?: number;
  roughness?: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
}

class HexTile {
  position: THREE.Vector3;
  size: number;
  color: string;
  materialOptions: HexTileMaterialOptions;
  public readonly height: number;
  public readonly bevel: number;

  constructor(
    position: THREE.Vector3,
    size: number,
    color: string,
    materialOptions: HexTileMaterialOptions = {}
  ) {
    this.position = position;
    this.size = size;
    this.color = color;
    this.materialOptions = materialOptions;
    this.height = HexTileConfig.getHeight(this.size);
    this.bevel = HexTileConfig.getBevelSize(this.size);
  }

  /**
   * Tile geometry with its resting transform baked into the vertices:
   * laid flat on the floor plane, point-up hex orientation, translated to
   * the tile's grid position. Baking (instead of positioning a wrapper
   * object per tile) is what lets a whole floor of tiles merge into one
   * mesh — at real-world paver scale that is thousands of tiles.
   */
  createGeometry(): THREE.BufferGeometry {
    const hexShape = new THREE.Shape();
    // The bevel eats into the flat face; oversize the shape by the bevel so
    // the finished flat face keeps the configured edge length.
    const size = this.size + this.bevel;
    const angleStep = (Math.PI * 2) / 6;
    for (let i = 0; i < 6; i++) {
      const x = size * Math.cos(i * angleStep);
      const y = size * Math.sin(i * angleStep);
      if (i === 0) {
        hexShape.moveTo(x, y);
      } else {
        hexShape.lineTo(x, y);
      }
    }
    hexShape.closePath();

    const extrudeSettings = {
      depth: this.height,
      bevelEnabled: true,
      bevelSize: this.bevel,
      bevelThickness: this.bevel,
      bevelSegments: 2, // A crisp chamfer (like a real paver's arris), not a rounded soap-bar edge
    };

    const geometry = new THREE.ExtrudeGeometry(hexShape, extrudeSettings);
    // The old per-tile wrapper carried rotation (x: PI/2, z: PI/6); Euler
    // 'XYZ' applies Z first, so bake in the same order.
    geometry.rotateZ(Math.PI / 6);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(this.position.x, this.position.y, this.position.z);
    return geometry;
  }

  /**
   * Defaults reproduce the original glossy "liquid glass" look; passing
   * materialOptions (e.g. transmission: 0, roughness: 0.9) turns the same
   * hex tile into a matte finish like concrete.
   */
  createMaterial(): THREE.MeshPhysicalMaterial {
    const {
      metalness = 0,
      roughness = 0.15,
      transmission = 1.0,
      thickness = 0.4,
      ior = 1.5,
    } = this.materialOptions;
    const isGlassy = transmission > 0;

    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.color),
      metalness,
      roughness,
      transparent: isGlassy,
      transmission,
      thickness,
      ior,
      opacity: 1.0,
      clearcoat: isGlassy ? 1.0 : 0,
      clearcoatRoughness: 0.05,
      sheen: isGlassy ? 1.0 : 0,
      sheenColor: new THREE.Color(0xffffff),
      envMapIntensity: 1.0,
    });
  }
}

export default HexTile;
