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
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression Literal[value=/(^|\\/)(infrastructure|presentation|site)\\//]",
          message: 'Clean architecture: src/core must not lazy-load infrastructure, presentation or the site either — depend on an interface in src/core instead.',
        },
        {
          selector: 'ImportExpression[source.type!="Literal"]',
          message: 'Dynamic imports in core must use a plain string literal so the layer bans can inspect the specifier.',
        },
      ],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/infrastructure/**', '**/presentation/**', '**/site/**'],
            message: 'Clean architecture: src/core must not depend on infrastructure, presentation or the site. Depend on an interface in src/core instead.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/types/**/*.ts', 'src/events/**/*.ts', 'src/errors/**/*.ts', 'src/utils/**/*.ts'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression Literal[value=/(^|\\/)(infrastructure|presentation|site)\\//]",
          message: 'This module is in core\'s transitive import closure — lazy-loading an adapter would make core depend on infrastructure through one hop.',
        },
        {
          selector: 'ImportExpression[source.type!="Literal"]',
          message: 'Dynamic imports here must use a plain string literal so the closure bans can inspect the specifier.',
        },
      ],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/infrastructure/**', '**/presentation/**', '**/site/**'],
            message: 'This module is in core\'s transitive import closure; importing an adapter would make core depend on infrastructure through one hop.',
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