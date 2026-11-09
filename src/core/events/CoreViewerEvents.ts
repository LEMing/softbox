import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ViewerEventMap as GenericViewerEventMap } from '../../events/ViewerEventMap';

export type ViewerEventMap = GenericViewerEventMap<THREE.Object3D, THREE.Camera, OrbitControls, unknown>;
