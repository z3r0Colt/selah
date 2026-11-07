import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  chapter,
  clearData,
  database,
  downloadTranslation,
  exportData,
  get,
  importData,
  set,
  type Chapter,
} from "../src/store";

beforeEach(async () => {
  await clearData();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  (await database).close();
});

// Text below is test data, never a production Scripture source.
const fixture: Chapter = {
  translation: "KJV",
  book: 1,
  chapter: 1,
  verses: [
    { verse: 1, text: "Fixture word, another." },
    { verse: 3, text: "Source numbering retained." },
  ],
};

describe("private local reading data and backups", () => {
  it("round-trips saved word position, bookmarks, tags, notes and preferences through JSON export", async () => {
    const position = {
      translation: "ASV",
      book: 43,
      chapter: 3,
      verse: 16,
      index: 31,
    };
    const saved = [
      {
        id: "43:3:16",
        translation: "KJV",
        book: 43,
        chapter: 3,
        verse: 16,
        note: "Return to this passage.",
        tags: "review, family",
        highlight: true,
      },
    ];
    const settings = { wpm: 250, font: "Georgia", markers: true };
    await set("position", position);
    await set("saved", saved);
    await set("settings", settings);
    await set("reflection:43:3", "A private reflection.");
    const serialized = JSON.stringify(await exportData());
    await clearData();
    expect(await get("position")).toBeUndefined();
    await importData(JSON.parse(serialized));
    expect(await get("position")).toEqual(position);
    expect(await get("saved")).toEqual(saved);
    expect(await get("settings")).toEqual(settings);
    expect(await get("reflection:43:3")).toBe("A private reflection.");
  });

  it("validates all backup entry shapes before changing existing data", async () => {
    const original = {
      translation: "BSB",
      book: 19,
      chapter: 23,
      verse: 1,
      index: 0,
    };
    await set("position", original);
    for (const invalid of [
      null,
      { format: "other-app", version: 1, entries: [] },
      { format: "scripture-focus", version: 2, entries: [] },
      {
        format: "scripture-focus",
        version: 1,
        entries: [["position", { index: 999 }], ["malformed"]],
      },
      { format: "scripture-focus", version: 1, entries: [[10, "numeric key"]] },
    ]) {
      await expect(importData(invalid)).rejects.toThrow(
        "Invalid Scripture Focus backup",
      );
      expect(await get("position")).toEqual(original);
    }
  });

  it("documents that JSON backups exclude the audio library and cached Scripture downloads", async () => {
    await set("position", { book: 1, chapter: 1, verse: 1 });
    await set("audio:preferences", { volume: 0.3 });
    await set("audio:tracks", [{ id: "rain", name: "Rain" }]);
    await set(
      "audio:track:rain",
      new Blob(["audio fixture"], { type: "audio/wav" }),
    );
    await (await database).put("chapters", fixture, "KJV/1/1");
    const backup = await exportData();
    expect(backup).toMatchObject({ format: "scripture-focus", version: 1 });
    expect(backup.entries).toEqual([
      ["position", { book: 1, chapter: 1, verse: 1 }],
    ]);
    expect(Number.isNaN(Date.parse(backup.exported))).toBe(false);
    // Export does not remove originals: imported files remain available on this device.
    expect(await get("audio:tracks")).toEqual([{ id: "rain", name: "Rain" }]);
  });
});

describe("chapter storage and offline availability", () => {
  it("fetches a chapter once and subsequently reads it from IndexedDB while offline", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await chapter("KJV", 1, 1)).toEqual(fixture);
    expect(fetcher).toHaveBeenCalledWith("/bibles/KJV/1/1.json");
    fetcher.mockRejectedValue(new TypeError("Offline"));
    expect(await chapter("KJV", 1, 1)).toEqual(fixture);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await chapter("KJV", 1, 1)).verses.map((verse) => verse.verse),
    ).toEqual([1, 3]);
  });

  it("keeps translations independent and never substitutes cached Scripture from another translation", async () => {
    await (await database).put("chapters", fixture, "KJV/1/1");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(chapter("ASV", 1, 1)).rejects.toThrow("not available offline");
    expect(fetcher).toHaveBeenCalledWith("/bibles/ASV/1/1.json");
    expect(await chapter("KJV", 1, 1)).toEqual(fixture);
  });

  it("rejects invalid chapter files instead of caching an empty substitute", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "missing source" }), {
            status: 200,
          }),
        ),
    );
    await expect(chapter("BLB", 1, 1)).rejects.toThrow("Invalid chapter data");
    expect(await (await database).get("chapters", "BLB/1/1")).toBeUndefined();
  });

  it("marks a translation installed only after every requested chapter has been stored", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const [, book, chapterNumber] = /\/KJV\/(\d+)\/(\d+)\.json/.exec(url)!;
      return new Response(
        JSON.stringify({
          ...fixture,
          book: Number(book),
          chapter: Number(chapterNumber),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const progress = vi.fn();
    await downloadTranslation(
      "KJV",
      [
        { id: 1, chapters: 2 },
        { id: 2, chapters: 1 },
      ],
      progress,
    );
    expect(await get("installed:KJV")).toBe(true);
    expect(progress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(await (await database).getAllKeys("chapters")).toEqual([
      "KJV/1/1",
      "KJV/1/2",
      "KJV/2/1",
    ]);
    fetcher.mockRejectedValue(new Error("Offline"));
    expect((await chapter("KJV", 1, 2)).chapter).toBe(2);
  });

  it("retains completed chunks for retry but never marks an interrupted download installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(fixture), { status: 200 }),
        )
        .mockRejectedValueOnce(new TypeError("Network interrupted")),
    );
    await expect(
      downloadTranslation("KJV", [{ id: 1, chapters: 2 }], () => {}),
    ).rejects.toThrow("Network interrupted");
    expect(await get("installed:KJV")).toBeUndefined();
    expect(await (await database).getAllKeys("chapters")).toEqual(["KJV/1/1"]);
  });
});
