/**
 * Compression-decoder configuration for the built-in glTF/GLB loader.
 *
 * DRACO (geometry), KTX2/Basis (textures) and Meshopt (geometry) are all wired
 * into the loader by default, so compressed assets exported by Blender,
 * `gltfpack`, `gltf-transform`, etc. load without any extra setup.
 *
 * Meshopt is bundled and needs no external file. DRACO and KTX2 require a small
 * WebAssembly decoder that is fetched **on demand** — only the first time an
 * asset actually uses that compression — from a version-pinned CDN by default.
 * Point `dracoDecoderPath` / `ktx2TranscoderPath` at a self-hosted copy (e.g.
 * `three/examples/jsm/libs/draco/` and `.../basis/` copied into your public dir)
 * for a fully offline, no-CDN setup.
 */
export interface LoaderOptions {
  /** Decode DRACO-compressed geometry. Default: `true`. */
  draco?: boolean;
  /** Decode KTX2 / Basis-compressed textures. Default: `true`. */
  ktx2?: boolean;
  /** Decode Meshopt-compressed geometry. Default: `true`. */
  meshopt?: boolean;
  /**
   * Directory holding the DRACO decoder (`draco_wasm_wrapper.js` +
   * `draco_decoder.wasm`). Must end with a trailing slash. Defaults to a
   * version-pinned jsDelivr URL matching the installed Three.js revision.
   */
  dracoDecoderPath?: string;
  /**
   * Directory holding the KTX2 Basis transcoder (`basis_transcoder.js` +
   * `basis_transcoder.wasm`). Must end with a trailing slash. Defaults to a
   * version-pinned jsDelivr URL matching the installed Three.js revision.
   */
  ktx2TranscoderPath?: string;
}
