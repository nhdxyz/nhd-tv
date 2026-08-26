export interface RemoteTextPump {
  enqueue: (text: string, submit: boolean) => void;
  whenIdle: () => Promise<void>;
}

interface PendingRemoteText {
  submit: boolean;
  text: string;
}

/**
 * Serializes full-value text updates and drops superseded queued values.
 *
 * Phone keyboards can emit input faster than a local-network round trip. Sending
 * every value concurrently lets an older response overwrite a newer one on the
 * television. This pump keeps one request in flight and only retains the latest
 * value that still needs to be sent.
 */
export function createLatestRemoteTextPump(
  send: (text: string, submit: boolean) => Promise<void>,
  onError: (error: unknown) => void = () => undefined
): RemoteTextPump {
  let inFlight = false;
  let pending: PendingRemoteText | null = null;
  let idleWaiters: Array<() => void> = [];

  const resolveIdle = () => {
    if (inFlight || pending !== null) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  };

  const drain = async () => {
    if (inFlight || pending === null) return;
    const next = pending;
    pending = null;
    inFlight = true;

    try {
      await send(next.text, next.submit);
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
      if (pending !== null) {
        void drain();
      } else {
        resolveIdle();
      }
    }
  };

  return {
    enqueue(text, submit) {
      // Once Submit is queued, ordinary input events must not downgrade it.
      if (pending?.submit === true && !submit) return;
      pending = { submit, text };
      void drain();
    },
    whenIdle() {
      if (!inFlight && pending === null) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    }
  };
}
