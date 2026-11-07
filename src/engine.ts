/** Source text is never changed by the presentation engine. Offsets use JS string indices. */
export interface Token {
  text: string;
  verse: number;
  verseEnd: boolean;
  paragraphEnd: boolean;
  chapterEnd: boolean;
  /** Original whitespace, useful for lossless reconstruction of the source verse. */
  before: string;
  after: string;
}
export interface SourceVerse {
  verse: number;
  text: string;
  paragraph?: boolean;
}

export function tokenize(verses: SourceVerse[]): Token[] {
  const tokens: Token[] = [];
  verses.forEach((verse, verseIndex) => {
    const matches = [...verse.text.matchAll(/\S+/gu)];
    matches.forEach((match, wordIndex) => {
      const verseEnd = wordIndex === matches.length - 1;
      const end = (match.index ?? 0) + match[0].length;
      tokens.push({
        text: match[0],
        verse: verse.verse,
        verseEnd,
        paragraphEnd:
          verseEnd &&
          (!!verses[verseIndex + 1]?.paragraph ||
            verseIndex === verses.length - 1),
        chapterEnd: verseEnd && verseIndex === verses.length - 1,
        before: wordIndex === 0 ? verse.text.slice(0, match.index) : "",
        after: verse.text.slice(
          end,
          matches[wordIndex + 1]?.index ?? verse.text.length,
        ),
      });
    });
  });
  return tokens;
}

/** Restore only an index belonging to the requested verse; translation changes seek a safe boundary. */
export function resolvePosition(
  tokens: Token[],
  index: number,
  verse?: number,
): number {
  if (!tokens.length) return 0;
  if (
    Number.isInteger(index) &&
    index >= 0 &&
    index < tokens.length &&
    (verse === undefined || tokens[index].verse === verse)
  )
    return index;
  if (verse !== undefined) {
    const exact = tokens.findIndex((token) => token.verse === verse);
    if (exact >= 0) return exact;
    const following = tokens.findIndex((token) => token.verse > verse);
    if (following >= 0) return following;
    const lastVerse = tokens[tokens.length - 1].verse;
    return Math.max(
      0,
      tokens.findIndex((token) => token.verse === lastVerse),
    );
  }
  return 0;
}

/** ORP ignores punctuation and includes Unicode letters and digits. Return value is a UTF-16 offset. */
export function focalIndex(word: string): number {
  const letters = [...word.matchAll(/[\p{L}\p{N}]/gu)];
  if (!letters.length) return 0;
  const length = letters.length;
  const recognition =
    length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4;
  return letters[Math.min(recognition, length - 1)].index ?? 0;
}

