import * as THREE from 'three';
import { isPrefilteredEnvironment } from '../prefilteredEnvironment';

const textureWith = (mapping: number, isPMREMTexture: boolean) => {
  const texture = new THREE.Texture();
  texture.mapping = mapping as THREE.AnyMapping;
  texture.isPMREMTexture = isPMREMTexture;
  return texture;
};

describe('isPrefilteredEnvironment', () => {
  it.each([
    ['a PMREM output of r186 and later, a cube texture marked isPMREMTexture', THREE.CubeReflectionMapping, true, true],
    ['a PMREM output before r186, marked only by the CubeUV mapping 306', 306, false, true],
    ['a plain cube capture', THREE.CubeReflectionMapping, false, false],
    ['an equirectangular map', THREE.EquirectangularReflectionMapping, false, false],
  ])('%s', (_name, mapping, isPMREMTexture, expected) => {
    expect(isPrefilteredEnvironment(textureWith(mapping, isPMREMTexture))).toBe(expected);
  });
});
