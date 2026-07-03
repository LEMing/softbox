import { renderHook, act } from '@testing-library/react';
import { usePickedPreset } from '../usePickedPreset';
import { ViewerPreset } from '../../../types/options';

describe('usePickedPreset', () => {
  it('starts on the consumer preset with the picker off', () => {
    const { result } = renderHook(() => usePickedPreset('studio', undefined));
    expect(result.current.activePreset).toBe('studio');
    expect(result.current.pickerEnabled).toBe(false);
  });

  it('enables the picker via ui.presets and reports picks', () => {
    const onPresetChange = jest.fn();
    const { result } = renderHook(() =>
      usePickedPreset('studio', { presets: true, onPresetChange })
    );
    expect(result.current.pickerEnabled).toBe(true);

    act(() => result.current.selectPreset('dark'));

    expect(result.current.activePreset).toBe('dark');
    expect(onPresetChange).toHaveBeenCalledWith('dark');
  });

  it('lets a genuine consumer change win over a pick', () => {
    const { result, rerender } = renderHook(
      ({ consumer }: { consumer: ViewerPreset }) => usePickedPreset(consumer, { presets: true }),
      { initialProps: { consumer: 'studio' as ViewerPreset } }
    );
    act(() => result.current.selectPreset('dark'));
    expect(result.current.activePreset).toBe('dark');

    rerender({ consumer: 'product' });
    expect(result.current.activePreset).toBe('product');
  });

  it('consumes an async echo of an older pick without reverting a newer one', () => {
    const onPresetChange = jest.fn();
    const { result, rerender } = renderHook(
      ({ consumer }: { consumer: string }) =>
        usePickedPreset(consumer as never, { presets: true, onPresetChange }),
      { initialProps: { consumer: 'studio' } }
    );

    act(() => result.current.selectPreset('dark'));
    act(() => result.current.selectPreset('outdoor'));

    // The echo of the FIRST pick lands after the second — must not revert.
    rerender({ consumer: 'dark' });
    expect(result.current.activePreset).toBe('outdoor');

    rerender({ consumer: 'outdoor' });
    expect(result.current.activePreset).toBe('outdoor');
  });

  it('clears the pick when the picker is turned off', () => {
    const { result, rerender } = renderHook(
      ({ ui }: { ui: { presets: boolean } }) => usePickedPreset('studio', ui),
      { initialProps: { ui: { presets: true } } }
    );
    act(() => result.current.selectPreset('dark'));
    expect(result.current.activePreset).toBe('dark');

    rerender({ ui: { presets: false } });
    expect(result.current.activePreset).toBe('studio');
  });
});
