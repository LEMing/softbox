import * as THREE from 'three';
import { ThreeAnimationService } from '../ThreeAnimationService';
import { IObject3D } from '../../../core/interfaces';
import { ErrorCode } from '../../../errors';

const makeAnimatedModel = () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = 'box';
  const spin = new THREE.AnimationClip('Spin', 1, [
    new THREE.NumberKeyframeTrack('box.position[x]', [0, 1], [0, 10]),
  ]);
  const bounce = new THREE.AnimationClip('Bounce', 1, [
    new THREE.NumberKeyframeTrack('box.position[y]', [0, 1], [0, 5]),
  ]);
  mesh.animations = [spin, bounce];
  return { mesh, adapter: { getThreeObject: () => mesh } as unknown as IObject3D };
};

describe('ThreeAnimationService', () => {
  it('reads clip names from the attached model root', () => {
    const service = new ThreeAnimationService();
    service.attach(makeAnimatedModel().adapter);

    expect(service.getClipNames()).toEqual(['Spin', 'Bounce']);
  });

  it('discovers clips below wrapper groups the root itself does not carry', () => {
    const { mesh } = makeAnimatedModel();
    const positioningGroup = new THREE.Group();
    positioningGroup.add(mesh);
    const service = new ThreeAnimationService();

    service.attach({ getThreeObject: () => positioningGroup } as unknown as IObject3D);
    service.play('Spin');
    service.update(0.5);

    expect(service.getClipNames()).toEqual(['Spin', 'Bounce']);
    expect(mesh.position.x).toBeCloseTo(5);
  });

  it('play() without a name advances ALL clips', () => {
    const { mesh, adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);

    service.play();
    service.update(0.5);

    expect(mesh.position.x).toBeCloseTo(5);
    expect(mesh.position.y).toBeCloseTo(2.5);
    expect(service.isPlaying()).toBe(true);
  });

  it('play(name) advances only that clip', () => {
    const { mesh, adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);

    const result = service.play('Bounce');
    service.update(0.5);

    expect(result.ok).toBe(true);
    expect(mesh.position.x).toBeCloseTo(0);
    expect(mesh.position.y).toBeCloseTo(2.5);
  });

  it('play(unknownName) errs and lists the clips the model carries', () => {
    const { adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);

    const result = service.play('Walk');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    expect(!result.ok && result.error.message).toMatch(/Spin, Bounce/);
    expect(service.isPlaying()).toBe(false);
  });

  it('play(name) with no clips attached errs INVALID_STATE, not a bad-name error', () => {
    const bare = new THREE.Object3D();
    const service = new ThreeAnimationService();
    service.attach({ getThreeObject: () => bare } as unknown as IObject3D);

    const result = service.play('Walk');

    // The name may be perfectly right for a model that has not loaded yet —
    // only a miss among EXISTING clips is an INVALID_PARAMETER.
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(!result.ok && result.error.message).toMatch(/no animation clips are attached/);
  });

  it('pause() freezes the pose and play() resumes without restarting', () => {
    const { mesh, adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);

    service.play('Spin');
    service.update(0.25);
    service.pause();
    service.update(0.25); // ignored while paused
    expect(mesh.position.x).toBeCloseTo(2.5);
    expect(service.isPlaying()).toBe(false);

    service.play();
    service.update(0.25);
    // Continues from the paused pose (2.5 -> 5), not restarted from t=0.
    expect(mesh.position.x).toBeCloseTo(5);
    expect(service.isPlaying()).toBe(true);
  });

  it('play(differentClip) after pause() switches instead of resuming the old clip', () => {
    const { mesh, adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);

    service.play('Spin');
    service.update(0.25);
    service.pause();

    service.play('Bounce');
    service.update(0.25);

    // Bounce started fresh from t=0, not from wherever Spin had paused.
    expect(mesh.position.y).toBeCloseTo(1.25);
    expect(service.isPlaying()).toBe(true);
  });

  it('setSpeed scales playback', () => {
    const { mesh, adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);
    service.setSpeed(2);

    service.play('Spin');
    service.update(0.25);

    expect(mesh.position.x).toBeCloseTo(5);
  });

  it('is inert for a bare play() on a model without clips', () => {
    const bare = new THREE.Object3D();
    const service = new ThreeAnimationService();
    service.attach({ getThreeObject: () => bare } as unknown as IObject3D);

    expect(service.play().ok).toBe(true);
    expect(service.getClipNames()).toEqual([]);
    expect(service.isPlaying()).toBe(false);
  });

  it('detach() stops playback and forgets the clips', () => {
    const { adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);
    service.play();

    service.detach();

    expect(service.isPlaying()).toBe(false);
    expect(service.getClipNames()).toEqual([]);
  });

  it('attach() replaces the previous model wholesale', () => {
    const first = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(first.adapter);
    service.play();

    const solo = new THREE.Object3D();
    solo.name = 'solo';
    solo.animations = [
      new THREE.AnimationClip('Solo', 1, [
        new THREE.NumberKeyframeTrack('solo.position[z]', [0, 1], [0, 1]),
      ]),
    ];
    service.attach({ getThreeObject: () => solo } as unknown as IObject3D);

    expect(service.getClipNames()).toEqual(['Solo']);
    expect(service.isPlaying()).toBe(false);
  });
});
