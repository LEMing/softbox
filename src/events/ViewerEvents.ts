import * as THREE from 'three';
import { ControlsInstance } from '../types/CommonTypes';
import type { SimpleViewerHandle } from '../types/SimpleViewerHandle';
import { ViewerEventMap as GenericViewerEventMap } from './ViewerEventMap';

/**
 * The public, Three.js-typed view of the viewer event contract — the shape
 * consumers see on the viewer handle's `events` emitter. Shares its single
 * source of truth with the core map via the generic {@link GenericViewerEventMap}.
 */
export type ViewerEventMap = GenericViewerEventMap<
  THREE.Object3D,
  THREE.Camera,
  ControlsInstance,
  SimpleViewerHandle
>;
