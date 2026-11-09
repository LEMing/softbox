export const deferToNextFrame = (callback: () => void): void => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() =>
      setTimeout(() => requestAnimationFrame(() => setTimeout(callback, 0)), 0)
    );
  } else {
    setTimeout(callback, 0);
  }
};
