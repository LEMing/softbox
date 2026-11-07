import { TypedEventEmitter } from '../EventEmitter';

interface TestEventMap {
  'test:event': { value: string };
  'test:number': { count: number };
  'test:empty': Record<string, never>;
}

describe('TypedEventEmitter', () => {
  let emitter: TypedEventEmitter<TestEventMap>;

  beforeEach(() => {
    emitter = new TypedEventEmitter<TestEventMap>();
  });

  describe('on', () => {
    it('should register event listener', () => {
      const listener = jest.fn();
      emitter.on('test:event', listener);
      
      emitter.emit('test:event', { value: 'test' });
      
      expect(listener).toHaveBeenCalledWith({ value: 'test' });
    });

    it('should handle multiple listeners for same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('test:event', listener1);
      emitter.on('test:event', listener2);
      
      emitter.emit('test:event', { value: 'test' });
      
      expect(listener1).toHaveBeenCalledWith({ value: 'test' });
      expect(listener2).toHaveBeenCalledWith({ value: 'test' });
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = emitter.on('test:event', listener);
      
      emitter.emit('test:event', { value: 'test1' });
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      emitter.emit('test:event', { value: 'test2' });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('should only trigger listener once', () => {
      const listener = jest.fn();
      emitter.once('test:event', listener);
      
      emitter.emit('test:event', { value: 'test1' });
      emitter.emit('test:event', { value: 'test2' });
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ value: 'test1' });
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = emitter.once('test:event', listener);
      
      unsubscribe();
      emitter.emit('test:event', { value: 'test' });
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should emit events to all listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('test:number', listener1);
      emitter.on('test:number', listener2);
      
      emitter.emit('test:number', { count: 42 });
      
      expect(listener1).toHaveBeenCalledWith({ count: 42 });
      expect(listener2).toHaveBeenCalledWith({ count: 42 });
    });

    it('should handle events with no listeners', () => {
      expect(() => {
        emitter.emit('test:event', { value: 'test' });
      }).not.toThrow();
    });

    it('should catch and log errors in listeners', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      emitter.on('test:event', errorListener);
      emitter.on('test:event', goodListener);
      
      emitter.emit('test:event', { value: 'test' });
      
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Error in event listener for test:event:',
        expect.any(Error)
      );
      
      consoleError.mockRestore();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      emitter.on('test:event', listener1);
      emitter.on('test:event', listener2);
      emitter.on('test:number', listener3);
      
      emitter.removeAllListeners('test:event');
      
      emitter.emit('test:event', { value: 'test' });
      emitter.emit('test:number', { count: 1 });
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should remove all listeners when no event specified', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('test:event', listener1);
      emitter.on('test:number', listener2);
      
      emitter.removeAllListeners();
      
      emitter.emit('test:event', { value: 'test' });
      emitter.emit('test:number', { count: 1 });
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return listener count for event', () => {
      expect(emitter.listenerCount('test:event')).toBe(0);
      
      const unsubscribe1 = emitter.on('test:event', jest.fn());
      expect(emitter.listenerCount('test:event')).toBe(1);
      
      emitter.on('test:event', jest.fn());
      expect(emitter.listenerCount('test:event')).toBe(2);
      
      unsubscribe1();
      expect(emitter.listenerCount('test:event')).toBe(1);
    });

    it('should return 0 for events with no listeners', () => {
      expect(emitter.listenerCount('test:empty')).toBe(0);
    });
  });
});