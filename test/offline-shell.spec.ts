import { describe, expect, it, vi } from "vitest";
import { offlineShellSource } from "../scripts/offline-shell";

describe("offline app shell", () => {
  it("serves a cached navigation without waiting for the network", async () => {
    let fetchHandler: ((event: { request: Request; respondWith: (value: Promise<Response>) => void }) => void) | undefined;
    const shell = new Response("cached app");
    const cache = { match: vi.fn().mockResolvedValue(shell) };
    const networkFetch = vi.fn(() => new Promise<Response>(() => {}));
    const worker = {
      location: { origin: "https://kids.example" },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener: vi.fn((type: string, handler: typeof fetchHandler) => {
        if (type === "fetch") fetchHandler = handler;
      }),
    };
    const cachesApi = {
      open: vi.fn().mockResolvedValue(cache),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      match: vi.fn(),
    };

    new Function("self", "caches", "fetch", offlineShellSource(["/assets/app.js"]))(worker, cachesApi, networkFetch);
    expect(fetchHandler).toBeTypeOf("function");

    let responsePromise: Promise<Response> | undefined;
    fetchHandler?.({
      request: {
        url: "https://kids.example/category/deepeng",
        method: "GET",
        mode: "navigate",
        destination: "document",
      } as Request,
      respondWith: (value) => { responsePromise = value; },
    });

    await expect(responsePromise).resolves.toBe(shell);
    expect(networkFetch).not.toHaveBeenCalled();
  });
});
