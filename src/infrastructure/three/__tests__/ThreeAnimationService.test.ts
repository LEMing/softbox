import * as THREE from 'three';
import { ThreeAnimationService } from '../ThreeAnimationService';
import { IObject3D } from '../../../core/interfaces';

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

    service.play('Bounce');
    service.update(0.5);

    expect(mesh.position.x).toBeCloseTo(0);
    expect(mesh.position.y).toBeCloseTo(2.5);
  });

  it('pause() freezes the pose and play() resumes', () => {
    const { mesh, adapter } = makeAnimatedModel();
    const service = new ThreeAnimationService();
    service.attach(adapter);

    service.play('Spin');
    service.update(0.25);
    service.pause();
    service.update(0.25); // ignored while paused
    expect(mesh.position.x).toBeCloseTo(2.5);
    expect(service.isPlaying()).toBe(false);
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

  it('is inert for a model without clips', () => {
    const bare = new THREE.Object3D();
    const service = new ThreeAnimationService();
    service.attach({ getThreeObject: () => bare } as unknown as IObject3D);

    service.play();
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
