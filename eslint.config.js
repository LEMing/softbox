import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-undef': 'off',
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['src/core/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/infrastructure/**', '**/presentation/**', '**/site/**'],
            message: 'Clean architecture: src/core must not depend on infrastructure, presentation or the site. Depend on an interface in src/core instead.',
          },
          {
            group: ['three', 'three/*', 'three-gpu-pathtracer', 'three-mesh-bvh'],
            message: 'Clean architecture: src/core must stay engine-agnostic. Wrap Three.js (and its ecosystem) behind an interface in src/infrastructure.',
          },
          {
            group: [
              '**/types/CommonTypes', '**/types/CommonTypes.*',
              '**/types/SimpleViewerHandle', '**/types/SimpleViewerHandle.*',
              '**/events/ViewerEvents', '**/events/ViewerEvents.*',
            ],
            message: 'These shared modules carry Three.js types for the public React surface; core must not reach them (see the engine-agnostic shared-module lint blocks).',
          },
          {
            // The root barrels re-export the Three.js-typed public-surface
            // modules (src/types.ts even imports three directly) — importing
            // one from core smuggles all of that in through one innocent
            // specifier. Regex, not group: a glob like '**/types' matches the
            // directory's CHILDREN too; only the exact barrel specifier is
            // banned, leaf modules stay importable.
            regex: '(^|/)(types|events|events/index)$',
            message: 'Barrel imports re-export Three.js-typed public-surface modules into core; import the specific module instead.',
          },
        ],
      }],
    },
  },
  {
    // Everything engine-agnostic core imports transitively — the shared type,
    // event, error and util modules — must be as three-free as core itself.
    // The named ignores are the PUBLIC React-surface modules that legitimately
    // carry Three.js types; core is banned from importing those by name above.
    files: ['src/types/**/*.ts', 'src/events/**/*.ts', 'src/errors/**/*.ts', 'src/utils/**/*.ts'],
    ignores: [
      'src/**/__tests__/**',
      'src/types/CommonTypes.ts',
      'src/types/SimpleViewerHandle.ts',
      'src/events/ViewerEvents.ts',
      // Deliberate public-surface re-export of ViewerEvents.
      'src/events/index.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['three', 'three/*', 'three-gpu-pathtracer', 'three-mesh-bvh'],
            message: 'This module is in engine-agnostic core\'s transitive import closure; use primitives or a Vec3Like, not Three.js types.',
          },
          {
            // Same-dir specifiers ('./CommonTypes') dodge the '**/types/…'
            // patterns core uses — ban the three-carrying siblings here too,
            // or a guarded file could pass their types through to core.
            group: [
              '**/CommonTypes', '**/CommonTypes.*',
              '**/SimpleViewerHandle', '**/SimpleViewerHandle.*',
              '**/ViewerEvents', '**/ViewerEvents.*',
            ],
            message: 'This sibling module carries Three.js types for the public React surface; a module in core\'s import closure must not re-export or depend on it.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    ignores: ['src/infrastructure/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/presentation/**', '**/site/**'],
            message: 'Clean architecture: infrastructure adapts engines for core; it must not depend on the React layer or the site.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    ignores: ['src/presentation/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/site/**'],
            message: 'The playground site is an app on top of the library; the library must never import from it.',
          },
        ],
      }],
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/__tests__/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      '*.js',
      '*.cjs',
      'vite.config.ts',
      'jest.config.js',
      'eslint.config.js',
    ],
  }
);