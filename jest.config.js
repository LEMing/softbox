export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^three/examples/jsm/controls/OrbitControls$': '<rootDir>/src/__mocks__/OrbitControlsMock.ts',
    '^three/examples/jsm/controls/MapControls$': '<rootDir>/src/__mocks__/MapControlsMock.ts',
    '^three/examples/jsm/loaders/GLTFLoader$': '<rootDir>/src/__mocks__/GLTFLoaderMock.ts',
    '^three/examples/jsm/loaders/DRACOLoader\\.js$': '<rootDir>/src/__mocks__/DRACOLoaderMock.ts',
    '^three/examples/jsm/loaders/KTX2Loader\\.js$': '<rootDir>/src/__mocks__/KTX2LoaderMock.ts',
    '^three/examples/jsm/libs/meshopt_decoder.module.js$': '<rootDir>/src/__mocks__/MeshoptDecoderMock.ts',
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
  coverageReporters: ['json', 'lcov', 'clover', 'text-summary'],
  // Floors that lock in current coverage and fail CI on regressions. `global`
  // applies to every file NOT matched by a path-specific key below (jest removes
  // matched files from the global pool). The per-path entries pin the
  // well-tested, refactor-sensitive core (GPU disposal, lifecycle, managers) high
  // so future work cannot silently gut their tests. Ratchet upward over time.
  coverageThreshold: {
    global: {
      statements: 48,
      branches: 32,
      functions: 34,
      lines: 48,
    },
    './src/core/managers/': {
      statements: 95,
      branches: 88,
      functions: 95,
      lines: 95,
    },
    './src/core/ViewerCore.ts': {
      statements: 92,
      branches: 88,
      functions: 78,
      lines: 92,
    },
    './src/infrastructure/three/disposal.ts': {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(three|three-gpu-pathtracer)/)'
  ]
};
