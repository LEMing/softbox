# CLAUDE.md - ThreeDViewer Development Guide

## Development Commands
- `npm run dev` - Start Vite development server
- `npm run build` - Build production bundle
- `npm test` - Run all tests
- `npm test -- -t "test name"` - Run specific test by name
- `npm test -- src/path/to/file.test.ts` - Run tests in specific file

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
