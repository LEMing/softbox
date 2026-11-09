export function bestEffort(action: () => void): void {
  try {
    action();
  } catch {
    return;
  }
}
