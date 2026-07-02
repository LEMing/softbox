import { ViewerEventMap as GenericViewerEventMap } from '../../events/ViewerEventMap';
import { IObject3D } from '../interfaces/IObject3D';
import { ICamera } from '../interfaces/ICamera';
import { IControls } from '../interfaces/IControls';

/**
 * The core's engine-agnostic view of the viewer event contract: objects,
 * cameras and controls are core interfaces, and the viewer handle is
 * presentation-specific (kept as `unknown` here). Presentation translates these
 * into the public, Three.js-typed event map via `EventAdapter`.
 */
export type ViewerEventMap = GenericViewerEventMap<IObject3D, ICamera, IControls, unknown>;
