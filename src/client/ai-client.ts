export type TutorRequest = { requestId: string; signal: AbortSignal };

/** Call invalidate for input, snapshot, step, or clarification-round changes. */
export class TutorRequestGuard {
  private pending: { requestId: string; contentRevision: number; controller: AbortController } | null = null;

  start(contentRevision: number): TutorRequest | null {
    if (this.pending?.contentRevision === contentRevision) return null;
    this.invalidate();
    const controller = new AbortController();
    const requestId = crypto.randomUUID();
    this.pending = { requestId, contentRevision, controller };
    return { requestId, signal: controller.signal };
  }

  accept(requestId: string, contentRevision: number): boolean {
    return this.pending?.requestId === requestId && this.pending.contentRevision === contentRevision;
  }

  finish(requestId: string): void {
    if (this.pending?.requestId === requestId) this.pending = null;
  }

  invalidate(): void {
    this.pending?.controller.abort();
    this.pending = null;
  }
}
