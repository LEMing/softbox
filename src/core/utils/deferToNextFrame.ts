/**
 * Defers work until after the next TWO painted frames (default deferral for
 * heavy one-off work like the contact-shadow bake).
 *
 * rAF fires just BEFORE a paint; a macrotask queued from inside it runs just
 * AFTER that paint. Two hops guarantee two painted frames before the callback
 * blocks the thread: the UI update the caller is protecting (e.g. the loading
 * overlay unmounting) is committed by a task already queued ahead of the first
 * hop, so the second frame paints WITHOUT it — one hop would let a slow
 * synchronous callback hold that very paint hostage, which is exactly the
 * stall this deferral exists to prevent. Falls back to a plain macrotask where
 * rAF doesn't exist (SSR, workers).
 */
export const deferToNextFrame = (callback: () => void): void => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() =>
      setTimeout(() => requestAnimationFrame(() => setTimeout(callback, 0)), 0)
    );
  } else {
    setTimeout(callback, 0);
  }
};
