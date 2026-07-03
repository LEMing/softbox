import { renderHook } from '@testing-library/react';
import { useResolvedOptions } from '../useResolvedOptions';
import defaultOptions from '../../../defaultOptions';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';

describe('useResolvedOptions', () => {
  it('returns the same reference when no shorthand applies', () => {
    const options: SimpleViewerOptions = { backgroundColor: '#fff' };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, undefined));
    expect(result.current).toBe(options);
  });

  it('folds the active preset when it differs from options.preset', () => {
    const options: SimpleViewerOptions = {};
    const { result } = renderHook(() => useResolvedOptions(options, 'dark', undefined));
    expect(result.current.preset).toBe('dark');
  });

  it('folds pathTraced over the default tuning, keeping a partial options.pathTracing', () => {
    const options: SimpleViewerOptions = { pathTracing: { maxSamples: 64 } };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, true));
    expect(result.current.pathTracing).toEqual({
      ...defaultOptions.pathTracing,
      maxSamples: 64,
      enabled: true,
    });
  });

  it('lets an explicit pathTracing.enabled win over the prop', () => {
    const options: SimpleViewerOptions = { pathTracing: { enabled: false } };
    const { result } = renderHook(() => useResolvedOptions(options, undefined, true));
    expect(result.current.pathTracing).toEqual({ enabled: false });
  });
});
