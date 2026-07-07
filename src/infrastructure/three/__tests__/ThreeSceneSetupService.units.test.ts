import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { ThreeAnimationService } from '../ThreeAnimationService';
import { ThreeObject3DAdapter } from '../ThreeObject3D';
import { UNITS_SCALE_WRAPPER_NAME } from '../../../core/constants';

describe('ThreeSceneSetupService.wrapInUnitsScaleGroup', () => {
  const service = new ThreeSceneSetupService();

  it('wraps the object in a named group scaled to meters', () => {
    const object = new THREE.Object3D();
    const result = service.wrapInUnitsScaleGroup(new ThreeObject3DAdapter(object), 0.0254);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wrapper = (result.value as ThreeObject3DAdapter).getThreeObject();
    expect(wrapper.name).toBe(UNITS_SCALE_WRAPPER_NAME);
    expect(wrapper.scale.x).toBeCloseTo(0.0254);
    expect(wrapper.scale.y).toBeCloseTo(0.0254);
    expect(wrapper.scale.z).toBeCloseTo(0.0254);
    expect(wrapper.children).toEqual([object]);
  });

  it('leaves the wrapped object own transform untouched (corrective root scales survive)', () => {
    const object = new THREE.Object3D();
    object.scale.setScalar(0.5);

    const result = service.wrapInUnitsScaleGroup(new ThreeObject3DAdapter(object), 0.3048);

    expect(result.ok).toBe(true);
    expect(object.scale.x).toBeCloseTo(0.5);
  });

  it('carries the model animations onto the wrapper, which becomes the new root', () => {
    const object = new THREE.Object3D();
    const clip = new THREE.AnimationClip('Walk', 1, []);
    object.animations = [clip];

    const result = service.wrapInUnitsScaleGroup(new ThreeObject3DAdapter(object), 0.0254);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wrapper = (result.value as ThreeObject3DAdapter).getThreeObject();
    expect(wrapper.animations).toEqual([clip]);
  });

  it('keeps clips discoverable by the animation service attached to the wrapper', () => {
    const object = new THREE.Object3D();
    object.animations = [new THREE.AnimationClip('Run', 1, [])];

    const result = service.wrapInUnitsScaleGroup(new ThreeObject3DAdapter(object), 0.3048);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const animationService = new ThreeAnimationService();
    animationService.attach(result.value);
    expect(animationService.getClipNames()).toEqual(['Run']);
  });

  it('does not compound when the same object is wrapped again after a rebuild', () => {
    const object = new THREE.Object3D();
    const first = service.wrapInUnitsScaleGroup(new ThreeObject3DAdapter(object), 0.0254);
    expect(first.ok).toBe(true);

    const second = service.wrapInUnitsScaleGroup(new ThreeObject3DAdapter(object), 0.0254);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const wrapper = (second.value as ThreeObject3DAdapter).getThreeObject();
    // THREE reparents on add(), so the object lives in exactly one wrapper and
    // the world scale stays a single conversion factor.
    expect(wrapper.children).toEqual([object]);
    const worldScale = new THREE.Vector3();
    wrapper.updateMatrixWorld(true);
    object.getWorldScale(worldScale);
    expect(worldScale.x).toBeCloseTo(0.0254);
  });
});
