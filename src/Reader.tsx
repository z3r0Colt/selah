import { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Minus,
  Plus,
  Maximize,
  BookOpen,
  Bookmark,
  Volume2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  tokenize,
  focalIndex,
  duration,
  passageNormalization,
  PlaybackScheduler,
  resolvePosition,
  reachesBoundary,
  approachSpeed,
  type PacingOptions,
  type SessionBoundary,
} from "./engine";
import { get, set, Chapter } from "./store";
export type ReadingSettings = {
  wpm: number;
  natural: boolean;
  font: string;
  fontSize: number;
  weight: number;
  focal: string;
  markers: boolean;
  reference: boolean;
  progress: boolean;
  textColor: string;
  background: string;
  gradual: boolean;
  pauses?: PacingOptions;
  sessionBoundary?: SessionBoundary;
};
type Props = {
  data: Chapter;
  settings: ReadingSettings;
  update: (s: Partial<ReadingSettings>) => void;
  reference: string;
  initial: number;
  initialVerse?: number;
  paused?: boolean;
  completeChapter?: boolean;
  onPosition: (i: number, v: number) => void;
  onVerse: (v: number) => void;
  onContext: () => void;
  onNext: () => void;
  onSave: () => void;
  onAudio: () => void;
  onComplete: () => void;
  sessionMinutes: number;
  sessionBoundary?: SessionBoundary;
};
type SessionRecord = {
  id: string;
  date: string;
  reference: string;
  translation: string;
  book: number;
  chapter: number;
  words: number;
  ms: number;
  speedSum: number;
  averageWpm: number;
  completedChapters: number;
};
// Serialize read-modify-write across chapter changes and React StrictMode cleanups.
let sessionWrites = Promise.resolve();
function persistSession(record: SessionRecord) {
  if (record.words === 0 && record.ms === 0) return;
  const snapshot = { ...record };
  sessionWrites = sessionWrites
    .then(async () => {
      const sessions = (await get<SessionRecord[]>("sessions")) || [];
      const index = sessions.findIndex((s) => s.id === snapshot.id);
      if (index < 0) sessions.push(snapshot);
      else sessions[index] = snapshot;
      await set("sessions", sessions);
    })
    .catch(() => {});
}
export default function Reader(p: Props) {
  const words = useMemo(() => tokenize(p.data.verses), [p.data]);
  const normalization = useMemo(
    () =>
      passageNormalization(words, {
        ...p.settings.pauses,
        natural: p.settings.natural,
      }),
    [words, p.settings.natural, p.settings.pauses],
  );
  const [i, si] = useState(resolvePosition(words, p.initial, p.initialVerse));
  const [playing, sp] = useState(false);
  const [summary, ss] = useState(false);
  const [finishing, Finish] = useState(false);
  const effectiveWpm = useRef(p.settings.wpm);
  const [stats, st] = useState({
    words: 0,
    ms: 0,
    averageWpm: 0,
    completedChapters: 0,
  });
  const area = useRef<HTMLDivElement>(null);
  const scheduler = useRef<PlaybackScheduler | null>(null);
  const cursor = useRef(i);
  const latest = useRef({ p, words, normalization });
  latest.current = { p, words, normalization };
  const activeSince = useRef<number | null>(null);
  const seen = useRef(new Set<number>());
  const timeExpired = useRef(false);
  const restartDwell = useRef(false);
  const session = useRef<SessionRecord>({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    reference: p.reference,
    translation: p.data.translation,
    book: p.data.book,
    chapter: p.data.chapter,
    words: 0,
    ms: 0,
    speedSum: 0,
    averageWpm: 0,
    completedChapters: 0,
  });
  const word = words[i];
  const idx = word ? focalIndex(word.text) : 0;
  const account = () => {
    if (activeSince.current !== null) {
      const now = performance.now();
      session.current.ms += Math.max(0, now - activeSince.current);
      activeSince.current = now;
    }
  };
  const save = () => {
    account();
    session.current.averageWpm = session.current.words
      ? session.current.speedSum / session.current.words
      : 0;
    persistSession(session.current);
  };
  useEffect(() => {
    const initial = resolvePosition(words, p.initial, p.initialVerse);
    cursor.current = initial;
    si(initial);
    sp(false);
    ss(false);
    Finish(false);
    effectiveWpm.current = p.settings.wpm;
    seen.current = new Set();
    timeExpired.current = false;
    restartDwell.current = false;
    session.current = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      reference: p.reference,
      translation: p.data.translation,
      book: p.data.book,
      chapter: p.data.chapter,
      words: 0,
      ms: 0,
      speedSum: 0,
      averageWpm: 0,
      completedChapters: 0,
    };
    const dwell = (at: number) => {
      const current = latest.current;
      return duration(current.words[at], effectiveWpm.current, {
        ...current.p.settings.pauses,
        natural: current.p.settings.natural,
        normalization: current.normalization,
      });
    };
    const clock = new PlaybackScheduler(
      () => {
        if (document.hidden) {
          sp(false);
          return null;
        }
        const current = latest.current;
        const token = current.words[cursor.current];
        if (!token) return null;
        account();
        seen.current.add(cursor.current);
        session.current.words++;
        session.current.speedSum += current.p.settings.wpm;
        const chapterEnd = cursor.current >= current.words.length - 1;
        const timeDue =
          !timeExpired.current &&
          current.p.sessionMinutes > 0 &&
          session.current.ms >= current.p.sessionMinutes * 60000;
        if (timeDue) Finish(true);
        const timedEnd =
          timeDue &&
          reachesBoundary(
            token,
            current.p.settings.sessionBoundary ??
              current.p.sessionBoundary ??
              "verse",
          );
        if (chapterEnd || timedEnd) {
          if (
            chapterEnd &&
            current.p.completeChapter !== false &&
            seen.current.size === current.words.length
          ) {
            session.current.completedChapters = 1;
            current.p.onComplete();
          }
          save();
          st({ ...session.current });
          ss(true);
          Finish(false);
          sp(false);
          if (timedEnd && !chapterEnd) {
            timeExpired.current = true;
            cursor.current++;
            si(cursor.current);
            restartDwell.current = true;
          }
          // A completed chapter stays at its final presented word; timed sessions continue at the next word.
          return null;
        }
        if (current.p.settings.gradual)
          effectiveWpm.current = approachSpeed(
            effectiveWpm.current,
            current.p.settings.wpm,
          );
        else effectiveWpm.current = current.p.settings.wpm;
        cursor.current++;
        si(cursor.current);
        return dwell(cursor.current);
      },
      () => {
        account();
        activeSince.current = null;
        save();
        sp(false);
      },
    );
    scheduler.current = clock;
    if (words[initial]) {
      clock.start(dwell(initial));
      clock.pause();
    }
    return () => {
      clock.pause();
      save();
      activeSince.current = null;
      clock.dispose();
      if (scheduler.current === clock) scheduler.current = null;
    };
  }, [p.data]);
  // A deliberate seek resets that word's dwell; ordinary scheduler advancement does not.
  useEffect(() => {
    if (i !== cursor.current) {
      scheduler.current?.pause();
      cursor.current = i;
      const current = latest.current;
      if (current.words[i]) {
        scheduler.current?.start(
          duration(current.words[i], effectiveWpm.current, {
            ...current.p.settings.pauses,
            natural: current.p.settings.natural,
            normalization: current.normalization,
          }),
        );
        scheduler.current?.pause();
      }
      sp(false);
    }
  }, [i]);
  useEffect(() => {
    p.onPosition(i, word?.verse || 1);
    void set("position", {
      translation: p.data.translation,
      book: p.data.book,
      chapter: p.data.chapter,
      index: i,
      verse: word?.verse || 1,
    });
  }, [i, p.data]);
  useEffect(() => {
    if (p.paused) {
      scheduler.current?.pause();
      save();
      activeSince.current = null;
      sp(false);
    }
  }, [p.paused]);
  useEffect(() => {
    if (!playing) {
      scheduler.current?.pause();
      save();
      activeSince.current = null;
      return;
    }
    if (document.hidden || p.paused) {
      sp(false);
      return;
    }
    activeSince.current = performance.now();
    if (restartDwell.current) {
      const current = latest.current;
      const token = current.words[cursor.current];
      if (token)
        scheduler.current?.start(
          duration(token, effectiveWpm.current, {
            ...current.p.settings.pauses,
            natural: current.p.settings.natural,
            normalization: current.normalization,
          }),
        );
      restartDwell.current = false;
    } else scheduler.current?.resume();
    let wake: { release: () => Promise<void> } | undefined;
    let disposed = false;
    const stop = () => {
      scheduler.current?.pause();
      account();
      activeSince.current = null;
      save();
      sp(false);
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", stop);
    window.addEventListener("pagehide", stop);
    if ("wakeLock" in navigator)
      (
        navigator as Navigator & {
          wakeLock: {
            request: (
              type: string,
            ) => Promise<{ release: () => Promise<void> }>;
          };
        }
      ).wakeLock
        .request("screen")
        .then((w) => {
          if (disposed) void w.release();
          else wake = w;
        })
        .catch(() => {});
    return () => {
      disposed = true;
      scheduler.current?.pause();
      save();
      activeSince.current = null;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pagehide", stop);
      void wake?.release();
    };
  }, [playing, p.paused]);
  const oldTiming = useRef({
    natural: p.settings.natural,
    pauses: p.settings.pauses,
    normalization,
  });
  useEffect(() => {
    const old = oldTiming.current;
    const token = words[cursor.current];
    const previousSpeed = effectiveWpm.current;
    // Gradual changes only apply during active reading; a paused reader starts at its selected pace.
    if (!p.settings.gradual || !playing) effectiveWpm.current = p.settings.wpm;
    if (token) {
      const previous = duration(token, previousSpeed, {
        ...old.pauses,
        natural: old.natural,
        normalization: old.normalization,
      });
      const next = duration(token, effectiveWpm.current, {
        ...p.settings.pauses,
        natural: p.settings.natural,
        normalization,
      });
      scheduler.current?.scaleTiming(next / previous);
    }
    oldTiming.current = {
      natural: p.settings.natural,
      pauses: p.settings.pauses,
      normalization,
    };
  }, [
    p.settings.wpm,
    p.settings.natural,
    p.settings.pauses,
    p.settings.gradual,
    normalization,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(
          'input,textarea,select,button,[contenteditable="true"]',
        )
      )
        return;
      if (
        ["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (e.code === "Space") sp((v) => !v);
      if (e.code === "ArrowLeft") {
        sp(false);
        si((n) => Math.max(0, n - 5));
      }
      if (e.code === "ArrowRight") {
        sp(false);
        si((n) => Math.min(words.length - 1, n + 5));
      }
      if (e.code === "ArrowUp")
        p.update({ wpm: Math.min(1000, p.settings.wpm + 25) });
      if (e.code === "ArrowDown")
        p.update({ wpm: Math.max(100, p.settings.wpm - 25) });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [words.length, p.settings.wpm]);
  const jump = (verse: number) => {
    sp(false);
    const n = words.findIndex((w) => w.verse === verse);
    if (n >= 0) si(n);
  };
  const stepVerse = (direction: number) => {
    const verses = p.data.verses;
    const at = verses.findIndex((v) => v.verse === word?.verse);
    const target = verses[at + direction];
    if (target) jump(target.verse);
    else if (direction > 0) {
      sp(false);
      p.onNext();
    }
  };
  const touch = useRef({ x: 0, y: 0 });
  const suppressTapUntil = useRef(0);
  const paused = (fn: () => void) => {
    sp(false);
    fn();
  };
  if (!word) return <p>No words are available for this passage.</p>;
  return (
    <div
      className="reader"
      ref={area}
      style={{
        background: p.settings.background || undefined,
        color: p.settings.textColor || undefined,
      }}
    >
      <div className="reader-top">
        <span className="eyebrow">ONE WORD. YOUR FULL ATTENTION.</span>
        <button
          title="Full screen"
          aria-label="Full screen"
          className="icon-button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void area.current?.requestFullscreen?.();
          }}
        >
          <Maximize size={18} />
        </button>
      </div>
      <div
        className="focus-stage"
        role="button"
        tabIndex={0}
        aria-label={playing ? "Pause Scripture" : "Play Scripture"}
        onClick={() => {
          if (Date.now() >= suppressTapUntil.current) sp(!playing);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") sp(!playing);
        }}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touch.current.x,
            dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 70) {
            suppressTapUntil.current = Date.now() + 500;
            sp(false);
            si((n) =>
              Math.max(0, Math.min(words.length - 1, n + (dx > 0 ? -5 : 5))),
            );
          } else if (dy < -70) {
            suppressTapUntil.current = Date.now() + 500;
            paused(p.onContext);
          }
        }}
      >
        {p.settings.markers && <span className="focal-marker top" />}
        <div
          className="focal-word"
          aria-hidden="true"
          style={{
            fontFamily: p.settings.font,
            fontSize: `calc(${p.settings.fontSize}px * var(--reader-scale, 1))`,
            fontWeight: p.settings.weight,
          }}
        >
          <span className="word-left">{word.text.slice(0, idx)}</span>
          <span className="word-focus" style={{ color: p.settings.focal }}>
            {word.text[idx]}
          </span>
          <span className="word-right">{word.text.slice(idx + 1)}</span>
        </div>
        <span className="sr-only">
          Use View in Context for accessible continuous Scripture reading.
        </span>
        {p.settings.markers && <span className="focal-marker bottom" />}
      </div>
      {p.settings.reference && (
        <p className="reader-reference">
          {p.reference.replace(/:\d+.*$/, "")}:{word.verse}{" "}
          <span>
            · {p.data.translation}
            {p.data.translation === "BLB" ? " DRAFT" : ""}
          </span>
        </p>
      )}
      {p.settings.progress && (
        <div className="progress-line">
          <span style={{ width: `${((i + 1) / words.length) * 100}%` }} />
        </div>
      )}
      <div className="playback">
        <button
          className="icon-button"
          aria-label="Previous verse"
          onClick={() => stepVerse(-1)}
        >
          <SkipBack size={19} />
        </button>
        <button
          className="icon-button"
          aria-label="Rewind five words"
          onClick={() => {
            sp(false);
            si(Math.max(0, i - 5));
          }}
        >
          <RotateCcw size={20} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => sp(!playing)}
        >
          {playing ? (
            <Pause size={23} fill="currentColor" />
          ) : (
            <Play size={23} fill="currentColor" />
          )}
        </button>
        <button
          className="icon-button"
          aria-label="Skip five words"
          onClick={() => {
            sp(false);
            si(Math.min(words.length - 1, i + 5));
          }}
        >
          <RotateCcw size={20} style={{ transform: "scaleX(-1)" }} />
        </button>
        <button
          className="icon-button"
          aria-label="Next verse"
          onClick={() => stepVerse(1)}
        >
          <SkipForward size={19} />
        </button>
      </div>
      <div className="speed">
        <button
          className="icon-button"
          aria-label="Decrease speed"
          onClick={() => p.update({ wpm: Math.max(100, p.settings.wpm - 25) })}
        >
          <Minus size={16} />
        </button>
        <div>
          <strong>{p.settings.wpm}</strong> <span className="muted">WPM</span>
          <input
            aria-label="Reading speed"
            type="range"
            min="100"
            max="1000"
            step="25"
            value={p.settings.wpm}
            onChange={(e) => p.update({ wpm: +e.target.value })}
          />
        </div>
        <button
          className="icon-button"
          aria-label="Increase speed"
          onClick={() => p.update({ wpm: Math.min(1000, p.settings.wpm + 25) })}
        >
          <Plus size={16} />
        </button>
      </div>
      {playing &&
        p.settings.gradual &&
        Math.round(effectiveWpm.current) !== p.settings.wpm && (
          <p className="reader-hint" aria-label="Current gradual pace">
            {Math.round(effectiveWpm.current)} WPM · settling toward{" "}
            {p.settings.wpm}
          </p>
        )}
      {p.sessionMinutes > 0 && (
        <div
          className="reader-session"
          style={{ maxWidth: 320, margin: "0 auto 20px" }}
        >
          <label>
            When time is complete, finish the current
            <select
              aria-label="Session finishing boundary"
              onFocus={() => sp(false)}
              value={p.settings.sessionBoundary ?? p.sessionBoundary ?? "verse"}
              onChange={(e) =>
                p.update({ sessionBoundary: e.target.value as SessionBoundary })
              }
            >
              <option value="verse">Verse</option>
              <option value="paragraph">Paragraph</option>
              <option value="chapter">Chapter</option>
            </select>
          </label>
          {finishing && (
            <p role="status" className="muted">
              Your time is complete. Finishing the current{" "}
              {p.settings.sessionBoundary ?? p.sessionBoundary ?? "verse"}.
            </p>
          )}
        </div>
      )}
      <details
        className="reader-rhythm"
        style={{ maxWidth: 480, margin: "0 auto 22px", fontSize: 12 }}
        onToggle={(e) => {
          if (e.currentTarget.open) sp(false);
        }}
      >
        <summary style={{ cursor: "pointer", minHeight: 36 }}>
          Reading rhythm
        </summary>
        <label className="check-label">
          <input
            type="checkbox"
            checked={p.settings.gradual}
            onChange={(e) => p.update({ gradual: e.target.checked })}
          />
          Adjust speed gradually during playback
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={p.settings.natural}
            onChange={(e) => p.update({ natural: e.target.checked })}
          />
          Natural pacing
        </label>
        {p.settings.natural && (
          <>
            <p className="muted">
              Extra pauses are measured in word intervals. Timing is balanced
              across the chapter to preserve your target average pace.
            </p>
            {(
              [
                ["comma", "Comma", 0.35],
                ["period", "Period", 0.8],
                ["question", "Question mark", 0.8],
                ["exclamation", "Exclamation mark", 0.8],
                ["semicolon", "Semicolon", 0.5],
                ["colon", "Colon", 0.5],
                ["verse", "Verse ending", 0.35],
                ["paragraph", "Paragraph ending", 0.5],
                ["chapter", "Chapter ending", 1.2],
              ] as const
            ).map(([key, label, fallback]) => (
              <label key={key}>
                {label} · {(p.settings.pauses?.[key] ?? fallback).toFixed(1)}{" "}
                extra intervals
                <input
                  aria-label={`${label} pause`}
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={p.settings.pauses?.[key] ?? fallback}
                  onChange={(e) =>
                    p.update({
                      pauses: { ...p.settings.pauses, [key]: +e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <label className="check-label">
              <input
                type="checkbox"
                checked={p.settings.pauses?.longWords !== false}
                onChange={(e) =>
                  p.update({
                    pauses: {
                      ...p.settings.pauses,
                      longWords: e.target.checked,
                    },
                  })
                }
              />
              Allow extra time for long words
            </label>
            <p className="muted">
              Paragraph endings follow source formatting. Without a supplied
              paragraph marker, the chapter ending is the safe boundary.
            </p>
          </>
        )}
      </details>
      <div className="reader-actions">
        <button onClick={() => paused(p.onContext)}>
          <BookOpen size={16} /> View in Context
        </button>
        <button onClick={() => paused(p.onSave)}>
          <Bookmark size={16} /> Save verse
        </button>
        <button onClick={() => paused(p.onAudio)}>
          <Volume2 size={16} /> Focus audio
        </button>
        <button onClick={() => jump(word.verse)}>Restart verse</button>
        <button
          onClick={() => {
            sp(false);
            si(0);
          }}
        >
          Restart chapter
        </button>
      </div>
      <p className="reader-hint">
        {playing
          ? "Take your time. Let the words settle."
          : "Press space or tap the word to begin."}
      </p>
      {summary && (
        <div className="card session-summary">
          <h3>A moment in the Word</h3>
          <p>
            {stats.words} words presented · {(stats.ms / 60000).toFixed(1)}{" "}
            minutes · {Math.round(stats.averageWpm)} average selected WPM ·{" "}
            {stats.completedChapters} complete chapters
          </p>
          <p className="muted">
            Presentation is not a measure of understanding. Take a moment to
            review.
          </p>
          <button className="button" onClick={() => paused(p.onContext)}>
            Review the chapter
          </button>
          <button
            onClick={() => {
              ss(false);
              if (i >= words.length - 1) paused(p.onNext);
            }}
          >
            {i >= words.length - 1 ? "Next chapter" : "Continue reading"}
          </button>
        </div>
      )}
    </div>
  );
}
