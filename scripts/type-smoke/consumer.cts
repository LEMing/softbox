// CommonJS consumer — exercises the `require` exports condition and CJS type
// resolution under nodenext (a .cts file is always CommonJS regardless of the
// repo's "type": "module"). This is the path the ESM consumer.ts does not cover.
import viewer = require('softbox');

export const cjsSurface = {
  SimpleViewer: viewer.SimpleViewer,
  defaultOptions: viewer.defaultOptions,
  ThreeViewerError: viewer.ThreeViewerError,
  ErrorCode: viewer.ErrorCode,
  TypedEventEmitter: viewer.TypedEventEmitter,
  ControlType: viewer.ControlType,
};
