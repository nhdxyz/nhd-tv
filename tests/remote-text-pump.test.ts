import { describe, expect, it } from "vitest";
import { createLatestRemoteTextPump } from "../src/main/remote-text-pump";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve = () => undefined;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("remote text pump", () => {
  it("keeps one request in flight and sends only the latest queued value", async () => {
    const requests: Array<{ deferred: Deferred; submit: boolean; text: string }> = [];
    const pump = createLatestRemoteTextPump((text, submit) => {
      const request = { deferred: deferred(), submit, text };
      requests.push(request);
      return request.deferred.promise;
    });

    pump.enqueue("b", false);
    pump.enqueue("br", false);
    pump.enqueue("breaking", false);

    expect(requests.map(({ text }) => text)).toEqual(["b"]);
    requests[0]?.deferred.resolve();
    await Promise.resolve();

    expect(requests.map(({ text }) => text)).toEqual(["b", "breaking"]);
    requests[1]?.deferred.resolve();
    await pump.whenIdle();
  });

  it("queues submit behind an in-flight write and never downgrades it", async () => {
    const requests: Array<{ deferred: Deferred; submit: boolean; text: string }> = [];
    const pump = createLatestRemoteTextPump((text, submit) => {
      const request = { deferred: deferred(), submit, text };
      requests.push(request);
      return request.deferred.promise;
    });

    pump.enqueue("bre", false);
    pump.enqueue("breaking bad", true);
    pump.enqueue("breaking ba", false);

    requests[0]?.deferred.resolve();
    await Promise.resolve();

    expect(requests.map(({ submit, text }) => ({ submit, text }))).toEqual([
      { submit: false, text: "bre" },
      { submit: true, text: "breaking bad" }
    ]);
    requests[1]?.deferred.resolve();
    await pump.whenIdle();
  });

  it("continues with the newest value after a failed request", async () => {
    const errors: unknown[] = [];
    const sends: string[] = [];
    let rejectFirst: (error: Error) => void = () => undefined;
    const first = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const pump = createLatestRemoteTextPump((text) => {
      sends.push(text);
      return sends.length === 1 ? first : Promise.resolve();
    }, (error) => errors.push(error));

    pump.enqueue("old", false);
    pump.enqueue("current", false);
    rejectFirst(new Error("temporary failure"));
    await pump.whenIdle();

    expect(sends).toEqual(["old", "current"]);
    expect(errors).toHaveLength(1);
  });
});
