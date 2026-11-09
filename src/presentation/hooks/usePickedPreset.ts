import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewerPreset, UIOptions } from '../../types/options';

export interface PickedPreset {
  activePreset: ViewerPreset | undefined;
  pickerEnabled: boolean;
  selectPreset: (preset: ViewerPreset) => void;
}

export function usePickedPreset(
  consumerPreset: ViewerPreset | undefined,
  ui: UIOptions | undefined
): PickedPreset {
  const [pickedPreset, setPickedPreset] = useState<ViewerPreset | null>(null);
  const reportedPicksRef = useRef<Set<ViewerPreset>>(new Set());

  useEffect(() => {
    if (consumerPreset !== undefined && reportedPicksRef.current.has(consumerPreset)) {
      reportedPicksRef.current.delete(consumerPreset);
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
