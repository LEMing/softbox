// Three.js infrastructure adapters
export * from './ThreeVector3';
export * from './ThreeObject3D';
export * from './ThreeScene';
export * from './ThreeRenderer';
export * from './ThreeCamera';
export * from './ThreeModelLoader';
export * from './ThreeControls';
export * from './ThreeSceneSetupService';
// ThreePathTracingService is deliberately NOT re-exported: it statically pulls
// three-gpu-pathtracer (~60 kB gzip). LazyPathTracingService dynamic-imports it
// on demand, keeping the tracer in a separate chunk for everyone else.
export * from './LazyPathTracingService';
export * from './ThreeEnvironmentService';
export * from './ThreeFloorAlignmentService';
export * from './ThreeSelectionService';
export * from './unwrap';