export interface PacingOptions {
  mode?: "natural" | "constant";
  natural?: boolean;
  comma?: number;
  sentence?: number;
  period?: number;
  question?: number;
  exclamation?: number;
  colon?: number;
  semicolon?: number;
  verse?: number;
  paragraph?: number;
  chapter?: number;
  longWords?: boolean;
  /** Optional normalizer computed for a passage to maintain average target WPM. */
  normalization?: number;
}
export function pacingFactor(
  token: Token,
  options: PacingOptions = {},
): number {
  if (options.mode === "constant" || options.natural === false) return 1;
  const ending = token.text.replace(/["'”’»\])}]+$/gu, "");
  let factor = 1;
  if (/[,،]$/u.test(ending)) factor += options.comma ?? 0.35;
  else if (/[?]$/u.test(ending))
    factor += options.question ?? options.sentence ?? 0.8;
  else if (/[!]$/u.test(ending))
    factor += options.exclamation ?? options.sentence ?? 0.8;
  else if (/[.…]$/u.test(ending))
    factor += options.period ?? options.sentence ?? 0.8;
  else if (/[;]$/u.test(ending)) factor += options.semicolon ?? 0.5;
  else if (/[:]$/u.test(ending))
    factor += options.colon ?? options.semicolon ?? 0.5;
  if (token.verseEnd) factor += options.verse ?? 0.35;
  if (token.paragraphEnd) factor += options.paragraph ?? 0.5;
  if (token.chapterEnd) factor += options.chapter ?? 1.2;
  if (options.longWords !== false) {
    const length = [...token.text.matchAll(/[\p{L}\p{N}]/gu)].length;
    factor += Math.max(0, Math.min(16, length) - 8) * 0.06;
  }
  return factor;
}
export function passageNormalization(
  tokens: Token[],
  options: PacingOptions = {},
): number {
  return tokens.length
    ? tokens.reduce((sum, token) => sum + pacingFactor(token, options), 0) /
        tokens.length
    : 1;
}
export function duration(
  token: Token,
  wpm: number,
  options: PacingOptions = {},
): number {
  const speed = Number.isFinite(wpm) ? Math.max(100, Math.min(1000, wpm)) : 250;
  return (
    ((60000 / speed) * pacingFactor(token, options)) /
    (options.normalization || 1)
  );
}

export type SessionBoundary = "verse" | "paragraph" | "chapter";
export function reachesBoundary(
  token: Token,
  boundary: SessionBoundary,
): boolean {
  return boundary === "chapter"
    ? token.chapterEnd
    : boundary === "paragraph"
      ? token.paragraphEnd
      : token.verseEnd;
}
/** A small per-word change lets speed adjustments settle without restarting the passage. */
export function approachSpeed(
  current: number,
  target: number,
  step = 5,
): number {
  return (
    current +
    Math.sign(target - current) *
      Math.min(Math.max(1, step), Math.abs(target - current))
  );
}

export interface SchedulerClock {
  now(): number;
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel(id: ReturnType<typeof setTimeout>): void;
}
const browserClock: SchedulerClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (id) => clearTimeout(id),
};
/**
 * Deadlines are calculated from the preceding deadline, not interval callback time.
 * A busy device pauses playback rather than catching up through unseen words.
 * The callback advances once and returns the next word's dwell time, or null at passage end.
 */
export class PlaybackScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private deadline = 0;
  private remaining = 0;
  private running = false;
  private delay = 0;
  constructor(
    private advance: () => number | null,
    private onInterrupted: () => void = () => {},
    private clock: SchedulerClock = browserClock,
  ) {}
  get active(): boolean {
    return this.running;
  }
  start(delay: number): void {
    this.pause();
    this.delay = Math.max(1, delay);
    this.remaining = this.delay;
    this.resume();
  }
  pause(): void {
    if (this.timer !== undefined) this.clock.cancel(this.timer);
    this.timer = undefined;
    if (this.running)
      this.remaining = Math.max(1, this.deadline - this.clock.now());
    this.running = false;
  }
  resume(): void {
    if (this.running) return;
    this.running = true;
    this.deadline =
      this.clock.now() + Math.max(1, this.remaining || this.delay || 240);
    this.arm();
  }
  /** Scale the unelapsed dwell when speed changes, without restarting a verse. */
  scaleTiming(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    const wasRunning = this.running;
    this.pause();
    this.remaining *= ratio;
    this.delay *= ratio;
    if (wasRunning) this.resume();
  }
  dispose(): void {
    this.pause();
  }
  private arm(): void {
    this.timer = this.clock.schedule(
      () => {
        this.timer = undefined;
        if (!this.running) return;
        const lateness = this.clock.now() - this.deadline;
        if (lateness > Math.max(8, Math.min(150, this.delay * 0.75))) {
          this.running = false;
          this.remaining = this.delay;
          this.onInterrupted();
          return;
        }
        const next = this.advance();
        if (next === null) {
          this.running = false;
          this.remaining = 0;
          return;
        }
        this.delay = Math.max(1, next);
        this.deadline += this.delay;
        this.remaining = this.delay;
        this.arm();
      },
      Math.max(0, this.deadline - this.clock.now()),
    );
  }
}
