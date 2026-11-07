import * as THREE from 'three';
import { provideCubeUvChunkForPathTracer } from '../cubeUvChunkForPathTracer';

const chunks = THREE.ShaderChunk as unknown as Record<string, string | undefined>;

describe('provideCubeUvChunkForPathTracer', () => {
  const original = chunks.cube_uv_reflection_fragment;

  afterEach(() => {
    chunks.cube_uv_reflection_fragment = original;
  });

  it('gives the path tracer an empty cube_uv_reflection_fragment where three r186 and later have none', () => {
    delete chunks.cube_uv_reflection_fragment;

    provideCubeUvChunkForPathTracer();

    expect(chunks.cube_uv_reflection_fragment).toBe('');
  });

  it('keeps the chunk three ships before r186', () => {
    chunks.cube_uv_reflection_fragment = '#ifdef ENVMAP_TYPE_CUBE_UV\n#endif';

    provideCubeUvChunkForPathTracer();

    expect(chunks.cube_uv_reflection_fragment).toBe('#ifdef ENVMAP_TYPE_CUBE_UV\n#endif');
  });
});
