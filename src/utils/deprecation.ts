/**
 * Utility for handling deprecation warnings
 */

const DEPRECATION_PREFIX = '[ThreeDViewer Deprecation]';
const shownWarnings = new Set<string>();

/**
 * Shows a deprecation warning once per unique message
 */
export function deprecationWarning(
  oldFeature: string,
  newFeature: string,
  version: string = 'v3.0'
): void {
  const message = `${DEPRECATION_PREFIX} ${oldFeature} is deprecated and will be removed in ${version}. Use ${newFeature} instead.`;
  
  if (!shownWarnings.has(message)) {
    shownWarnings.add(message);
    console.warn(message);
  }
}

/**
 * Checks for deprecated props and shows warnings
 */
export function checkDeprecatedProps(props: Record<string, any>): void {
  // Check for old flat props that should use nested structure
  if ('antialias' in props) {
    deprecationWarning(
      'antialias prop',
      'render.antialias in options'
    );
  }
  
  if ('shadowMap' in props) {
    deprecationWarning(
      'shadowMap prop',
      'render.shadowMap in options'
    );
  }
  
  if ('cameraFov' in props || 'cameraPosition' in props) {
    deprecationWarning(
      'cameraFov/cameraPosition props',
      'camera.cameraFov/camera.cameraPosition in options'
    );
  }
  
  if ('enableDamping' in props || 'dampingFactor' in props) {
    deprecationWarning(
      'control props at root level',
      'controls.enableDamping/controls.dampingFactor in options'
    );
  }
  
  if ('axes' in props || 'grid' in props) {
    deprecationWarning(
      'axes/grid props',
      'helpers.axes/helpers.grid in options'
    );
  }
  
  if ('onLoad' in props || 'onError' in props) {
    deprecationWarning(
      'onLoad/onError callbacks',
      'events.on("model:loaded") / events.on("error")'
    );
  }
  
  if ('pathTracingSamples' in props) {
    deprecationWarning(
      'pathTracingSamples prop',
      'pathTracing.samples in options'
    );
  }
}

/**
 * Maps deprecated props to new structure
 */
export function mapDeprecatedProps(props: Record<string, any>): Record<string, any> {
  const mapped = { ...props };
  
  // Create nested structures if needed
  if (!mapped.render) mapped.render = {};
  if (!mapped.camera) mapped.camera = {};
  if (!mapped.controls) mapped.controls = {};
  if (!mapped.helpers) mapped.helpers = {};
  if (!mapped.pathTracing) mapped.pathTracing = {};
  
  // Map deprecated props
  if ('antialias' in mapped) {
    mapped.render.antialias = mapped.antialias;
    delete mapped.antialias;
  }
  
  if ('shadowMap' in mapped) {
    mapped.render.shadowMap = mapped.shadowMap;
    delete mapped.shadowMap;
  }
  
  if ('cameraFov' in mapped) {
    mapped.camera.cameraFov = mapped.cameraFov;
    delete mapped.cameraFov;
  }
  
  if ('cameraPosition' in mapped) {
    mapped.camera.cameraPosition = mapped.cameraPosition;
    delete mapped.cameraPosition;
  }
  
  if ('enableDamping' in mapped) {
    mapped.controls.enableDamping = mapped.enableDamping;
    delete mapped.enableDamping;
  }
  
  if ('dampingFactor' in mapped) {
    mapped.controls.dampingFactor = mapped.dampingFactor;
    delete mapped.dampingFactor;
  }
  
  if ('axes' in mapped) {
    mapped.helpers.axes = mapped.axes;
    delete mapped.axes;
  }
  
  if ('grid' in mapped) {
    mapped.helpers.grid = mapped.grid;
    delete mapped.grid;
  }
  
  if ('pathTracingSamples' in mapped) {
    mapped.pathTracing.samples = mapped.pathTracingSamples;
    delete mapped.pathTracingSamples;
  }
  
  return mapped;
}