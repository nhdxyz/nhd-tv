import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleWatchCache } from "../src/main/voice/google-watch-cache";

const electron = vi.hoisted(() => {
  const fetch = vi.fn();
  const windows: FakeBrowserWindow[] = [];

  class FakeWebContents {
    destroyed = false;
    executeJavaScript = vi.fn(() => new Promise<never>(() => undefined));
    isDestroyed = vi.fn(() => this.destroyed);
    on = vi.fn();
    removeListener = vi.fn();
    setWindowOpenHandler = vi.fn();
    stop = vi.fn();
  }

  class FakeBrowserWindow {
    destroyed = false;
    webContents = new FakeWebContents();

    constructor() {
      windows.push(this);
    }

    destroy(): void {
      this.destroyed = true;
      this.webContents.destroyed = true;
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    loadURL = vi.fn(() => Promise.resolve());
  }

  return {
    BrowserWindow: FakeBrowserWindow,
    fetch,
    fromPartition: vi.fn(() => ({
      fetch,
      preconnect: vi.fn()
    })),
    windows
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electron.BrowserWindow,
  session: { fromPartition: electron.fromPartition }
}));

import { GoogleWatchResolver } from "../src/main/voice/google-watch-resolver";

const lookup = {
  countryCode: "US",
  episodeNumber: null,
  mediaType: "show",
  queryText: "Breaking Bad",
  requestedTitle: "Breaking Bad",
  seasonNumber: null
};

function cache(): GoogleWatchCache {
  return {
    getFresh: vi.fn(() => null),
    save: vi.fn()
  } as unknown as GoogleWatchCache;
}

beforeEach(() => {
  electron.fetch.mockReset();
  electron.fetch.mockImplementation(async () => new Response(
    "<div>Where to watch https://www.netflix.com</div>",
    { status: 200 }
  ));
  electron.fromPartition.mockClear();
  electron.windows.splice(0);
});

describe("Google watch resolver cancellation", () => {
  it("settles immediately when an Electron renderer call ignores the deadline", async () => {
    const resolver = new GoogleWatchResolver({ cache: cache() });
    const controller = new AbortController();
    const resolution = resolver.resolve(lookup, { signal: controller.signal });

    await vi.waitFor(() => {
      expect(electron.windows[0]?.webContents.executeJavaScript).toHaveBeenCalled();
    });
    const timeout = new DOMException("Discovery timed out.", "TimeoutError");
    controller.abort(timeout);

    await expect(resolution).rejects.toBe(timeout);
    expect(electron.windows).toHaveLength(2);
    expect(electron.windows.every((window) => window.destroyed)).toBe(true);
  });

  it("does not cancel active browser work when only a queued lookup is aborted", async () => {
    const resolver = new GoogleWatchResolver({ cache: cache() });
    const activeController = new AbortController();
    const queuedController = new AbortController();
    const active = resolver.resolve(lookup, { signal: activeController.signal });

    await vi.waitFor(() => {
      expect(electron.windows[0]?.webContents.executeJavaScript).toHaveBeenCalled();
    });
    const queued = resolver.resolve(
      { ...lookup, queryText: "Apollo 13 movie" },
      { signal: queuedController.signal }
    );
    const queuedTimeout = new DOMException("Queued lookup timed out.", "TimeoutError");
    queuedController.abort(queuedTimeout);

    await expect(queued).rejects.toBe(queuedTimeout);
    expect(electron.windows.every((window) => !window.destroyed)).toBe(true);

    const activeTimeout = new DOMException("Active lookup timed out.", "TimeoutError");
    activeController.abort(activeTimeout);
    await expect(active).rejects.toBe(activeTimeout);
    expect(electron.windows.every((window) => window.destroyed)).toBe(true);
  });
});
