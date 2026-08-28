import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  readVoiceBody,
  runVoiceOperationWithDeadline,
  VoiceOperationTimeoutError
} from "../src/main/remote/phone-remote-server";
import { VoiceOperationCancelledError } from "../src/main/remote/voice-operation-registry";

function incoming(stream: PassThrough): IncomingMessage {
  return stream as unknown as IncomingMessage;
}

describe("phone voice upload body", () => {
  it("reads a completed bounded upload", async () => {
    const stream = new PassThrough();
    const result = readVoiceBody(incoming(stream), 100);
    stream.end(Buffer.from([1, 2, 3]));

    await expect(result).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects and destroys an upload that never finishes", async () => {
    const stream = new PassThrough();

    await expect(readVoiceBody(incoming(stream), 10)).rejects.toThrow(
      "Voice upload body timed out"
    );
    expect(stream.destroyed).toBe(true);
  });

  it("aborts and releases a voice operation that never settles", async () => {
    let operationSignal: AbortSignal | null = null;
    const operation = runVoiceOperationWithDeadline((signal) => {
      operationSignal = signal;
      return new Promise<never>(() => undefined);
    }, 10);

    await expect(operation).rejects.toBeInstanceOf(VoiceOperationTimeoutError);
    expect(operationSignal?.aborted).toBe(true);
  });

  it("releases an uncooperative operation when its owning controller cancels", async () => {
    const controller = new AbortController();
    const operation = runVoiceOperationWithDeadline(
      () => new Promise<never>(() => undefined),
      5_000,
      controller
    );

    controller.abort(new VoiceOperationCancelledError());
    await expect(operation).rejects.toBeInstanceOf(VoiceOperationCancelledError);
  });

  it("destroys and releases a pending upload body when its operation cancels", async () => {
    const stream = new PassThrough();
    const controller = new AbortController();
    const body = readVoiceBody(incoming(stream), 5_000, controller.signal);

    controller.abort(new VoiceOperationCancelledError());
    await expect(body).rejects.toBeInstanceOf(VoiceOperationCancelledError);
    expect(stream.destroyed).toBe(true);
  });
});
