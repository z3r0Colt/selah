import { describe, expect, it, vi, afterEach } from "vitest";
import {
  tokenize,
  focalIndex,
  duration,
  passageNormalization,
  PlaybackScheduler,
  resolvePosition,
  reachesBoundary,
  approachSpeed,
} from "../src/engine";

describe("source-preserving tokenization", () => {
  it("preserves punctuation, apostrophes, hyphens, and exact whitespace", () => {
    const text = "  In the beginning,\tGod’s loving-kindness.  ";
    const tokens = tokenize([{ verse: 1, text }]);
    expect(tokens.map((t) => t.before + t.text + t.after).join("")).toBe(text);
    expect(tokens.map((t) => t.text)).toEqual([
      "In",
      "the",
      "beginning,",
      "God’s",
      "loving-kindness.",
    ]);
    expect(tokens.at(-1)).toMatchObject({
      verseEnd: true,
      paragraphEnd: true,
      chapterEnd: true,
    });
  });
  it("keeps source numbering and boundaries rather than inventing missing verses", () => {
    const tokens = tokenize([
      { verse: 0, text: "A Psalm." },
      { verse: 1, text: "One word." },
      { verse: 3, text: "Another.", paragraph: true },
    ]);
    expect(tokens.map((t) => t.verse)).toEqual([0, 0, 1, 1, 3]);
    expect(tokens[3].paragraphEnd).toBe(true);
    expect(tokens[3].chapterEnd).toBe(false);
  });
  it("does not add tokens for an empty verse", () =>
    expect(tokenize([{ verse: 1, text: "" }])).toEqual([]));
});

describe("safe saved position and translation switching", () => {
  const original = tokenize([
    { verse: 1, text: "One two." },
    { verse: 3, text: "Three four five." },
    { verse: 5, text: "Six seven." },
  ]);
  const translated = tokenize([
    { verse: 1, text: "Different first verse with many words." },
    { verse: 3, text: "Another corresponding verse." },
    { verse: 5, text: "Final verse." },
  ]);
  it("restores the exact word within the same verse", () =>
    expect(resolvePosition(original, 3, 3)).toBe(3));
  it("positions a requested starting verse without truncating chapter data", () =>
    expect(resolvePosition(original, -1, 3)).toBe(2));
  it("seeks translation changes to the corresponding verse beginning", () =>
    expect(resolvePosition(translated, -1, 3)).toBe(6));
  it("rejects a stale numerical word index belonging to another verse", () =>
    expect(resolvePosition(translated, 2, 3)).toBe(6));
  it("handles omitted source verse numbering with a safe existing boundary", () =>
    expect(resolvePosition(original, -1, 2)).toBe(2));
  it("handles an out-of-range reference without inventing a verse", () =>
    expect(resolvePosition(original, -1, 99)).toBe(5));
});

describe("fixed ORP focal point", () => {
  it("uses a deliberate lexical-length algorithm", () => {
    expect(
      [
        "a",
        "In",
        "faith",
        "beginning",
        "righteousness",
        "everlasting",
        "reconciliation",
      ].map(focalIndex),
    ).toEqual([0, 1, 1, 2, 3, 3, 4]);
  });
  it("ignores leading punctuation and preserves the original word", () => {
    for (const word of [
      "“faith,”",
      "God's",
      "ever-loving",
      "Éternel",
      "𐐀lpha",
    ]) {
      const index = focalIndex(word);
      expect(
        /[\p{L}\p{N}]/u.test(String.fromCodePoint(word.codePointAt(index)!)),
      ).toBe(true);
      expect(word.slice(0, index) + word.slice(index)).toBe(word);
    }
    expect(focalIndex("“faith,”")).toBe(2);
    expect(focalIndex("...")).toBe(0);
  });
});

describe("proportional pacing", () => {
  const tokens = tokenize([
    { verse: 1, text: "In beginning, reconciliation." },
  ]);
  it("keeps constant mode uniform and clamps supported speeds", () => {
    expect(tokens.map((t) => duration(t, 250, { mode: "constant" }))).toEqual([
      240, 240, 240,
    ]);
    expect(duration(tokens[0], 1, { mode: "constant" })).toBe(600);
    expect(duration(tokens[0], 2000, { mode: "constant" })).toBe(60);
  });
  it("pauses proportionally for punctuation, long words and boundaries", () => {
    expect(duration(tokens[1], 250)).toBeGreaterThan(duration(tokens[0], 250));
    expect(duration(tokens[2], 250)).toBeGreaterThan(duration(tokens[1], 250));
    expect(duration(tokens[2], 500)).toBe(duration(tokens[2], 250) / 2);
  });
  it("can preserve passage average target pace with normalized natural timing", () => {
    const normalization = passageNormalization(tokens);
    const sum = tokens.reduce(
      (n, t) => n + duration(t, 250, { normalization }),
      0,
    );
    expect(sum).toBeCloseTo(3 * 240);
  });
});

