/**
 * Click-picking and hotspot-occlusion raycast options.
 */
export interface SelectionOptions {
  /**
   * Build a BVH (bounding volume hierarchy) for each loaded model, making
   * raycasts logarithmic instead of linear — noticeable on high-poly models.
   * Costs one synchronous build pass at load time (or on the first click for
   * models passed as raw objects) and ~25% extra geometry memory. The build
   * sorts each geometry's index in place (triangle order changes; rendering
   * is unaffected) and adds an index to non-indexed geometry. Disable on
   * memory-constrained targets or when the index order matters. Default on.
   */
  bvh?: boolean;
}
