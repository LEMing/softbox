import { resolveLoadingIndicator } from '../loadingIndicatorConfig';

describe('resolveLoadingIndicator', () => {
  it('enables the default overlay when omitted', () => {
    const r = resolveLoadingIndicator(undefined);
    expect(r.enabled).toBe(true);
    expect(r.label).toBe('Loading…');
    expect(r.color).toBe('#ffffff');
    expect(r.backdrop).toContain('rgba');
  });

  it('enables the default overlay for true', () => {
    expect(resolveLoadingIndicator(true).enabled).toBe(true);
  });

  it('disables the overlay for false (keeping defaults for the rest)', () => {
    const r = resolveLoadingIndicator(false);
    expect(r.enabled).toBe(false);
    expect(r.label).toBe('Loading…');
  });

  it('applies object overrides and falls back per-field', () => {
    const r = resolveLoadingIndicator({ label: 'Загрузка', color: '#222' });
    expect(r.enabled).toBe(true);
    expect(r.label).toBe('Загрузка');
    expect(r.color).toBe('#222');
    expect(r.backdrop).toContain('rgba'); // default kept
  });

  it('honors enabled:false inside an object', () => {
    expect(resolveLoadingIndicator({ enabled: false }).enabled).toBe(false);
  });

  it('carries the optional errorLabel through', () => {
    expect(resolveLoadingIndicator({ errorLabel: 'Oops' }).errorLabel).toBe('Oops');
  });
});
