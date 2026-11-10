import { ViewerEventMap as GenericViewerEventMap } from '../../events/ViewerEventMap';
import { IObject3D } from '../interfaces/IObject3D';
import { ICamera } from '../interfaces/ICamera';
import { IControls } from '../interfaces/IControls';

export type ViewerEventMap = GenericViewerEventMap<IObject3D, ICamera, IControls, unknown>;
