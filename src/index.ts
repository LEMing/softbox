export { default as SimpleViewer, type SimpleViewerHandle } from './SimpleViewerWrapper'
export { type CaptureStillOptions, type CaptureVideoOptions } from './types/SimpleViewerHandle'

// World-anchored DOM annotations, rendered as SimpleViewer children
export { Hotspot, type HotspotProps } from './presentation/components/Hotspot'
export { type SimpleViewerProps } from './types'
export { type SimpleViewerOptions } from './types'
export { type ModelUnits } from './types/SimpleViewerOptions'
export type { ControlsInstance } from './types/CommonTypes'
export { default as defaultOptions } from './defaultOptions'

// Option sub-types, the ControlType enum and the ViewerPreset union, so
// consumers can construct options
export * from './types/options'

// Visual presets (the data behind the `preset` prop), for inspection/composition
export { VIEWER_PRESETS, resolvePreset } from './presets'

// Scenes (the data behind `options.scene`), for inspection/composition
export { VIEWER_SCENES, resolveScene } from './scenes'

// Typed event system
export { TypedEventEmitter } from './events'
export type { ViewerEventMap } from './events'

// Error model (appears in event payloads / Result errors)
export { ThreeViewerError, ErrorCode } from './errors'
export type { ErrorContext } from './errors'
