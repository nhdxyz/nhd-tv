import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  readVoiceBody,
  runVoiceOperationWithDeadline,
  VoiceOperationTimeoutError
} from "../src/main/remote/phone-remote-server";

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
});
