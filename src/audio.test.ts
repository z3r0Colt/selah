import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./store", () => ({
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
}));

beforeEach(() => {
  memory.clear();
  vi.resetModules();
});

describe("local background audio", () => {
  it("restores category and volume without automatically starting audio", async () => {
    memory.set("audio:preferences", {
      category: "Piano",
      volume: 0.6,
      selected: "piano-1",
      repeat: false,
      shuffle: true,
      muted: true,
    });
    const { backgroundAudio } = await import("./audio");
    await backgroundAudio.init();
    expect(backgroundAudio.state).toMatchObject({
      category: "Piano",
      volume: 0.6,
      playing: false,
      muted: true,
    });
  });
  it("stores actual imported bytes and metadata for offline playback", async () => {
    const { backgroundAudio } = await import("./audio");
    const file = new File(["original audio bytes"], "Quiet rain.wav", {
      type: "audio/wav",
    });
    await backgroundAudio.import([file], "Nature");
    const track = backgroundAudio.state.tracks[0];
    expect(track).toMatchObject({
      name: "Quiet rain",
      category: "Nature",
      size: file.size,
    });
    expect(await (memory.get("audio:track:" + track.id) as Blob).text()).toBe(
      "original audio bytes",
    );
    expect(backgroundAudio.state.playing).toBe(false);
  });
  it("rejects non-audio imports and reports the problem", async () => {
    const { backgroundAudio } = await import("./audio");
    await backgroundAudio.import(
      [new File(["x"], "notes.txt", { type: "text/plain" })],
      "Deep Focus",
    );
    expect(backgroundAudio.state.tracks).toHaveLength(0);
    expect(backgroundAudio.state.error).toMatch(/audio files/);
  });
  it("persists controls while constraining volume to the valid gain range", async () => {
    const { backgroundAudio } = await import("./audio");
    await backgroundAudio.init();
    backgroundAudio.preference({ volume: 4, repeat: false, shuffle: true });
    expect(backgroundAudio.state.volume).toBe(1);
    expect(memory.get("audio:preferences")).toMatchObject({
      volume: 1,
      repeat: false,
      shuffle: true,
    });
  });
  it("allows a sleep timer to be cancelled", async () => {
    const { backgroundAudio } = await import("./audio");
    backgroundAudio.sleep(5);
    expect(backgroundAudio.state.sleepAt).toBeGreaterThan(Date.now());
    backgroundAudio.sleep(0);
    expect(backgroundAudio.state.sleepAt).toBeNull();
  });
});
