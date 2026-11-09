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

  createGeometry(): THREE.BufferGeometry {
    const hexShape = new THREE.Shape();
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
      bevelSegments: 2,
    };

    const geometry = new THREE.ExtrudeGeometry(hexShape, extrudeSettings);
    geometry.rotateZ(Math.PI / 6);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(this.position.x, this.position.y, this.position.z);
    return geometry;
  }

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
