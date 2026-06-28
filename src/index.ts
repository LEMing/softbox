export { default as SimpleViewer, type SimpleViewerHandle } from './SimpleViewerWrapper'
export { type SimpleViewerProps } from './types'
export { type SimpleViewerOptions } from './types'
export { default as defaultOptions } from './defaultOptions'

// Option sub-types and the ControlType enum, so consumers can construct options
export * from './types/options'

// Typed event system
export { TypedEventEmitter } from './events'
export type { ViewerEventMap } from './events'

// Error model (appears in event payloads / Result errors)
export { ThreeViewerError, ErrorCode } from './errors'
export type { ErrorContext } from './errors'
