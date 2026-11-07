import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const root = resolve(import.meta.dirname, "..");
function workerHarness() {
  const listeners: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const url = (value: any) =>
    new URL(
      typeof value === "string" ? value : value.url,
      "https://scripture.test",
    ).href;
  const network = vi.fn(
    async () => new Response("network chapter", { status: 200 }),
  );
  const cacheApi = {
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        addAll: vi.fn(async (paths: string[]) => {
          for (const path of paths)
            store.set(url(path), new Response("precache " + path));
        }),
        put: vi.fn(async (request: any, response: Response) => {
          store.set(url(request), response);
        }),
        match: vi.fn(async (request: any) => store.get(url(request))?.clone()),
      };
    }),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (request: any) => {
      for (const store of stores.values()) {
        const hit = store.get(url(request));
        if (hit) return hit.clone();
      }
    }),
  };
  const skipWaiting = vi.fn(async () => {}),
    claim = vi.fn(async () => {});
  vm.runInNewContext(readFileSync(resolve(root, "public/sw.js"), "utf8"), {
    self: {
      addEventListener: (name: string, handler: any) => {
        listeners[name] = handler;
      },
      skipWaiting,
      clients: { claim },
    },
    caches: cacheApi,
    fetch: network,
    location: { origin: "https://scripture.test" },
    URL,
    Response,
  });
  async function lifecycle(name: string) {
    let work: Promise<any> | undefined;
    listeners[name]({
      waitUntil: (p: Promise<any>) => {
        work = p;
      },
    });
    await work;
  }
  async function request(
    path: string,
    options: { method?: string; mode?: string } = {},
  ) {
    let answer: Promise<Response> | undefined;
    listeners.fetch({
      request: {
        url: url(path),
        method: options.method || "GET",
        mode: options.mode || "cors",
      },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    return answer ? await answer : undefined;
  }
  return { stores, network, cacheApi, skipWaiting, claim, lifecycle, request };
}

describe("installable offline application contract", () => {
  it("declares a standalone, scoped application with real install icons", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8"),
    );
    expect(manifest.name).toBe("Scripture Focus");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.icons.map((icon: any) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of manifest.icons) {
      const file = resolve(root, "public", icon.src.replace(/^\//, ""));
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
    expect(readFileSync(resolve(root, "src/main.tsx"), "utf8")).toMatch(/serviceWorker\.register\(['"]\/sw\.js['"]\)/);
  });
  it("installs app metadata and Bible catalog before claiming clients", async () => {
    const sw = workerHarness();
    await sw.lifecycle("install");
    const cache = [...sw.stores.values()][0];
    for (const path of [
      "/",
      "/manifest.webmanifest",
      "/icon-192.png",
      "/icon-512.png",
      "/bibles/index.json",
    ])
      expect(cache.has("https://scripture.test" + path)).toBe(true);
    expect(sw.skipWaiting).toHaveBeenCalledOnce();
    await sw.lifecycle("activate");
    expect(sw.claim).toHaveBeenCalledOnce();
  });
  it("leaves Bible chapter persistence exclusively to IndexedDB", async () => {
    const sw = workerHarness();await sw.lifecycle("install");
    for (const edition of ["KJV", "ASV", "BSB", "BLB"]) {
      const path = `/bibles/${edition}/1/1.json`;
      expect(await sw.request(path)).toBeUndefined();
      expect(await sw.cacheApi.match(path)).toBeUndefined();
    }
    expect(sw.network).not.toHaveBeenCalled();
  });
  it("returns a previously fetched static resource after the network disappears", async () => {
    const sw = workerHarness();await sw.lifecycle("install");
    expect(await (await sw.request("/help.json"))?.text()).toBe("network chapter");
    sw.network.mockRejectedValue(new Error("offline"));
    expect(await (await sw.request("/help.json"))?.text()).toBe("network chapter");
    expect(sw.network).toHaveBeenCalledTimes(1);
  });
  it("falls back to the cached app shell for offline navigation", async () => {
    const sw = workerHarness();
    await sw.lifecycle("install");
    sw.network.mockRejectedValue(new Error("offline"));
    const response = await sw.request("/read", { mode: "navigate" });
    expect(await response?.text()).toBe("precache /");
  });
  it("never uses a previous worker version shell during offline navigation", async () => {
    const sw = workerHarness();
    sw.stores.set("scripture-focus-old-version", new Map([["https://scripture.test/",new Response("old shell")]]));
    await sw.lifecycle("install");sw.network.mockRejectedValue(new Error("offline"));
    expect(await (await sw.request("/read",{mode:"navigate"}))?.text()).toBe("precache /");
    await sw.lifecycle("activate");expect(sw.stores.has("scripture-focus-old-version")).toBe(false);
  });
  it("preserves caches owned by other applications on the same origin", async () => {
    const sw = workerHarness();sw.stores.set("another-app",new Map());
    await sw.lifecycle("install");await sw.lifecycle("activate");
    expect(sw.stores.has("another-app")).toBe(true);
  });
  it("reports a missing offline resource as an error instead of substituting Scripture", async () => {
    const sw = workerHarness();
    await sw.lifecycle("install");
    sw.network.mockRejectedValue(new Error("offline"));
    expect((await sw.request("/unavailable-metadata.json"))?.type).toBe("error");
  });
  it("does not intercept writes or requests to external origins", async () => {
    const sw = workerHarness();
    expect(await sw.request("/backup", { method: "POST" })).toBeUndefined();
    expect(await sw.request("https://other.test/bible.json")).toBeUndefined();
    expect(sw.network).not.toHaveBeenCalled();
  });
  it("does not cache a failed download as an available chapter", async () => {
    const sw = workerHarness();
    await sw.lifecycle("install");
    sw.network.mockResolvedValue(new Response("not found", { status: 404 }));
    expect((await sw.request("/missing.json"))?.status).toBe(404);
    await Promise.resolve();
    await Promise.resolve();
    expect(await sw.cacheApi.match("/missing.json")).toBeUndefined();
  });
  it("production packager precaches every emitted entry script and stylesheet", () => {
    const input = new Map([
      [
        "dist/manifest.webmanifest",
        JSON.stringify({display:"standalone",start_url:"/",scope:"/",icons:[{src:"/icon-192.png",sizes:"192x192"},{src:"/icon-512.png",sizes:"512x512"}]}),
      ],
      [
        "dist/index.html",
        '<script type="module" src="/assets/reader-a1b2.js"></script><link rel="stylesheet" href="/assets/styles-c3d4.css">',
      ],
      ["dist/sw.js", readFileSync(resolve(root, "public/sw.js"), "utf8").replace(/'/g, '"')],
    ]);
    const output = new Map<string, string>();
    const fs = {
      readFileSync: (path: string) => input.get(path),
      existsSync: (path: string) => ["dist/icon-192.png","dist/icon-512.png"].includes(path),
      readdirSync: (path: string) => path === "dist/assets" ? ["reader-a1b2.js","styles-c3d4.css","lazy-chunk-e5f6.js"].map(name => ({name,isDirectory:()=>false})) : [],
      writeFileSync: (path: string, data: string) => output.set(path, data),
    };
    const script = readFileSync(
      resolve(root, "scripts/check-pwa.mjs"),
      "utf8",
    ).replace(/import fs from ['"]node:fs['"];?/, "");
    vm.runInNewContext(script, { fs, console: { log: () => {} } });
    const worker = output.get("dist/sw.js")!;
    expect(worker).toContain("/assets/reader-a1b2.js");
    expect(worker).toContain("/assets/styles-c3d4.css");
    expect(worker).toContain("/assets/lazy-chunk-e5f6.js");
    expect(worker).not.toContain("scripture-focus-v1");
  });
});
