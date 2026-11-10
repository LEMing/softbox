export class HexTileConfig {
  private static readonly HEIGHT_RATIO = 0.075;
  private static readonly BEVEL_RATIO = 0.04;
  private static readonly GAP_FACTOR = 1.05;

  static getHeight(tileSize: number): number {
    return tileSize * this.HEIGHT_RATIO;
  }

  static getBevelSize(tileSize: number): number {
    return tileSize * this.BEVEL_RATIO;
  }

  static getBevelThickness(tileSize: number): number {
    return this.getBevelSize(tileSize);
  }

  static getBaseSize(tileSize: number): number {
    return tileSize + this.getBevelSize(tileSize) + this.getBevelThickness(tileSize);
  }

  static getGapFactor(): number {
    return this.GAP_FACTOR;
  }

  static getGridSpacing(tileSize: number): { width: number; height: number } {
    const baseSize = this.getBaseSize(tileSize);
    const gapFactor = this.getGapFactor();

    return {
      width: Math.sqrt(3) * baseSize * gapFactor,
      height: 2 * baseSize * gapFactor
    };
  }

  static getYPosition(tileSize: number): number {
    return -this.getBevelSize(tileSize);
  }
}
