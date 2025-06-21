# ThreeDViewer v2.0 Beta Release Notes

We're excited to announce the beta release of ThreeDViewer v2.0! This major update brings significant improvements to error handling, type safety, and developer experience while maintaining the simplicity you love.

## 🎯 Key Highlights

- **🛡️ Robust Error Handling**: New Result pattern prevents crashes and provides detailed error context
- **📡 Type-Safe Event System**: Fully typed event emitter for better IDE support
- **✅ Configuration Validation**: Runtime validation catches issues early
- **📊 82.8% Test Coverage**: Comprehensive test suite ensures reliability
- **🔄 Backward Compatible**: Deprecation warnings help smooth migration

## 🚀 Major Features

### 1. Result-Based Error Handling

Replace try-catch blocks with elegant Result pattern:

```typescript
const result = manager.setup();
if (!result.ok) {
  console.error(result.error.message, result.error.code);
  return;
}
// Use result.value safely
```

### 2. Type-Safe Event System

```typescript
viewerRef.current.events.on('model:loaded', ({ model, loadTime }) => {
  console.log(`Loaded ${model.name} in ${loadTime}ms`);
});
```

All events are fully typed with TypeScript support!

### 3. Modular Configuration

Organized options for better clarity:

```typescript
<SimpleViewer
  backgroundColor="#1a1a1a"
  render={{ antialias: true, shadowMap: true }}
  camera={{ fov: 60, position: [5, 5, 5] }}
  controls={{ enableDamping: true }}
  helpers={{ axes: true, grid: true }}
/>
```

### 4. Enhanced Error Context

Errors now include helpful debugging information:

```typescript
ThreeViewerError {
  message: "Failed to load model",
  code: "MODEL_LOAD_FAILED",
  context: {
    url: "/models/example.glb",
    httpStatus: 404,
    loadTime: 1523
  }
}
```

## 📈 Improvements

### Performance
- Optimized render loop with proper throttling
- Better resource cleanup and memory management
- Lazy loading for optional features

### Developer Experience
- Comprehensive TypeScript types
- Better IDE autocomplete
- Clear deprecation warnings
- Detailed API documentation

### Reliability
- 82.8% test coverage (up from ~40%)
- 230+ unit and integration tests
- Validated configuration options
- Graceful error recovery

## 🔄 Migration

### Backward Compatibility
Most v1.x code will work with deprecation warnings. We provide:
- [Migration Guide](./MIGRATION_GUIDE.md) with step-by-step instructions
- [Breaking Changes](./BREAKING_CHANGES.md) documentation
- [Example Code](./examples/v2-patterns) showing new patterns
- Deprecation warnings with suggested fixes

### Quick Migration Example

**Before (v1.x):**
```typescript
try {
  viewer.loadModel('model.glb');
} catch (error) {
  console.error(error);
}
```

**After (v2.0):**
```typescript
viewer.events.on('model:error', ({ error }) => {
  console.error(error.message);
});
await viewer.loadModel('model.glb');
```

## 📦 Installation

```bash
npm install threedviewer@2.0.0-beta.1
# or
yarn add threedviewer@2.0.0-beta.1
```

## 🧪 Beta Testing

We need your feedback! During the beta period:

1. **Test your existing code** - Report any migration issues
2. **Try new features** - Explore the event system and Result pattern
3. **Check performance** - Ensure no regressions in your use cases
4. **Report bugs** - File issues on GitHub

### How to Help

```typescript
// Enable verbose logging during beta
window.THREEDVIEWER_DEBUG = true;

// Report issues with context
viewer.events.on('error', ({ error }) => {
  if (window.THREEDVIEWER_BETA_REPORT) {
    reportBetaIssue(error);
  }
});
```

## 🗓️ Release Timeline

- **Beta Period**: 4 weeks (feedback collection)
- **RC Period**: 2 weeks (final fixes)
- **Stable Release**: February 2024
- **v1.x Support**: Until December 2024

## 📋 Complete Changelog

### Added
- Result<T, E> pattern for error handling
- TypedEventEmitter with ViewerEventMap
- OptionsValidator for runtime validation
- ThreeViewerError with error codes
- Comprehensive test suite (230+ tests)
- Migration guide and examples
- API reference documentation

### Changed
- All managers now return Result instead of throwing
- Configuration options are now modular
- Event system replaces callbacks
- Path tracing setup is now async
- Environment map loading separated from setup

### Deprecated
- Flat configuration props (use nested structure)
- Callback properties (use event system)
- Direct error throwing (use Result pattern)

### Fixed
- Memory leaks in animation loop
- WebGL context loss handling
- Type safety issues with 'any' types
- Resource cleanup on unmount

## 🙏 Acknowledgments

Thanks to all contributors who made this release possible:
- Comprehensive refactoring plan and implementation
- Extensive testing and documentation
- Community feedback and suggestions

## 📚 Resources

- [Documentation](./API_REFERENCE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Examples](./examples/v2-patterns)
- [GitHub Issues](https://github.com/yourusername/threedviewer/issues)
- [Discord Community](https://discord.gg/threedviewer)

## ⚠️ Known Issues

- Path tracing may not initialize on some older GPUs (falls back gracefully)
- TypeScript 4.5+ required for full type inference
- Some deprecation warnings may show in strict mode

Please report any issues you encounter during the beta period!

---

**Ready to try v2.0?** Install the beta and let us know what you think! Your feedback shapes the final release.

```bash
npm install threedviewer@2.0.0-beta.1
```

Happy coding! 🎉