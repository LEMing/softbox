type EventListener<T> = (data: T) => void;

export class TypedEventEmitter<T> {
  private listeners = new Map<keyof T, Set<EventListener<unknown>>>();
  
  on<K extends keyof T>(
    event: K,
    listener: (data: T[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.add(listener as EventListener<unknown>);
    }
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener as EventListener<unknown>);
    };
  }
  
  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        (listener as EventListener<T[K]>)(data);
      } catch (error) {
        console.error(`Error in event listener for ${String(event)}:`, error);
      }
    });
  }
  
  once<K extends keyof T>(
    event: K,
    listener: (data: T[K]) => void
  ): () => void {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      listener(data);
    });
    return unsubscribe;
  }
  
  removeAllListeners(event?: keyof T): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
  
  listenerCount(event: keyof T): number {
    return this.listeners.get(event)?.size || 0;
  }
  
  /**
   * Alias for removing a listener (compatible with Node.js EventEmitter)
   */
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): void {
    this.listeners.get(event)?.delete(listener as EventListener<unknown>);
  }
  
  /**
   * Alias for on (compatible with Node.js EventEmitter)
   */
  removeListener<K extends keyof T>(event: K, listener: (data: T[K]) => void): void {
    this.off(event, listener);
  }
}