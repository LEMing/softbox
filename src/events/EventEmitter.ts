export class TypedEventEmitter<T extends Record<string, any>> {
  private listeners = new Map<keyof T, Set<(data: any) => void>>();
  
  on<K extends keyof T>(
    event: K,
    listener: (data: T[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }
  
  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(data);
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
}