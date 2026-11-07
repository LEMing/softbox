import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { ThreeObject3DAdapter } from '../ThreeObject3D';
import { ICamera } from '../../../core/interfaces/ICamera';
import { IControls } from '../../../core/interfaces/IControls';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { ErrorCode } from '../../../errors';

const asCamera = (camera: THREE.Camera): ICamera =>
  ({ getThreeCamera: () => camera } as unknown as ICamera);

const makeControls = () => {
  const controls = {
    enabled: true,
    target: new THREE.Vector3(),
    update: jest.fn(),
    dispose: jest.fn()
  };
  const adapter = { getThreeControls: () => controls } as unknown as IControls;
  return { controls, adapter };
};

describe('ThreeSceneSetupService.fitCameraToObject', () => {
  const service = new ThreeSceneSetupService();

  it('frames an off-origin object and retargets the controls at its center', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(10, 0, 5);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const { controls, adapter } = makeControls();

    const result = service.fitCameraToObject(
      new ThreeObject3DAdapter(mesh),
      asCamera(camera),
      adapter
    );

    expect(result.ok).toBe(true);
    expect(controls.target.x).toBeCloseTo(10);
    expect(controls.target.y).toBeCloseTo(0);
    expect(controls.target.z).toBeCloseTo(5);
    expect(controls.update).toHaveBeenCalled();

    // Elevated, padded vantage point: above the center and farther away
    // than the object's own size.
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(2);

    // The camera actually looks at the object's center.
    const viewDirection = camera.getWorldDirection(new THREE.Vector3());
    const towardCenter = controls.target.clone().sub(camera.position).normalize();
    expect(viewDirection.distanceTo(towardCenter)).toBeLessThan(1e-6);
  });

  it('accepts an orthographic camera via the default-FOV fallback', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const updateSpy = jest.spyOn(camera, 'updateProjectionMatrix');
    const { adapter } = makeControls();

    const result = service.fitCameraToObject(
      new ThreeObject3DAdapter(mesh),
      asCamera(camera),
      adapter
    );

    expect(result.ok).toBe(true);
    expect(updateSpy).toHaveBeenCalled();
  });

  it('fails loud when the object is not unwrappable', () => {
    const camera = new THREE.PerspectiveCamera();
    const { adapter } = makeControls();

    const result = service.fitCameraToObject(
      {} as unknown as IObject3D,
      asCamera(camera),
      adapter
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    }
  });

  it('fails loud when the camera is neither perspective nor orthographic', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const { adapter } = makeControls();

    const result = service.fitCameraToObject(
      new ThreeObject3DAdapter(mesh),
      {} as unknown as ICamera,
      adapter
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    }
  });

  it('fails loud when the controls are not unwrappable', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const camera = new THREE.PerspectiveCamera();

    const result = service.fitCameraToObject(
      new ThreeObject3DAdapter(mesh),
      asCamera(camera),
      {} as unknown as IControls
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    }
  });
});
