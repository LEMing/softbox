Changelog
=========

2.4.1
---

### Improvements
* **Removed crypto dependency**: Replaced native crypto.randomUUID() with custom UUID implementation
  - Eliminates external dependency for better compatibility
  - Uses template-based approach for cleaner code
  - Added comprehensive tests for UUID generation
  - Note: Uses Math.random() which is suitable for internal IDs but not cryptographically secure

2.4.0
---

### Architecture Improvements
* **Refactored ViewerCore**: Split monolithic ViewerCore into focused manager classes
  - `ModelManager`: Handles model loading and manipulation
  - `StateManager`: Manages viewer state and updates
  - `ResourceManager`: Manages resource disposal and memory
  - `ScreenshotManager`: Handles screenshot functionality
* **Improved Separation of Concerns**: Each manager has a single responsibility
* **Better Testability**: Comprehensive test coverage for all manager classes

### New Features
* **Dark Studio Mode**: Added new dark studio environment option
  - Creates a professional dark backdrop for better model visibility
  - Configurable through environment settings

### Code Quality
* **Linting Enforcement**: Added strict linting requirements to development workflow
  - All code must pass ESLint with zero warnings
  - Fixed all existing linting errors across the codebase
* **Test Coverage**: Added comprehensive tests for all manager classes
  - Achieved high test coverage for new code
  - Mocked external dependencies for better test isolation

### Developer Experience
* **Updated CLAUDE.md**: Enhanced development guide with mandatory linting requirements
* **Clean Test Output**: Mocked console.error in tests for cleaner test output

2.3.0
---

### New Features
* **Customizable Grid Styles**: Added GridFactory pattern to support multiple grid rendering styles
  - Square wire grid: Traditional wireframe grid
  - Hexagonal wire grid: Wireframe hexagonal pattern
  - Hexagonal glass grid: Translucent glass-like hexagonal tiles
  - Stone tiles grid: Textured stone tile grid with material properties
* **Enhanced Grid Configuration**: Grid helper now accepts detailed configuration options
  - Type selection for different grid styles
  - Opacity control for translucent grids
  - Material properties (metalness, roughness, transmission)
  - Texture support (diffuse, normal, roughness maps)
  - Geometry customization (height, bevel, randomization)
* **Default Grid Creation**: Added support for creating default grids on initialization
  - Configurable size and divisions
  - Automatic grid type selection based on options

### Technical Improvements
* **Grid Architecture**: Implemented extensible grid system
  - `IGridStyle` interface for custom grid implementations
  - `GridFactory` for creating different grid types
  - Separated grid styles into dedicated classes
* **Backward Compatibility**: Maintained compatibility with existing boolean grid options
  - Legacy `grid: true` still works as before
  - New object-based configuration is optional

2.2.0
---

### Bug Fixes
* **Environment Blur**: Fixed environment blur settings not being applied correctly

2.1.0
---

### Architecture Changes
* **Clean Architecture Implementation**: Complete restructuring following clean architecture principles
  - Core layer: Business logic and interfaces (framework-agnostic)
  - Infrastructure layer: Three.js implementations and adapters
  - Presentation layer: React components and hooks
* **Functional Components**: Migrated from class-based to functional React components with hooks
* **Dependency Inversion**: All dependencies flow inward, core doesn't depend on infrastructure

### New Features
* **Type Safety**: Enforced strict TypeScript with no 'any' types allowed
  - Created comprehensive type definitions and interfaces
  - Type guards for runtime type checking
  - Result pattern for error handling throughout
* **Modular Architecture**: 
  - Separated concerns into focused modules
  - Adapter pattern for Three.js integration
  - Service interfaces for extensibility
* **Improved Testing**: 
  - Better test isolation with clean architecture
  - Mock implementations for all external dependencies
  - Maintained 86%+ test coverage

