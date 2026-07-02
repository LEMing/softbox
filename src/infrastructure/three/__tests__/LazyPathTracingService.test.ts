import { LazyPathTracingService } from '../LazyPathTracingService';
import { IPathTracingOptions } from '../../../core/services/IPathTracingService';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { Result } from '../../../utils/Result';
import { IRenderer } from '../../../core/interfaces';

const innerInstances: MockInner[] = [];

class MockInner {
  events = new TypedEventEmitter<{ 'pathtracing:paused': { samples: number } }>();
  initialize = jest.fn(async () => Result.ok(undefined));
  setEnabled = jest.fn();
  updateSettings = jest.fn();
  render = jest.fn(async () => Result.ok(undefined));
  getSampleCount = jest.fn(() => 7);
  isEnabled = jest.fn(() => true);
  isPathTracerDisposed = jest.fn(() => false);
  reset = jest.fn();
  dispose = jest.fn();
  isSupported = jest.fn(() => true);

  constructor() {
    innerInstances.push(this);
  }
}

jest.mock('../ThreePathTracingService', () => ({
  get ThreePathTracingService() {
    return MockInner;
  },
}));

const initOptions = (): IPathTracingOptions => ({
  enabled: true,
  renderer: {} as IRenderer,
});

beforeEach(() => {
  innerInstances.length = 0;
});

describe('LazyPathTracingService', () => {
  it('is a safe idle tracer before initialization', async () => {
    const service = new LazyPathTracingService();

    expect(service.getSampleCount()).toBe(0);
    expect(service.isEnabled()).toBe(false);
    expect(service.isPathTracerDisposed()).toBe(false);
    expect(service.isSupported()).toBe(true);
    service.reset();
    const rendered = await service.render({} as never, {} as never);
    expect(rendered.ok).toBe(true);
    expect(innerInstances).toHaveLength(0);
  });

  it('loads the real service on initialize and delegates from then on', async () => {
    const service = new LazyPathTracingService();

    const result = await service.initialize(initOptions());

    expect(result.ok).toBe(true);
    expect(innerInstances).toHaveLength(1);
    const inner = innerInstances[0];
    expect(inner.initialize).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));

    expect(service.getSampleCount()).toBe(7);
    expect(service.isEnabled()).toBe(true);
    service.reset();
    expect(inner.reset).toHaveBeenCalled();
  });

  it('replays settings and enablement buffered before the load finished', async () => {
    const service = new LazyPathTracingService();
    service.updateSettings({ samples: 32 });
    service.updateSettings({ bounces: 4 });
    service.setEnabled(false);

    await service.initialize(initOptions());

    const inner = innerInstances[0];
    expect(inner.updateSettings).toHaveBeenCalledWith({ samples: 32, bounces: 4 });
    expect(inner.setEnabled).toHaveBeenCalledWith(false);
  });

  it('re-emits the inner paused event', async () => {
    const service = new LazyPathTracingService();
    await service.initialize(initOptions());

    const onPaused = jest.fn();
    service.events.on('pathtracing:paused', onPaused);
    innerInstances[0].events.emit('pathtracing:paused', { samples: 12 });

    expect(onPaused).toHaveBeenCalledWith({ samples: 12 });
  });

  it('does not construct the inner service when disposed before the import resolves', async () => {
    const service = new LazyPathTracingService();
    const pending = service.initialize(initOptions());
    service.dispose();

    const result = await pending;

    expect(result.ok).toBe(true);
    expect(innerInstances).toHaveLength(0);
  });

  it('forwards dispose after initialization', async () => {
    const service = new LazyPathTracingService();
    await service.initialize(initOptions());

    service.dispose();

    expect(innerInstances[0].dispose).toHaveBeenCalled();
  });
});
