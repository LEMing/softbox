import '@testing-library/jest-dom';

// Store original console methods
const originalWarn = console.warn;
const originalLog = console.log;
const originalError = console.error;

// Suppress Three.js multiple instances warning in tests
console.warn = (...args) => {
  if (args[0]?.includes?.('Multiple instances of Three.js being imported')) {
    return;
  }
  originalWarn(...args);
};

// Suppress verbose logging in test environment
console.log = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' && 
    (message.includes('[ViewerCore]') || 
     message.includes('[ThreeRendererAdapter]') ||
     message.includes('[useViewerCore]') ||
     message.includes('stopRenderLoop') ||
     message.includes('Disposing')) &&
    !message.includes('[ThreePathTracingService]')
  ) {
    return;
  }
  originalLog(...args);
};

// Suppress expected WebGL errors
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

// Mock crypto.randomUUID for test environment
if (!global.crypto) {
  global.crypto = {} as Crypto;
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = (() => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }) as Crypto['randomUUID'];
}
