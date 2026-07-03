import { renderHook } from '@testing-library/react';
import { useResolvedOptions } from '../useResolvedOptions';
import defaultOptions from '../../../defaultOptions';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';

describe('useResolvedOptions', () => {
  it('returns the same reference when no shorthand applies', () => {
    const options: SimpleViewerOptions = { backgroundColor: '#fff' };
    const { result } = renderHook(() =>
      useResolvedOptions(options, undefined, undefined, undefined)
    );
    expect(result.current).toBe(options);
  });

  it('folds the active preset when it differs from options.preset', () => {
    const options: SimpleViewerOptions = {};
    const { result } = renderHook(() => useResolvedOptions(options, 'dark', undefined, undefined));
    expect(result.current.preset).toBe('dark');
  });

  it('folds pathTraced over the default tuning, keeping a partial options.pathTracing', () => {
    const options: SimpleViewerOptions = { pathTracing: { maxSamples: 64 } };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, true, undefined));
    expect(result.current.pathTracing).toEqual({
      ...defaultOptions.pathTracing,
      maxSamples: 64,
      enabled: true,
    });
  });

  it('lets an explicit pathTracing.enabled win over the prop', () => {
    const options: SimpleViewerOptions = { pathTracing: { enabled: false } };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, true, undefined));
    expect(result.current.pathTracing).toEqual({ enabled: false });
  });

  it('folds turntable into controls.autoRotate, keeping other controls fields', () => {
    const options: SimpleViewerOptions = { controls: { enablePan: false } };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, undefined, true));
    expect(result.current.controls).toEqual({ enablePan: false, autoRotate: true });
  });

  it('folds turntable=false so a prop toggle-off stops the rotation', () => {
    const options: SimpleViewerOptions = {};
    const { result } = renderHook(() => useResolvedOptions(options, undefined, undefined, false));
    expect(result.current.controls).toEqual({ autoRotate: false });
  });

  it('lets an explicit controls.autoRotate win over the turntable prop', () => {
    const options: SimpleViewerOptions = { controls: { autoRotate: false } };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, undefined, true));
    expect(result.current).toBe(options);
  });
});
