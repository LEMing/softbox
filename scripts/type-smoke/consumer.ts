// Type-only consumer used to verify the published declarations resolve under
// strict module-resolution modes (nodenext, bundler). Imports the package the
// way real TypeScript consumers do — by name, through its exports map.
import {
  SimpleViewer,
  defaultOptions,
  ThreeViewerError,
  ErrorCode,
  TypedEventEmitter,
  ControlType,
} from 'softbox';
import type {
  SimpleViewerOptions,
  SimpleViewerProps,
  SimpleViewerHandle,
  ViewerEventMap,
} from 'softbox';

const options: SimpleViewerOptions = {
  ...defaultOptions,
  backgroundColor: '#101014',
  controls: { type: ControlType.OrbitControls },
};

const emitter = new TypedEventEmitter<ViewerEventMap>();
const error = new ThreeViewerError('x', ErrorCode.MODEL_LOAD_FAILED);

export type Props = SimpleViewerProps;
export type Handle = SimpleViewerHandle;

// Reference the runtime values so they are not elided before resolution checks.
export const used = { SimpleViewer, options, emitter, error };
