import * as THREE from 'three';
import { addLighting } from '../lighting';
import { ILightingOptions } from '../../../../core/services/ISceneSetupService';
import { IScene } from '../../../../core/interfaces/IScene';

/** addLighting unwraps a raw three Scene at runtime; cast for TS. */
const light = (scene: unknown, options: ILightingOptions) =>
  addLighting(scene as IScene, options);

const directionalsOf = (scene: THREE.Scene): THREE.DirectionalLight[] =>
  scene.children.filter((c): c is THREE.DirectionalLight => (c as THREE.DirectionalLight).isDirectionalLight);

describe('addLighting', () => {
  it('errors when the scene is not a three scene', () => {
    const result = light({}, { ambient: { intensity: 1 } });
    expect(result.ok).toBe(false);
  });

  it('builds a three-point rig: a shadow-casting key plus shadowless fill and rim', () => {
    const scene = new THREE.Scene();
    const result = light(scene, {
      ambient: { color: '#404040', intensity: 0.3 },
      hemisphere: { skyColor: '#fff', groundColor: '#000', intensity: 0.3 },
      directional: { color: '#ffffff', intensity: 2.4, position: [40, 90, 40], castShadow: true },
      fill: { color: '#eef2ff', intensity: 0.6, position: [-55, 28, 34] },
      rim: { color: '#f2f6ff', intensity: 2.6, position: [18, 52, -72] },
    });

    expect(result.ok).toBe(true);
    expect(scene.children.some((c) => (c as THREE.AmbientLight).isAmbientLight)).toBe(true);
    expect(scene.children.some((c) => (c as THREE.HemisphereLight).isHemisphereLight)).toBe(true);

    const directionals = directionalsOf(scene);
    expect(directionals).toHaveLength(3);
    // Only the key casts a shadow; fill and rim never do (one clean contact shadow).
    expect(directionals.filter((d) => d.castShadow)).toHaveLength(1);
  });

  it('adds the shadow-casting key FIRST so findDirectionalLight resolves it as the shadow source', () => {
    const scene = new THREE.Scene();
    light(scene, {
      directional: { intensity: 2.4, position: [40, 90, 40], castShadow: true },
      fill: { intensity: 0.6, position: [-55, 28, 34] },
      rim: { intensity: 2.6, position: [18, 52, -72] },
    });

    // findDirectionalLight walks children in order and takes the first; that
    // must be the key (the only shadow caster), or the contact shadow follows
    // the wrong light.
    const firstDirectional = directionalsOf(scene)[0];
    expect(firstDirectional.castShadow).toBe(true);
    expect(firstDirectional.position.toArray()).toEqual([40, 90, 40]);
  });

  it('positions fill and rim from the given directions', () => {
    const scene = new THREE.Scene();
    light(scene, {
      directional: { intensity: 2, position: [40, 90, 40], castShadow: true },
      fill: { intensity: 0.6, position: [-55, 28, 34] },
      rim: { intensity: 2.6, position: [18, 52, -72] },
    });

    const [, fill, rim] = directionalsOf(scene);
    expect(fill.castShadow).toBe(false);
    expect(fill.position.toArray()).toEqual([-55, 28, 34]);
    expect(rim.castShadow).toBe(false);
    expect(rim.position.toArray()).toEqual([18, 52, -72]);
  });

  it('falls back to default accent positions when none are given', () => {
    const scene = new THREE.Scene();
    light(scene, {
      directional: { intensity: 2, castShadow: true },
      fill: { intensity: 0.6 },
      rim: { intensity: 2.6 },
    });

    const [, fill, rim] = directionalsOf(scene);
    expect(fill.position.toArray()).toEqual([-60, 30, 30]);
    expect(rim.position.toArray()).toEqual([20, 50, -70]);
  });

  it('omits fill and rim when not requested (key-only rigs still work)', () => {
    const scene = new THREE.Scene();
    light(scene, { directional: { intensity: 2, castShadow: true } });
    expect(directionalsOf(scene)).toHaveLength(1);
  });

  it('defaults a colour-less accent to white without a three "Unknown color" warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = new THREE.Scene();
    light(scene, {
      directional: { intensity: 2, castShadow: true },
      fill: { intensity: 0.6 },
    });
    const [, fill] = directionalsOf(scene);
    expect(fill.color.getHexString()).toBe('ffffff');
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown color'));
    warnSpy.mockRestore();
  });
});
