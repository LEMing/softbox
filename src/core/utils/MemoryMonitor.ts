/**
 * Utility to monitor WebGL and JavaScript memory usage
 */
export class MemoryMonitor {
  /**
   * Get current memory usage statistics
   */
  static getMemoryInfo(): {
    jsHeapUsed: number;
    jsHeapTotal: number;
    jsHeapLimit: number;
    webglMemory?: {
      programs: number;
      geometries: number;
      textures: number;
      renderLists: number;
    };
  } | null {
    // Check if performance.memory is available (Chrome only)
    const perf = performance as unknown as {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };
    if (!perf.memory) {
      return null;
    }
    
    return {
      jsHeapUsed: Math.round(perf.memory.usedJSHeapSize / 1048576), // MB
      jsHeapTotal: Math.round(perf.memory.totalJSHeapSize / 1048576), // MB
      jsHeapLimit: Math.round(perf.memory.jsHeapSizeLimit / 1048576), // MB
    };
  }
  
  /**
   * Format memory size for display
   */
  static formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }
  
  /**
   * Log memory usage to console
   */
  static logMemoryUsage(label: string = 'Memory'): void {
    const info = this.getMemoryInfo();
    if (info) {
      console.log(`[${label}] JS Heap: ${info.jsHeapUsed}MB / ${info.jsHeapTotal}MB (Limit: ${info.jsHeapLimit}MB)`);
      if (info.webglMemory) {
        console.log(`[${label}] WebGL - Programs: ${info.webglMemory.programs}, Geometries: ${info.webglMemory.geometries}, Textures: ${info.webglMemory.textures}`);
      }
    } else {
      console.log(`[${label}] Memory info not available (use Chrome with --enable-precise-memory-info)`);
    }
  }
  
  /**
   * Monitor memory usage over time
   */
  static startMonitoring(intervalMs: number = 5000, label: string = 'MemoryMonitor'): () => void {
    const interval = setInterval(() => {
      this.logMemoryUsage(label);
    }, intervalMs);
    
    return () => clearInterval(interval);
  }
}