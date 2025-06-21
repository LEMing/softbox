export const OrbitControls = jest.fn().mockImplementation(() => ({
  enableDamping: false,
  dampingFactor: 0,
  enableZoom: false,
  update: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  target: { x: 0, y: 0, z: 0, copy: jest.fn() }
}));
