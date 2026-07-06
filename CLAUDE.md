# CLAUDE.md - softbox Development Guide

## Development Commands
- `npm run dev` - Start Vite development server
- `npm run build` - Build production bundle
- `npm run lint` - Run ESLint to check code style
- `npm test` - Run all tests
- `npm test -- -t "test name"` - Run specific test by name
- `npm test -- src/path/to/file.test.ts` - Run tests in specific file
- `npm test -- --coverage` - Run tests with coverage report

## Testing Requirements
- **MANDATORY**: All new code MUST have corresponding tests
- **Test Coverage**: Aim for minimum 80% coverage for new code
- **Test Location**: Place tests in `__tests__` folders next to the code being tested
- **Test Naming**: Use descriptive test names that explain what is being tested
- **Test Structure**: Follow Arrange-Act-Assert pattern
- **Mocking**: Mock external dependencies, especially Three.js objects
- **Edge Cases**: Test error conditions, edge cases, and happy paths
- **Before Committing**: 
  - Always run `npm test` to ensure all tests pass
  - Always run `npm run lint` to ensure code follows style guidelines
  - Fix all linting errors - no `@ts-ignore` or `eslint-disable` without justification

## Code Style Guidelines
- **Imports**: Group imports by external libs first, then internal modules
- **Types**: Use TypeScript strict mode, define interfaces/types in dedicated files
- **Classes**: Use PascalCase for class names (e.g., `RendererManager`)
- **Functions/Variables**: Use camelCase
- **Components**: Use React functional components with explicit type annotations
- **Error Handling**: Use try/catch for async operations, handle possible nulls
- **State Management**: Use React hooks (useState, useEffect, useMemo, useCallback)
- **Formatting**: 2-space indentation, semicolons required
- **Testing**: Use Jest for testing, test files co-located with source in __tests__ folders
- **File Organization**: Group related functionality in directories, use index.ts for exports
- **Naming Conventions**: Clear, descriptive names that reflect purpose
