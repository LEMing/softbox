import * as THREE from 'three';
import { HexTileConfig } from './HexTileConfig';

class HexTile {
  position: THREE.Vector3;
  size: number;
  color: string;
  public readonly height: number;
  public readonly bevel: number;

  constructor(position: THREE.Vector3, size: number, color: string) {
    this.position = position;
    this.size = size;
    this.color = color;
    // Use centralized configuration
    this.height = HexTileConfig.getHeight(this.size);
    this.bevel = HexTileConfig.getBevelSize(this.size);
  }

  createMesh(): THREE.Object3D {
    // Create a hexagonal shape
    const hexShape = new THREE.Shape();
    // The actual visible flat face will be smaller due to bevel
    // We want the final flat face to have edge = 1, so we need to compensate
    const size = this.size + this.bevel; // Add bevel to get desired final size
    const angleStep = (Math.PI * 2) / 6; // Six sides
    for (let i = 0; i < 6; i++) {
      const x = size * Math.cos(i * angleStep);
      const y = size * Math.sin(i * angleStep);
      if (i === 0) {
        hexShape.moveTo(x, y);
      } else {
        hexShape.lineTo(x, y);
      }
    }
    hexShape.closePath(); // Close the hexagon contour

    // Extrusion parameters to create tile volume
    const extrudeSettings = {
      depth: this.height, // Tile thickness
      bevelEnabled: true,   // Enable beveling (chamfer)
      bevelSize: this.bevel,       // Bevel size
      bevelThickness: this.bevel, // Bevel thickness
      bevelSegments: 128,     // Number of segments for smoothing the edge
    };

    // Create the extrusion
    const geometry = new THREE.ExtrudeGeometry(hexShape, extrudeSettings);

    // Create the tile material
    const liquidGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0,
      roughness: 0.15,
      transparent: true,
      transmission: 1.0,
      thickness: 0.4,
      ior: 1.5,
      opacity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      sheen: 1.0,
      sheenColor: new THREE.Color(0xffffff),
      envMapIntensity: 1.0, // Enable environment map reflections
    });

    // Create the hexagonal tile and its edge lines
    const hexMesh = new THREE.Mesh(geometry, liquidGlassMaterial);
    // const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
    hexMesh.receiveShadow = true;
    // Group to combine the tile and edges
    const group = new THREE.Group();
    group.add(hexMesh);
    // group.add(edgeLines);

    // Positioning the group in space
    group.position.set(this.position.x, this.position.y, this.position.z);
    group.rotation.x = Math.PI / 2; // Tile lies on the XY plane
    group.rotation.z = Math.PI / 6; // Tile is oriented at an angle for the hexagonal view

    return group;
  }
}

export default HexTile;