### Internal API Changes (No public API changes)
* **Component Structure**: 
  - `SimpleViewer` now uses functional component architecture
  - New hooks: `useViewerCore`, `useViewerEvents`, `useViewerState`
  - Context-based state management
* **Service Interfaces**:
  - `IPathTracingService`: Abstracted path tracing functionality
  - `IEnvironmentService`: Environment map management
  - `ISceneSetupService`: Scene configuration and helpers
* **Factory Pattern**: `ViewerFactory` for creating viewer instances with proper dependency injection

### Removed
* Legacy class-based components and managers
* Direct Three.js dependencies in core business logic
* Deprecated utilities and option mappers
* `Resizer.ts`, `loadModel.ts`, and other standalone utilities

### Technical Improvements
* **ESLint Configuration**: Migrated to ESLint v9 flat config format
* **Type Definitions**: Comprehensive TypeScript types with no implicit 'any'
* **Error Handling**: Consistent Result<T> pattern throughout the codebase
* **Code Organization**: Clear separation between layers with explicit boundaries

2.0.0
---
**Breaking Changes** - See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for upgrade instructions

### New Features
* **Event System**: Introduced event-driven architecture with typed events
  - `model:loaded`, `model:error`, `render:complete`, `controls:change`, `error` events
  - Replace callback-based API with EventEmitter pattern
* **Error Handling**: Implemented Result pattern for all manager methods
  - No more throwing errors - all operations return `Result<T, E>`
  - Enhanced error context with `ThreeViewerError` class and error codes
* **TypeScript Improvements**: 
  - Modular option interfaces for better type safety
  - New types: `Result<T>`, `ViewerEventMap`, `ErrorCode`
* **Configuration Validation**: Comprehensive validation for all options with helpful error messages
* **Test Coverage**: Achieved 86%+ test coverage across all modules

### Configuration Changes
* **Nested Structure**: Migrated from flat to nested configuration
  - Camera options: `cameraFov` → `camera.fov`, `cameraPosition` → `camera.position`
  - Render options: `antialias` → `render.antialias`, `shadowMap` → `render.shadowMap`
  - Control options: `enableDamping` → `controls.enableDamping`
  - Helper options: `axes` → `helpers.axes`, `grid` → `helpers.grid`
  - Lighting: `lightning` → `lighting` (fixed typo)
  - Path tracing: `pathTracingSettings` → `pathTracing`
  - Environment: `envMapUrl` → `environment.url`

### API Changes
* `SimpleViewerHandle` now includes `events` property
* Manager methods return `Result<T>` instead of throwing
* Async initialization for PathTracingManager and EnvironmentMapManager

### Security
* Updated vite from 5.4.1 to 6.3.5 to fix esbuild vulnerability (GHSA-67mh-4wv8-2f99)

### Deprecations
* Flat configuration properties (will be removed in v3.0)
* Callback-based event handlers (`onLoad`, `onError`, etc.)

0.11.0
---
* Add blur env map
* Use new threedgizmo 0.6.0

0.10.0
---
* Make light optional
* Use threedgizmo 0.2.1

0.9.1
---
* Fix bug with default static rendering

0.9.0
---
* Add ability to send an url as an input object

0.8.0
---
* Add support for three-gpu-pathtracer rendering
* Add env map support for realistic lighting and reflections

0.7.0
---
* Add studio background

0.6.0
---
* Use threedgizmo 0.2.0

0.5.0
---
Added support for MapControls
Added an optional gizmo controller

0.4.1
---
* Update Readme

0.4.0
---
* Add a fix for options drilling
* Add ability to set external scene, renderer, contols, etc.
* Add support for helpers color options

0.3.1
---
* Added a minor fix for number of frames per second

0.3.0
---
* Added ability to pass external animation func

0.2.0
---
* Added ability to set custom options for the viewer

0.1.0
---
* Added auto aligner and resizer
* Added a bunch of performance improvements

0.0.0
---
* Initial Release
