import { deriveModelName, downloadCanvasScreenshot, toggleFullscreen } from '../viewerActions';

describe('deriveModelName', () => {
  it('extracts the decoded file name from a URL', () => {
    expect(deriveModelName('https://example.com/a/b/Medieval%20Lamp.obj')).toBe('Medieval Lamp.obj');
  });

  it('uses the object name for a Three.js object', () => {
    expect(deriveModelName({ name: 'Lantern' })).toBe('Lantern');
  });

  it('falls back to "Model" for an unnamed object and undefined for null', () => {
    expect(deriveModelName({})).toBe('Model');
    expect(deriveModelName(null)).toBeUndefined();
  });
});

describe('downloadCanvasScreenshot', () => {
  it('reads the canvas and triggers a download', () => {
    const click = jest.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement;
    const createElement = jest.spyOn(document, 'createElement').mockReturnValue(anchor);
    const canvas = { toDataURL: jest.fn(() => 'data:image/png;base64,AAA') } as unknown as HTMLCanvasElement;

    downloadCanvasScreenshot(canvas, 'shot.png');

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(anchor.href).toBe('data:image/png;base64,AAA');
    expect(anchor.download).toBe('shot.png');
    expect(click).toHaveBeenCalled();
    createElement.mockRestore();
  });

  it('does nothing without a canvas', () => {
    expect(() => downloadCanvasScreenshot(null)).not.toThrow();
  });
});

describe('toggleFullscreen', () => {
  afterEach(() => {
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  it('requests fullscreen when none is active', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    const requestFullscreen = jest.fn();
    toggleFullscreen({ requestFullscreen } as unknown as HTMLElement);
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it('exits fullscreen when one is active', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: {}, configurable: true });
    const exit = jest.fn();
    (document as unknown as { exitFullscreen: () => void }).exitFullscreen = exit;
    toggleFullscreen({ requestFullscreen: jest.fn() } as unknown as HTMLElement);
    expect(exit).toHaveBeenCalled();
  });
});
