/**
 * Interface for renderer extensions that need access to the underlying renderer
 * This allows features like path tracing while maintaining clean architecture
 */
export interface IRendererExtension<T = unknown> {
  /**
   * Get the internal renderer implementation
   * Returns null if not available or not of expected type
   */
  getInternalRenderer(): T | null;
}
