export class VoiceStageTimeoutError extends Error {
  constructor(message = "The voice command stage timed out.") {
    super(message);
    this.name = "VoiceStageTimeoutError";
  }
}

export interface VoiceStageDeadlineOptions {
  onTimeout?: () => void;
  signal?: AbortSignal;
  timeoutMessage?: string;
  timeoutMs: number;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Enforces a hard caller-visible deadline even when an Electron navigation or
 * script promise does not settle after its AbortSignal is cancelled.
 */
export async function runVoiceStageWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: VoiceStageDeadlineOptions
): Promise<T> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new TypeError("A positive voice stage timeout is required.");
  }
  options.signal?.throwIfAborted();

  const controller = new AbortController();
  let timeout: NodeJS.Timeout | null = null;
  let handleParentAbort: (() => void) | null = null;
  let boundarySettled = false;
  const boundary = new Promise<never>((_resolve, reject) => {
    const rejectBoundary = (reason: unknown) => {
      if (boundarySettled) return;
      boundarySettled = true;
      reject(reason);
    };
    handleParentAbort = () => {
      const reason = options.signal === undefined
        ? new DOMException("The operation was aborted.", "AbortError")
        : abortReason(options.signal);
      controller.abort(reason);
      rejectBoundary(reason);
    };
    options.signal?.addEventListener("abort", handleParentAbort, { once: true });
    timeout = setTimeout(() => {
      const error = new VoiceStageTimeoutError(options.timeoutMessage);
      try {
        options.onTimeout?.();
      } catch {
        // Cleanup hooks cannot be allowed to defeat the caller-visible bound.
      }
      controller.abort(error);
      rejectBoundary(error);
    }, options.timeoutMs);
    timeout.unref?.();
  });
  const task = Promise.resolve().then(() => operation(controller.signal));

  try {
    return await Promise.race([task, boundary]);
  } finally {
    boundarySettled = true;
    if (timeout !== null) clearTimeout(timeout);
    if (handleParentAbort !== null) {
      options.signal?.removeEventListener("abort", handleParentAbort);
    }
  }
}
