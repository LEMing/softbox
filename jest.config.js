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
    '^three/examples/jsm/postprocessing/Pass\\.js$': '<rootDir>/src/__mocks__/PassMock.ts',
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
    // Global floors sit just under the remaining-pool actuals (jest subtracts
    // the path-pinned files below) — ratcheted 2026-07-02 from the stale
    // 48/32/34/48; re-tighten after major additions.
    global: {
      statements: 72,
      branches: 64,
      functions: 58,
      lines: 72,
    },
    './src/core/managers/': {
      statements: 95,
      branches: 88,
      functions: 95,
      lines: 95,
    },
    // Ratcheted 2026-07-12 (92/88/78/92 → below) after the environment/backdrop
    // cluster moved to EnvironmentController and lifted the remainder.
    './src/core/ViewerCore.ts': {
      statements: 94,
      branches: 90,
      functions: 85,
      lines: 94,
    },
    // 2026-07-12: extracted from ViewerCore; fully covered by its unit tests.
    './src/core/EnvironmentController.ts': {
      statements: 100,
      branches: 95,
      functions: 100,
      lines: 100,
    },
    './src/core/CaptureController.ts': {
      statements: 92,
      branches: 88,
      functions: 78,
      lines: 92,
    },
    './src/core/PathTracingCoordinator.ts': {
      statements: 95,
      branches: 88,
      functions: 95,
      lines: 95,
    },
    './src/infrastructure/three/disposal.ts': {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
    './src/infrastructure/three/bvh.ts': {
      statements: 100,
      branches: 85,
      functions: 100,
      lines: 100,
    },
    './src/infrastructure/three/ThreeSelectionService.ts': {
      statements: 88,
      branches: 80,
      functions: 88,
      lines: 88,
    },
    './src/presentation/components/Hotspot.tsx': {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85,
    },
    // 2026-07-07 B-tier pins: the modules the audit flagged as unpinned —
    // deleting any of their test files must fail CI, not slip through the
    // global pool.
    './src/infrastructure/three/ContactShadowBaker.ts': {
      statements: 95,
      branches: 80,
      functions: 85,
      lines: 95,
    },
    './src/infrastructure/three/ThreeAnimationService.ts': {
      statements: 95,
      branches: 84,
      functions: 95,
      lines: 95,
    },
    './src/infrastructure/three/HexTile.ts': {
      statements: 95,
      branches: 88,
      functions: 95,
      lines: 95,
    },
    './src/infrastructure/three/grids/HexagonalGlassGrid.ts': {
      statements: 95,
      branches: 70,
      functions: 80,
      lines: 95,
    },
    './src/presentation/hooks/useViewportGate.ts': {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
    // 2026-07-09 new-module pins (opt-in post-processing + shadow-floor default).
    './src/infrastructure/three/postprocessing/PostProcessingPipeline.ts': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    // 2026-07-12 tech-debt audit pin: the renderer adapter (option mapping,
    // render dispatch/fallbacks, lifecycle) sat at 25% under the global pool —
    // deleting its new test file must fail CI, not slip through.
    './src/infrastructure/three/ThreeRenderer.ts': {
      statements: 90,
      branches: 80,
      functions: 90,
      lines: 90,
    },
    './src/infrastructure/three/grids/ShadowFloorGrid.ts': {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  // The Playwright render-smoke suite runs real WebGL via `npm run test:render`.
  // `.claude/worktrees` holds full repo checkouts for parallel background
  // agents — without this, their (possibly mid-edit, possibly failing) copies
  // of every test file get swept into this run's results too.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/render-smoke/', '<rootDir>/.claude/'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(three|three-gpu-pathtracer)/)'
  ]
};
