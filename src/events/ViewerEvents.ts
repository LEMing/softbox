import * as THREE from 'three';
import { ControlsInstance } from '../types/CommonTypes';
import type { SimpleViewerHandle } from '../types/SimpleViewerHandle';
import { ViewerEventMap as GenericViewerEventMap } from './ViewerEventMap';

export type ViewerEventMap = GenericViewerEventMap<
  THREE.Object3D,
  THREE.Camera,
  ControlsInstance,
  SimpleViewerHandle
>;
