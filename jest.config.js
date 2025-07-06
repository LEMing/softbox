export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^three/examples/jsm/controls/OrbitControls$': '<rootDir>/src/__mocks__/OrbitControlsMock.ts',
    '^three/examples/jsm/controls/MapControls$': '<rootDir>/src/__mocks__/MapControlsMock.ts',
    '^three/examples/jsm/loaders/GLTFLoader$': '<rootDir>/src/__mocks__/GLTFLoaderMock.ts',
    '^three/examples/jsm/loaders/EXRLoader$': '<rootDir>/src/__mocks__/EXRLoaderMock.ts',
    '^three/examples/jsm/loaders/RGBELoader$': '<rootDir>/src/__mocks__/RGBELoaderMock.ts',
    '^three/examples/jsm/environments/RoomEnvironment$': '<rootDir>/src/__mocks__/RoomEnvironmentMock.ts',
    '^three-gpu-pathtracer$': '<rootDir>/src/__mocks__/three-gpu-pathtracer.ts',
    '^three$': '<rootDir>/node_modules/three',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
    }],
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'clover'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(three|three-gpu-pathtracer)/)'
  ]
};
