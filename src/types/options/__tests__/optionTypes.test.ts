import * as THREE from 'three';
import defaultOptions from '../../../defaultOptions';
import { DirectionalLightOptions } from '../LightingOptions';
import { RendererOptions } from '../RendererOptions';

/**
 * The option types were made engine-agnostic (roadmap item 13) so core stops
 * transitively importing THREE. These checks pin that a THREE value still
 * assigns to the now-primitive fields — the migration must not break real
 * Three.js callers.
 */
describe('engine-agnostic option types', () => {
  it('accepts THREE enum constants for the renderer option numbers', () => {
    const renderer: RendererOptions = {
      shadowMapType: THREE.PCFSoftShadowMap,
      toneMapping: THREE.ACESFilmicToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
    };
    expect(renderer.shadowMapType).toBe(THREE.PCFSoftShadowMap);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it('accepts a THREE.Vector3 for a Vec3Like light position', () => {
    const light: DirectionalLightOptions = {
      position: new THREE.Vector3(1, 2, 3),
    };
    const { position } = light;
    expect(position && 'x' in position ? position.x : (position as number[])[0]).toBe(1);
  });

  it('keeps the defaults valid under the primitive types', () => {
    expect(typeof defaultOptions.renderer?.shadowMapType).toBe('number');
    expect(typeof defaultOptions.renderer?.toneMapping).toBe('number');
  });
});
