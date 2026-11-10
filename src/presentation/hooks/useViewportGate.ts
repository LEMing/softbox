import { useEffect, useState } from 'react';

const PRELOAD_MARGIN = '200px';

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
