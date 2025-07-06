/**
 * Centralized configuration for hexagonal tile geometry
 * Following Single Responsibility and DRY principles
 */
export class HexTileConfig {
  // Base measurements as percentages of tile size
  private static readonly HEIGHT_RATIO = 0.075; // 7.5% of edge length
  private static readonly BEVEL_RATIO = 0.25; // 25% of edge length
  private static readonly GAP_FACTOR = 1.05; // 10% gap between tiles

  /**
   * Get tile height based on tile size
   */
  static getHeight(tileSize: number): number {
    return tileSize * this.HEIGHT_RATIO;
  }

  /**
   * Get bevel size based on tile size
   */
  static getBevelSize(tileSize: number): number {
    return tileSize * this.BEVEL_RATIO;
  }

  /**
   * Get bevel thickness (same as bevel size in our case)
   */
  static getBevelThickness(tileSize: number): number {
    return this.getBevelSize(tileSize);
  }

  /**
   * Calculate the effective base size of a tile including bevels
   * The bevel extends the tile footprint at the base
   */
  static getBaseSize(tileSize: number): number {
    // The bevel extends outward from the defined shape
    // Total extension is bevelSize + bevelThickness
    return tileSize + this.getBevelSize(tileSize) + this.getBevelThickness(tileSize);
  }

  /**
   * Get spacing multiplier for gaps between tiles
   */
  static getGapFactor(): number {
    return this.GAP_FACTOR;
  }

  /**
   * Calculate grid spacing dimensions
   */
  static getGridSpacing(tileSize: number): { width: number; height: number } {
    const baseSize = this.getBaseSize(tileSize);
    const gapFactor = this.getGapFactor();

    return {
      width: Math.sqrt(3) * baseSize * gapFactor,
      height: 2 * baseSize * gapFactor
    };
  }

  /**
   * Calculate Y position for tiles (below ground level)
   */
  static getYPosition(tileSize: number): number {
    return -(this.getHeight(tileSize) + this.getBevelSize(tileSize));
  }
}
