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
  static logMemoryUsage(_label: string = 'Memory'): void {
    const info = this.getMemoryInfo();
    if (info) {
      // Memory info available but not logged
      if (info.webglMemory) {
        // WebGL memory info available but not logged
      }
    } else {
      // Memory info not available
    }
  }
  
  /**
   * Monitor memory usage over time
   */
  static startMonitoring(intervalMs: number = 5000, _label: string = 'MemoryMonitor'): () => void {
    const interval = setInterval(() => {
      // Monitoring is active but not logging
      this.getMemoryInfo();
    }, intervalMs);
    
    return () => clearInterval(interval);
  }
}