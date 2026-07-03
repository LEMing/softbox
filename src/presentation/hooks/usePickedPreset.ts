import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewerPreset, UIOptions } from '../../types/options';

export interface PickedPreset {
  /** The preset in effect now — a picked one, or the consumer's. */
  activePreset: ViewerPreset | undefined;
  /** Whether the built-in picker chips should render. */
  pickerEnabled: boolean;
  /** Select a preset from the built-in picker (also notifies `ui.onPresetChange`). */
  selectPreset: (preset: ViewerPreset) => void;
}

/**
 * The built-in preset picker's selection state machine, lifted out of
 * SimpleViewer. A preset picked in the picker overrides the consumer's
 * `preset` until the consumer changes theirs. Picks reported via
 * `ui.onPresetChange` may be echoed back into `consumerPreset` asynchronously
 * (persisted, then re-rendered); an echo of an older pick must not clobber a
 * newer one, so reported picks are tracked and their echoes consumed instead
 * of being treated as a genuine consumer change. Hiding the picker hands the
 * look back to the consumer's preset.
 */
export function usePickedPreset(
  consumerPreset: ViewerPreset | undefined,
  ui: UIOptions | undefined
): PickedPreset {
  const [pickedPreset, setPickedPreset] = useState<ViewerPreset | null>(null);
  const reportedPicksRef = useRef<Set<ViewerPreset>>(new Set());

  useEffect(() => {
    if (consumerPreset !== undefined && reportedPicksRef.current.has(consumerPreset)) {
      reportedPicksRef.current.delete(consumerPreset);
      // Echo of the current pick: the consumer caught up, hand control back.
      setPickedPreset((picked) => (picked === consumerPreset ? null : picked));
      return;
    }
    reportedPicksRef.current.clear();
    setPickedPreset(null);
  }, [consumerPreset]);

  const pickerEnabled = Boolean(ui?.presets);
  useEffect(() => {
    if (!pickerEnabled) {
      reportedPicksRef.current.clear();
      setPickedPreset(null);
    }
  }, [pickerEnabled]);

  const onPresetChange = ui?.onPresetChange;
  const selectPreset = useCallback(
    (next: ViewerPreset) => {
      setPickedPreset(next);
      if (onPresetChange) {
        reportedPicksRef.current.add(next);
        onPresetChange(next);
      }
    },
    [onPresetChange]
  );

  return {
    activePreset: pickedPreset ?? consumerPreset,
    pickerEnabled,
    selectPreset,
  };
}
