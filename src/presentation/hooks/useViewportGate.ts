import { useEffect, useState } from 'react';

/**
 * Start booting a little before the element actually scrolls into view, so
 * the viewer is usually painting by the time the user reaches it.
 */
const PRELOAD_MARGIN = '200px';

/**
 * Opens when the element first approaches the viewport; opens immediately
 * when gating is disabled or IntersectionObserver is unavailable (SSR,
 * legacy browsers) — a viewer that boots eagerly beats one that never boots.
 *
 * The gate LATCHES: once open it never closes, whatever `enabled` does
 * afterwards. Scrolling away — or flipping `loading` back to `'lazy'` — must
 * not tear down a running viewer.
 */
export function useViewportGate(
  targetRef: React.RefObject<Element | null>,
  enabled: boolean
): boolean {
  const [opened, setOpened] = useState(!enabled);

  useEffect(() => {
    if (opened) {
      return;
    }
    if (!enabled) {
      setOpened(true);
      return;
    }
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setOpened(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOpened(true);
        }
      },
      { rootMargin: PRELOAD_MARGIN }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef, enabled, opened]);

  return opened;
}
