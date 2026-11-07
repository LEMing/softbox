import * as THREE from 'three';

const CUBE_UV_REFLECTION_MAPPING_BEFORE_R186 = 306;

export const isPrefilteredEnvironment = (texture: THREE.Texture): boolean =>
  texture.isPMREMTexture === true || (texture.mapping as number) === CUBE_UV_REFLECTION_MAPPING_BEFORE_R186;
