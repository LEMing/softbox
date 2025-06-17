import React from 'react';
import * as THREE from 'three';

export const cleanupScene = (
  mountRef: React.RefObject<HTMLDivElement>,
  renderer: THREE.WebGLRenderer | null,
  resizeHandler: () => void,
) => {
  window.removeEventListener('resize', resizeHandler);
  if (mountRef.current && renderer) {
    mountRef.current.removeChild(renderer.domElement);
  }
};
