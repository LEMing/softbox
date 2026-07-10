import * as THREE from 'three';
import { applyStudioContrast } from '../studioEnvironmentContrast';

/** A stand-in for RoomEnvironment: a lit surround, a soft-box panel, a light. */
function makeRoomLike() {
  const scene = new THREE.Scene();

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.BackSide })
  );
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(),
    // RoomEnvironment marks its soft-boxes with a high emissiveIntensity.
    new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 50 })
  );
  const light = new THREE.PointLight(0xffffff, 900);

  scene.add(wall, panel, light);
  return { scene, wall, panel, light };
}

describe('applyStudioContrast', () => {
  it('darkens the reflected surround so highlights read against a deeper background', () => {
    const { scene, wall } = makeRoomLike();
    applyStudioContrast(scene);
    // White (1,1,1) surround multiplied down toward black.
    const color = (wall.material as THREE.MeshStandardMaterial).color;
    expect(color.r).toBeLessThan(1);
    expect(color.r).toBeCloseTo(0.42, 2);
    expect(color.g).toBeCloseTo(0.42, 2);
    expect(color.b).toBeCloseTo(0.42, 2);
  });

  it('leaves the emissive soft-box panels bright (concentrates them, not darkens)', () => {
    const { scene, panel } = makeRoomLike();
    const before = (panel.material as THREE.MeshLambertMaterial).emissiveIntensity;
    applyStudioContrast(scene);
    const after = (panel.material as THREE.MeshLambertMaterial).emissiveIntensity;
    expect(after).toBeGreaterThan(before);
    // Its black base colour is not treated as a surround (stays black).
    expect((panel.material as THREE.MeshLambertMaterial).color.getHex()).toBe(0x000000);
  });

  it('lowers the room fill light so unlit corners deepen', () => {
    const { scene, light } = makeRoomLike();
    applyStudioContrast(scene);
    expect(light.intensity).toBeCloseTo(900 * 0.7, 1);
  });

  it('skips non-mesh objects and meshes without a material without throwing', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Group());
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    (mesh as unknown as { material: unknown }).material = undefined;
    scene.add(mesh);
    expect(() => applyStudioContrast(scene)).not.toThrow();
  });

  it('handles meshes with an array of materials without throwing', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
      new THREE.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 20 }),
    ]);
    scene.add(mesh);
    expect(() => applyStudioContrast(scene)).not.toThrow();
    const [surround, panel] = mesh.material as THREE.Material[];
    expect((surround as THREE.MeshStandardMaterial).color.r).toBeCloseTo(0.42, 2);
    expect((panel as THREE.MeshLambertMaterial).emissiveIntensity).toBeGreaterThan(20);
  });
});
