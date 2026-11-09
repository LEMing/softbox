import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import { PATH_TRACING_FLOOR_FLAG } from '../ContactShadowBaker';
import { createShadowCatcher } from './shadowCatcher';

export class ShadowFloorGrid implements IGridStyle {
  name = 'Shadow Floor';

  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    const radius = Math.max(options.size || 1, 1) * 1.5;
    group.add(createShadowCatcher(radius));
    group.add(this.createPathTracingDome(radius));
    return group;
  }

  private createPathTracingDome(footprint: number): THREE.Mesh {
    const size = Math.max(footprint, 1);
    const wallRadius = size * 1.6;
    const wallHeight = size * 2;
    const fillet = size * 0.5;
    const floorRadius = wallRadius - fillet;

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
        color: '#f0f0f0',
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

  dispose(): void {
  }
}
