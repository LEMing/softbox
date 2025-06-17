import '@testing-library/jest-dom';

// Suppress Three.js multiple instances warning in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('Multiple instances of Three.js being imported')) {
    return;
  }
  originalWarn(...args);
};
