import '@testing-library/jest-dom';

const originalWarn = console.warn;
const originalLog = console.log;
const originalError = console.error;

console.warn = (...args) => {
  if (args[0]?.includes?.('Multiple instances of Three.js being imported')) {
    return;
  }
  originalWarn(...args);
};

console.log = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' && 
    (message.includes('[ViewerCore]') || 
     message.includes('[useViewerCore]') ||
     message.includes('stopRenderLoop') ||
     message.includes('Disposing')) &&
    !message.includes('[ThreePathTracingService]')
  ) {
    return;
  }
  originalLog(...args);
};

console.error = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' && 
    (message.includes('Failed to initialize viewer') || 
     message.includes('gl.getShaderPrecisionFormat'))
  ) {
    return;
  }
  originalError(...args);
};