describe("deadline scheduler", () => {
  afterEach(() => vi.useRealTimers());
  it("advances every word once and ends without an extra callback", () => {
    vi.useFakeTimers();
    const advance = vi
      .fn()
      .mockReturnValueOnce(240)
      .mockReturnValueOnce(240)
      .mockReturnValueOnce(null);
    const scheduler = new PlaybackScheduler(advance);
    scheduler.start(240);
    vi.advanceTimersByTime(720);
    expect(advance).toHaveBeenCalledTimes(3);
    expect(scheduler.active).toBe(false);
  });
  it("pauses and resumes the unelapsed word dwell", () => {
    vi.useFakeTimers();
    const advance = vi.fn(() => 240);
    const scheduler = new PlaybackScheduler(advance);
    scheduler.start(240);
    vi.advanceTimersByTime(100);
    scheduler.pause();
    vi.advanceTimersByTime(5000);
    expect(advance).not.toHaveBeenCalled();
    scheduler.resume();
    vi.advanceTimersByTime(139);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
  it("changes speed without restarting the current word", () => {
    vi.useFakeTimers();
    const advance = vi.fn(() => 120);
    const scheduler = new PlaybackScheduler(advance);
    scheduler.start(240);
    vi.advanceTimersByTime(100);
    scheduler.scaleTiming(0.5);
    vi.advanceTimersByTime(70);
    expect(advance).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
  it("anchors future deadlines so routine callback lateness does not accumulate drift", () => {
    let now = 0;
    let pending = () => {};
    const delays: number[] = [];
    const scheduler = new PlaybackScheduler(
      () => 240,
      () => {},
      {
        now: () => now,
        schedule: (callback, delay) => {
          pending = callback;
          delays.push(delay);
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        cancel: () => {},
      },
    );
    scheduler.start(240);
    now = 250;
    pending();
    now = 490;
    pending();
    expect(delays).toEqual([240, 230, 230]);
    scheduler.dispose();
  });
  it("does not catch up through short words at high reading speeds", () => {
    let now = 0;
    let pending = () => {};
    const advance = vi.fn(() => 60);
    const interrupted = vi.fn();
    const scheduler = new PlaybackScheduler(advance, interrupted, {
      now: () => now,
      schedule: (callback) => {
        pending = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => {},
    });
    scheduler.start(60);
    now = 120;
    pending();
    expect(advance).not.toHaveBeenCalled();
    expect(interrupted).toHaveBeenCalledOnce();
  });
  it("pauses after a busy-device delay and never races through missed words", () => {
    let now = 0;
    let pending = () => {};
    const advance = vi.fn(() => 240);
    const interrupted = vi.fn();
    const scheduler = new PlaybackScheduler(advance, interrupted, {
      now: () => now,
      schedule: (callback) => {
        pending = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => {},
    });
    scheduler.start(240);
    now = 5000;
    pending();
    expect(advance).not.toHaveBeenCalled();
    expect(interrupted).toHaveBeenCalledOnce();
    expect(scheduler.active).toBe(false);
  });
});

describe("individual pacing controls and gradual speed", () => {
  const tokens = tokenize([
    { verse: 1, text: "word, word. word? word! word; word: ending" },
  ]);
  it("uses independent punctuation settings without changing any source token", () => {
    const options = {
      comma: 0,
      period: 0.1,
      question: 0.2,
      exclamation: 0.3,
      semicolon: 0.4,
      colon: 0.5,
      verse: 0,
      paragraph: 0,
      chapter: 0,
      longWords: false,
    };
    expect(
      tokens.slice(0, 6).map((token) => duration(token, 1000, options)),
    ).toEqual([60, 66, 72, 78, 84, 90]);
    expect(tokens.slice(0, 6).map((token) => token.text)).toEqual([
      "word,",
      "word.",
      "word?",
      "word!",
      "word;",
      "word:",
    ]);
  });
  it("balances customized natural pauses to the selected target average", () => {
    const options = {
      comma: 2,
      period: 0.5,
      verse: 1,
      chapter: 3,
      longWords: false,
    };
    const normalization = passageNormalization(tokens, options);
    expect(
      tokens.reduce(
        (sum, token) =>
          sum + duration(token, 250, { ...options, normalization }),
        0,
      ),
    ).toBeCloseTo(tokens.length * 240);
  });
  it("approaches a new speed in small steps without overshooting", () => {
    expect(approachSpeed(250, 400)).toBe(255);
    expect(approachSpeed(250, 100)).toBe(245);
    expect(approachSpeed(398, 400)).toBe(400);
    expect(approachSpeed(400, 400)).toBe(400);
  });
});

describe("timed session finishing boundaries", () => {
  const tokens = tokenize([
    { verse: 1, text: "first verse" },
    { verse: 2, text: "next verse", paragraph: true },
    { verse: 3, text: "final verse" },
  ]);
  it("can finish at a verse boundary without waiting for the chapter", () => {
    expect(reachesBoundary(tokens[1], "verse")).toBe(true);
    expect(reachesBoundary(tokens[1], "chapter")).toBe(false);
  });
  it("uses supplied paragraph boundaries and safe chapter endings", () => {
    expect(reachesBoundary(tokens[1], "paragraph")).toBe(true);
    expect(reachesBoundary(tokens[3], "paragraph")).toBe(false);
    expect(reachesBoundary(tokens[5], "paragraph")).toBe(true);
    expect(reachesBoundary(tokens[5], "chapter")).toBe(true);
  });
});
