import * as THREE from 'three';
import { IGridStyle, IGridOptions, GridType } from './IGridStyle';
import { SquareWireGrid } from './SquareWireGrid';
import { HexagonalWireGrid } from './HexagonalWireGrid';
import { HexagonalGlassGrid } from './HexagonalGlassGrid';
import { StoneTileGrid } from './StoneTileGrid';

export class GridFactory {
  private static gridStyles: Map<GridType, IGridStyle> = new Map([
    [GridType.SQUARE_WIRE, new SquareWireGrid()],
    [GridType.HEXAGONAL_WIRE, new HexagonalWireGrid()],
    [GridType.HEXAGONAL_GLASS, new HexagonalGlassGrid()],
    [GridType.STONE_TILES, new StoneTileGrid()],
  ]);
  
  /**
   * Create a grid of the specified type
   */
  static createGrid(type: GridType, options: IGridOptions): THREE.Object3D {
    const gridStyle = this.gridStyles.get(type);
    if (!gridStyle) {
      console.warn(`Unknown grid type: ${type}, falling back to square wire grid`);
      const fallbackStyle = this.gridStyles.get(GridType.SQUARE_WIRE);
      if (!fallbackStyle) {
        throw new Error('Square wire grid style not found');
      }
      return fallbackStyle.createGrid(options);
    }
    
    const grid = gridStyle.createGrid(options);
    grid.name = `Grid_${type}`;
    return grid;
  }
  
  /**
   * Register a custom grid style
   */
  static registerGridStyle(type: GridType | string, style: IGridStyle): void {
    this.gridStyles.set(type as GridType, style);
  }
  
  /**
   * Get available grid types
   */
  static getAvailableTypes(): string[] {
    return Array.from(this.gridStyles.keys());
  }
  
  /**
   * Dispose of a specific grid style's resources
   */
  static disposeGridStyle(type: GridType): void {
    const gridStyle = this.gridStyles.get(type);
    if (gridStyle && gridStyle.dispose) {
      gridStyle.dispose();
    }
  }
}