import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { ThreeAnimationService } from '../ThreeAnimationService';
import { UNITS_SCALE_WRAPPER_NAME } from '../../../core/constants';

describe('ThreeSceneSetupService.wrapInUnitsScaleGroup', () => {
  const service = new ThreeSceneSetupService();

  it('wraps the object in a named group scaled to meters', () => {
    const object = new THREE.Object3D();
    const result = service.wrapInUnitsScaleGroup(object, 0.0254);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wrapper = result.value;
    expect(wrapper.name).toBe(UNITS_SCALE_WRAPPER_NAME);
    expect(wrapper.scale.x).toBeCloseTo(0.0254);
    expect(wrapper.scale.y).toBeCloseTo(0.0254);
    expect(wrapper.scale.z).toBeCloseTo(0.0254);
    expect(wrapper.children).toEqual([object]);
  });

  it('leaves the wrapped object own transform untouched (corrective root scales survive)', () => {
    const object = new THREE.Object3D();
    object.scale.setScalar(0.5);

    const result = service.wrapInUnitsScaleGroup(object, 0.3048);

    expect(result.ok).toBe(true);
    expect(object.scale.x).toBeCloseTo(0.5);
  });

  it('keeps clips discoverable by the animation service attached to the wrapper', () => {
    const object = new THREE.Object3D();
    object.animations = [new THREE.AnimationClip('Run', 1, [])];

    const result = service.wrapInUnitsScaleGroup(object, 0.3048);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const animationService = new ThreeAnimationService();
    animationService.attach(result.value);
    expect(animationService.getClipNames()).toEqual(['Run']);
  });

  it('binds root-relative tracks to the clip-bearing model, never to the wrapper', () => {
    const object = new THREE.Object3D();
    const scaleTrack = new THREE.VectorKeyframeTrack('.scale', [0, 1], [2, 2, 2, 2, 2, 2]);
    object.animations = [new THREE.AnimationClip('Grow', 1, [scaleTrack])];

    const result = service.wrapInUnitsScaleGroup(object, 0.0254);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wrapper = result.value;

    const animationService = new ThreeAnimationService();
    animationService.attach(result.value);
    animationService.play();
    animationService.update(0.5);

    expect(object.scale.x).toBeCloseTo(2);
    expect(wrapper.scale.x).toBeCloseTo(0.0254);
  });

  it('does not compound when the same object is wrapped again after a rebuild', () => {
    const object = new THREE.Object3D();
    const first = service.wrapInUnitsScaleGroup(object, 0.0254);
    expect(first.ok).toBe(true);

    const second = service.wrapInUnitsScaleGroup(object, 0.0254);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const wrapper = second.value;
    expect(wrapper.children).toEqual([object]);
    const worldScale = new THREE.Vector3();
    wrapper.updateMatrixWorld(true);
    object.getWorldScale(worldScale);
    expect(worldScale.x).toBeCloseTo(0.0254);
  });
});
