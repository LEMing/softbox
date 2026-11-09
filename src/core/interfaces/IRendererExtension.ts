export interface IRendererExtension<T = unknown> {
  getInternalRenderer(): T | null;
}
