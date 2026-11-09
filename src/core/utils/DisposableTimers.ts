export class DisposableTimers {
  private readonly pending: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(private readonly isDisposed: () => boolean) {}

  schedule(callback: () => void, delayMs: number): void {
    const id = setTimeout(() => {
      this.pending.delete(id);
      if (this.isDisposed()) {
        return;
      }
      callback();
    }, delayMs);
    this.pending.add(id);
  }

  cancelAll(): void {
    this.pending.forEach((id) => clearTimeout(id));
    this.pending.clear();
  }
}
