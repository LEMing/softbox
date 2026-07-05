Changelog
=========

3.19.5-test-conflict
---

### Diagnostic-only entry
* This entry exists only to force a merge conflict with `main` for a throwaway CI-trigger experiment. Not a real change.

3.19.5
---

### Bug fixes
* **Fixed:** `captureStill()`/`captureVideo()` did not check for an active screenshot replacement — calling either while the canvas was hidden behind a captured screenshot image (and its scene resources possibly already released) silently captured a stale or meaningless frame. Both now reject with `INVALID_STATE` while a screenshot is active.
* **Fixed:** `dispose()` racing an in-flight `loadModel()` let the freshly-loaded model be added to a scene nobody renders, with no future `dispose()` call left to reclaim its GPU resources. The load now detects the race after it resolves and disposes the orphaned model instead of installing it, returning `INVALID_STATE`.

3.19.4
---

### Packaging fix
* **Fixed:** CJS consumers under `moduleResolution: node16`/`nodenext` got ESM-flavored type declarations through the `require` condition (arethetypeswrong's "Masquerading as ESM") — the build now emits a `dist/index.d.cts` twin and the exports map serves it to `require()`, matching the `.cjs` runtime file. `npm run attw` (`@arethetypeswrong/cli --pack`) is now part of `prepublishOnly` and CI so this class of packaging regression is caught automatically.
