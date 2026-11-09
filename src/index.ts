export { default as SimpleViewer, type SimpleViewerHandle } from './SimpleViewerWrapper'
export { type CaptureStillOptions, type CaptureVideoOptions } from './types/SimpleViewerHandle'

export { Hotspot, type HotspotProps } from './presentation/components/Hotspot'
export { type SimpleViewerProps } from './types'
export { type SimpleViewerOptions } from './types'
export { type ModelUnits } from './types/SimpleViewerOptions'
export type { ControlsInstance } from './types/CommonTypes'
export { default as defaultOptions } from './defaultOptions'

export * from './types/options'

export { VIEWER_PRESETS, resolvePreset } from './presets'

export {
  VIEWER_SCENES,
  resolveScene,
  DEFAULT_SCENE,
  DEFAULT_OUTDOOR_HDRI_URL,
  DEFAULT_OUTDOOR_CONCRETE_TEXTURES,
} from './scenes'

export { TypedEventEmitter } from './events'
export type { ViewerEventMap } from './events'

export { ThreeViewerError, ErrorCode } from './errors'
export type { ErrorContext } from './errors'
