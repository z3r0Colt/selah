// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Reader, { type ReadingSettings } from "../src/Reader";
import { type Chapter } from "../src/store";

const memory = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../src/store", () => ({
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
}));

const settings: ReadingSettings = {
  wpm: 250,
  natural: false,
  font: "Georgia",
  fontSize: 56,
  weight: 400,
  focal: "#943939",
  markers: true,
  reference: true,
  progress: true,
  textColor: "",
  background: "",
  gradual: false,
};
// Deliberately synthetic fixture: tests never supply Scripture assets to the application.
const data: Chapter = {
  translation: "KJV",
  book: 1,
  chapter: 1,
  verses: [
    { verse: 1, text: "one two three four five six" },
    { verse: 2, text: "seven eight nine ten eleven twelve" },
  ],
};
type ReaderProps = Parameters<typeof Reader>[0];
let host: HTMLDivElement;
let root: Root;
let props: ReaderProps;

beforeEach(() => {
  vi.useFakeTimers();
  memory.clear();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  props = {
    data,
    settings,
    update: vi.fn(),
    reference: "Fixture 1:1",
    initial: 0,
    initialVerse: 1,
    onPosition: vi.fn(),
    onVerse: vi.fn(),
    onContext: vi.fn(),
    onNext: vi.fn(),
    onSave: vi.fn(),
    onAudio: vi.fn(),
    onComplete: vi.fn(),
    sessionMinutes: 0,
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function render(patch: Partial<ReaderProps> = {}) {
  props = { ...props, ...patch };
  act(() => root.render(<Reader {...props} />));
}
function button(label: string) {
  const element = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  expect(element, `Missing ${label} button`).not.toBeNull();
  return element!;
}
function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}
function key(code: string, target: EventTarget = document.body) {
  act(() =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        code,
        key: code === "Space" ? " " : code,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
function word() {
  return host.querySelector(".focal-word")?.textContent;
}
function touch(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(
    event,
    type === "touchstart" ? "touches" : "changedTouches",
    { value: [{ clientX: x, clientY: y }] },
  );
  act(() => host.querySelector(".focus-stage")!.dispatchEvent(event));
}

describe("Reader playback integration", () => {
  it("starts at the requested verse boundary and saves its correct source reference", () => {
    render({ initial: -1, initialVerse: 2 });
    expect(word()).toBe("seven");
    expect(props.onPosition).toHaveBeenLastCalledWith(6, 2);
    expect(memory.get("position")).toMatchObject({
      translation: "KJV",
      book: 1,
      chapter: 1,
      verse: 2,
      index: 6,
    });
  });

  it("retains the exact word and unelapsed dwell while a menu pauses playback", () => {
    render();
    click(button("Play"));
    advance(100);
    render({ paused: true });
    advance(5000);
    expect(word()).toBe("one");
    expect(button("Play")).toBeTruthy();
    render({ paused: false });
    click(button("Play"));
    advance(139);
    expect(word()).toBe("one");
    advance(1);
    expect(word()).toBe("two");
  });

  it("continues normally across parent position rerenders with the same chapter object", () => {
    render();
    click(button("Play"));
    advance(240);
    expect(word()).toBe("two");
    render({ initial: 1, initialVerse: 1 });
    expect(button("Pause")).toBeTruthy();
    advance(240);
    expect(word()).toBe("three");
    expect(props.onPosition).toHaveBeenLastCalledWith(2, 1);
  });

  it("presents consecutive source words and changes verse only at the real boundary", () => {
    render();
    click(button("Play"));
    const displayed = [word()];
    for (let index = 0; index < 6; index++) {
      advance(240);
      displayed.push(word());
    }
    expect(displayed).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
    ]);
    expect(props.onPosition).toHaveBeenLastCalledWith(6, 2);
  });

  it("pauses on loss of focus without racing through hidden words on return", () => {
    render();
    click(button("Play"));
    advance(100);
    act(() => window.dispatchEvent(new Event("blur")));
    advance(5000);
    expect(word()).toBe("one");
    expect(button("Play")).toBeTruthy();
    click(button("Play"));
    advance(140);
    expect(word()).toBe("two");
  });

  it("stops before opening context and preserves the current word", () => {
    render();
    click(button("Play"));
    advance(240);
    click(
      [...host.querySelectorAll("button")].find((node) =>
        node.textContent?.includes("View in Context"),
      )!,
    );
    expect(props.onContext).toHaveBeenCalledOnce();
    advance(2000);
    expect(word()).toBe("two");
    expect(button("Play")).toBeTruthy();
  });
});

describe("keyboard and mobile alternatives", () => {
  it("supports playback, five-word seeks and bounded speed shortcuts", () => {
    render();
    key("Space");
    expect(button("Pause")).toBeTruthy();
    key("ArrowRight");
    expect(word()).toBe("six");
    expect(button("Play")).toBeTruthy();
    key("ArrowLeft");
    expect(word()).toBe("one");
    key("ArrowUp");
    expect(props.update).toHaveBeenLastCalledWith({ wpm: 275 });
    key("ArrowDown");
    expect(props.update).toHaveBeenLastCalledWith({ wpm: 225 });
    render({ settings: { ...settings, wpm: 1000 } });
    key("ArrowUp");
    expect(props.update).toHaveBeenLastCalledWith({ wpm: 1000 });
    render({ settings: { ...settings, wpm: 100 } });
    key("ArrowDown");
    expect(props.update).toHaveBeenLastCalledWith({ wpm: 100 });
  });

  it("does not capture keyboard shortcuts used inside an input", () => {
    render();
    const slider = host.querySelector("input")!;
    key("ArrowUp", slider);
    key("Space", slider);
    expect(props.update).not.toHaveBeenCalled();
    expect(button("Play")).toBeTruthy();
    expect(word()).toBe("one");
  });

  it("supports deliberate swipes for skipping, rewinding and context", () => {
    render();
    touch("touchstart", 200, 200);
    touch("touchend", 80, 200);
    expect(word()).toBe("six");
    touch("touchstart", 80, 200);
    touch("touchend", 200, 200);
    expect(word()).toBe("one");
    touch("touchstart", 100, 240);
    touch("touchend", 100, 100);
    expect(props.onContext).toHaveBeenCalledOnce();
  });

  it("keeps visible verse navigation available as an alternative to gestures", () => {
    render();
    click(button("Next verse"));
    expect(word()).toBe("seven");
    click(button("Previous verse"));
    expect(word()).toBe("one");
  });
});

describe("source-preserving focal rendering", () => {
  it("splits each word around one focal letter without changing copyable text", () => {
    const words = [
      "beginning",
      "righteousness",
      "faith",
      "everlasting",
      "reconciliation",
    ];
    for (const text of words) {
      render({ data: { ...data, verses: [{ verse: 1, text }] } });
      const focal = host.querySelector(".focal-word")!;
      expect(focal.textContent).toBe(text);
      expect(focal.querySelectorAll(".word-focus")).toHaveLength(1);
      expect(focal.querySelector(".word-focus")!.textContent).toHaveLength(1);
      expect([...focal.children].map((child) => child.className)).toEqual([
        "word-left",
        "word-focus",
        "word-right",
      ]);
    }
    // jsdom does not perform layout; browser QA must verify optical and pixel alignment.
  });
});
