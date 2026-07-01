import { resolveControlsUI } from '../controlsUIConfig';

describe('resolveControlsUI', () => {
  it('is disabled when omitted or false (opt-in)', () => {
    expect(resolveControlsUI(undefined).enabled).toBe(false);
    expect(resolveControlsUI(false).enabled).toBe(false);
  });

  it('enables every piece for true', () => {
    const r = resolveControlsUI(true);
    expect(r).toMatchObject({
      enabled: true,
      toolbar: true,
      interactionModes: true,
      screenshot: true,
      fullscreen: true,
      modelBadge: true,
      settings: true,
      theme: 'dark',
    });
  });

  it('enables the overlay and toggles individual pieces from an object', () => {
    const r = resolveControlsUI({ screenshot: false, settings: false, theme: 'light' });
    expect(r.enabled).toBe(true);
    expect(r.screenshot).toBe(false);
    expect(r.settings).toBe(false);
    expect(r.toolbar).toBe(true); // default on
    expect(r.theme).toBe('light');
  });

  it('honors enabled:false inside an object', () => {
    expect(resolveControlsUI({ enabled: false }).enabled).toBe(false);
  });
});
