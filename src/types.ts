import * as React from 'react';
import * as THREE from 'three';
import type { SimpleViewerOptions as ViewerOptions } from './types/SimpleViewerOptions';
import type { ViewerPreset } from './types/options';

export * from './types/options';
export { SimpleViewerOptions } from './types/SimpleViewerOptions';

export type { SimpleViewerHandle } from './types/SimpleViewerHandle';

export interface SimpleViewerProps {
  object: THREE.Object3D | null | string;
  options?: ViewerOptions;
  preset?: ViewerPreset;
  pathTraced?: boolean;
  turntable?: boolean;
  animations?: boolean;
  children?: React.ReactNode;
}
