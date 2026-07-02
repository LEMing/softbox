/**
 * Click-picking and hotspot-occlusion raycast options.
 */
export interface SelectionOptions {
  /**
   * Build a BVH (bounding volume hierarchy) for each loaded model, making
   * raycasts logarithmic instead of linear — noticeable on high-poly models.
   * Costs one build pass at load time and ~25% extra geometry memory; disable
   * on memory-constrained targets. Default on.
   */
  bvh?: boolean;
}
