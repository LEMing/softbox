import * as THREE from 'three';

const CHUNK_THE_PATH_TRACER_INCLUDES_BUT_THREE_R186_REMOVED = 'cube_uv_reflection_fragment';

export const provideCubeUvChunkForPathTracer = (): void => {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string | undefined>;
  chunks[CHUNK_THE_PATH_TRACER_INCLUDES_BUT_THREE_R186_REMOVED] ??= '';
};
