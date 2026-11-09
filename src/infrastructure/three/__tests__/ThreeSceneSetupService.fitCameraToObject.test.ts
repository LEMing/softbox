import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { fitCameraToObject } from '../sceneSetup/cameraFit';
import { ErrorCode } from '../../../errors';

const makeControls = () => {
  const controls = {
    enabled: true,
    target: new THREE.Vector3(),
    update: jest.fn(),
    dispose: jest.fn()
  };
  return { controls, orbit: controls as unknown as OrbitControls };
};

describe('ThreeSceneSetupService.fitCameraToObject', () => {
  const service = new ThreeSceneSetupService();

  it('frames an off-origin object and retargets the controls at its center', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(10, 0, 5);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const { controls, orbit } = makeControls();

    const result = service.fitCameraToObject(mesh, camera, orbit);

    expect(result.ok).toBe(true);
    expect(controls.target.x).toBeCloseTo(10);
    expect(controls.target.y).toBeCloseTo(0);
    expect(controls.target.z).toBeCloseTo(5);
    expect(controls.update).toHaveBeenCalled();

    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(2);

    const viewDirection = camera.getWorldDirection(new THREE.Vector3());
    const towardCenter = controls.target.clone().sub(camera.position).normalize();
    expect(viewDirection.distanceTo(towardCenter)).toBeLessThan(1e-6);
  });

  it('accepts an orthographic camera via the default-FOV fallback', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const updateSpy = jest.spyOn(camera, 'updateProjectionMatrix');
    const { orbit } = makeControls();

    const result = fitCameraToObject(mesh, camera, orbit);

    expect(result.ok).toBe(true);
    expect(updateSpy).toHaveBeenCalled();
  });

  it('wraps a failure while retargeting the controls into a camera error', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const camera = new THREE.PerspectiveCamera();
    const { controls, orbit } = makeControls();
    controls.update.mockImplementation(() => {
      throw new Error('controls detached');
    });

    const result = service.fitCameraToObject(mesh, camera, orbit);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.CAMERA_INIT_FAILED);
    }
  });
});
