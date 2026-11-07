import HomePlan from "./HomePlan";
import Statistics from "./Statistics";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  BookOpen,
  Home,
  CalendarDays,
  Library,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Search,
  Sun,
  Moon,
  Headphones,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Feather,
  Download,
  Bookmark,
  Target,
  Copy,
  Volume2,
  Columns2,
  Menu,
} from "lucide-react";
import {
  chapter,
  get,
  set,
  downloadTranslation,
  exportData,
  importData,
  clearData,
  type Chapter,
} from "./store";
import Reader, { type ReadingSettings } from "./Reader";
import Plans from "./Plans";
import MemorizePassage from "./MemorizePassage";
import Audio from "./Audio";
import { backgroundAudio } from "./audio";
import { BOOK_NAMES, CHAPTER_COUNTS } from "./plans";
const translations = ["KJV", "ASV", "BSB", "BLB"];
const defaults: ReadingSettings = {
  wpm: 250,
  natural: true,
  font: "Georgia, serif",
  fontSize: 62,
  weight: 400,
  focal: "#9c4039",
  markers: true,
  reference: true,
  progress: true,
  textColor: "",
  background: "",
  gradual: false,
};
type Position = {
  book: number;
  chapter: number;
  verse: number;
  index: number;
  translation: string;
};
type Saved = {
  id: string;
  book: number;
  chapter: number;
  verse: number;
  translation: string;
  note: string;
  tags: string;
  highlight: boolean;
};
export default function App() {
  const [seekEpoch, Seek] = useState(0);
  const [controlsOpen, PauseControls] = useState(false);
  const [page, P] = useState("Home"),
    [mode, M] = useState("rsvp"),
    [pos, S] = useState<Position>({
      book: 1,
      chapter: 1,
      verse: 1,
      index: 0,
      translation: "KJV",
    }),
    [settings, U] = useState(defaults),
    [theme, T] = useState("light"),
    [data, D] = useState<Chapter>(),
    [error, E] = useState(""),
    [notice, N] = useState(""),
    [ready, R] = useState(false),
    [modal, Q] = useState(""),
    [saved, B] = useState<Saved[]>([]),
    [sessions, J] = useState<any[]>([]),
    [installed, I] = useState<string[]>([]),
    [onboard, O] = useState(-1),
    [query, F] = useState(""),
    [results, G] = useState<
      { book: number; chapter: number; verse: number; text: string }[]
    >([]),
    [searching, Z] = useState(false),
    [selection, V] = useState({
      book: 1,
      chapter: 1,
      verse: 1,
      endChapter: 1,
      endVerse: 999,
    }),
    [range, Range] = useState<{
      book: number;
      start: number;
      end: number;
      verseEnd: number;
    } | null>(null),
    [sessionMinutes, SM] = useState(0),
    [compare, C] = useState<Chapter[]>([]),
    [filter, Filter] = useState(""),
    [note, Note] = useState(""),
    [tags, Tags] = useState(""),
    [downloadProgress, DP] = useState(""),
    [reflection, Reflection] = useState("");
  useEffect(() => {
    Promise.all([
      get<Position>("position"),
      get<ReadingSettings>("settings"),
      get<string>("theme"),
      get<Saved[]>("saved"),
      get<boolean>("onboarded"),
      get<any[]>("sessions"),
    ])
      .then(([p, s, t, b, o, j]) => {
        if (p) {
          cursor.current = p;
          S(p);
        }
        if (s) U({ ...defaults, ...s });
        if (t) T(t);
        B(b || []);
        J(j || []);
        if (!o) O(0);
        R(true);
      })
      .catch((e) => E(String(e)));
    for (const t of translations)
      get(`installed:${t}`).then((v) => {
        if (v) I((a) => [...new Set([...a, t])]);
      });
  }, []);
  useEffect(() => {
    if (page === "Library" || page === "Home")
      get<any[]>("sessions").then((j) => J(j || []));
  }, [page]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) void set("theme", theme);
  }, [theme, ready]);
  useEffect(() => {
    if (ready) void set("settings", settings);
  }, [settings, ready]);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    D(undefined);
    E("");
    chapter(pos.translation, pos.book, pos.chapter)
      .then((d) => {
        if (live) {
          D(d);
          void get<any[]>("history").then((h) =>
            set(
              "history",
              [
                { ...pos, date: new Date().toISOString() },
                ...(h || []).filter(
                  (x) => x.book !== pos.book || x.chapter !== pos.chapter,
                ),
              ].slice(0, 30),
            ),
          );
        }
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    get<string>(`reflection:${pos.book}:${pos.chapter}`).then((x) =>
      Reflection(x || ""),
    );
    return () => {
      live = false;
    };
  }, [ready, pos.translation, pos.book, pos.chapter]);
  const cursor = useRef(pos);
  const update = (s: Partial<ReadingSettings>) => U((v) => ({ ...v, ...s }));
  const ref = `${BOOK_NAMES[pos.book - 1]} ${pos.chapter}:${pos.verse}`;
  const read = (
    book = pos.book,
    c = pos.chapter,
    v = 1,
    t = pos.translation,
  ) => {
    Seek((n) => n + 1);
    cursor.current = { book, chapter: c, verse: v, index: -1, translation: t };
    S({ ...cursor.current });
    P("Read");
    Q("");
  };
  const next = (direction = 1) => {
    const c = pos.chapter + direction;
    if (c > CHAPTER_COUNTS[pos.book - 1]) {
      if (pos.book < 66) read(pos.book + 1, 1);
    } else if (c < 1) {
      if (pos.book > 1) read(pos.book - 1, CHAPTER_COUNTS[pos.book - 2]);
    } else read(pos.book, c);
  };
  const currentVerse =
    data?.verses.find((v) => v.verse === pos.verse) || data?.verses[0];
  // Passage data must remain independent of the current word and verse. Position updates
  // otherwise create a new chapter object and reset the active playback scheduler.
  const filteredData = useMemo(() => {
    if (
      !data ||
      data.translation !== pos.translation ||
      data.book !== pos.book ||
      data.chapter !== pos.chapter
    )
      return undefined;
    if (!range || data.book !== range.book || data.chapter !== range.end)
      return data;
    return {
      ...data,
      verses: data.verses.filter((v) => v.verse <= range.verseEnd),
    };
  }, [data, range, pos.translation, pos.book, pos.chapter]);
  async function saveVerse() {
    const item: Saved = {
      id: `${pos.book}:${pos.chapter}:${pos.verse}`,
      book: pos.book,
      chapter: pos.chapter,
      verse: pos.verse,
      translation: pos.translation,
      note,
      tags,
      highlight: true,
    };
    const list = [item, ...saved.filter((s) => s.id !== item.id)];
    await set("saved", list);
    B(list);
    Q("");
    N("Verse saved to your library.");
  }
  async function search() {
    Z(true);
    G([]);
    E("");
    const match = query
      .trim()
      .match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?(?:-(\d+))?$/);
    if (match) {
      const name = match[1].toLowerCase().replace(/^psalm$/, "psalms");
      const b = BOOK_NAMES.findIndex((n) => n.toLowerCase() === name);
      if (b >= 0 && +match[2] >= 1 && +match[2] <= CHAPTER_COUNTS[b]) {
        Range(
          match[4] || match[5]
            ? {
                book: b + 1,
                start: +match[2],
                end: +(match[5] || match[2]),
                verseEnd: +(match[4] || 999),
              }
            : null,
        );
        read(b + 1, +match[2], +(match[3] || 1));
        Z(false);
        return;
      }
    }
    const hits: typeof results = [];
    try {
      for (let b = 1; b <= 66; b++) {
        for (let c = 1; c <= CHAPTER_COUNTS[b - 1]; c++) {
          const d = await chapter(pos.translation, b, c);
          for (const v of d.verses)
            if (
              v.text
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase())
            )
              hits.push({ book: b, chapter: c, verse: v.verse, text: v.text });
          if (hits.length >= 100) break;
        }
        if (hits.length >= 100) break;
      }
      G(hits.slice(0, 100));
      if (!hits.length) N("No matching verses found.");
    } catch (e) {
      E(String(e));
    }
    Z(false);
  }
  async function compareVerse() {
    Q("compare");
    try {
      C(
        await Promise.all(
          translations.map((t) => chapter(t, pos.book, pos.chapter)),
        ),
      );
    } catch (e) {
      E(String(e));
    }
  }
  async function complete() {
    await set(`completed:${pos.book}:${pos.chapter}`, true);
    const completed = (await get<string[]>("completed")) || [];
    if (!completed.includes(`${pos.book}:${pos.chapter}`))
      await set("completed", [...completed, `${pos.book}:${pos.chapter}`]);
    N("Chapter presented. Take a moment to review.");
  }
  async function install(t: string) {
    try {
      DP(`Downloading ${t}…`);
      await navigator.storage?.persist?.();
      await downloadTranslation(
        t,
        CHAPTER_COUNTS.map((chapters, i) => ({ id: i + 1, chapters })),
        (n, total) => DP(`${t}: ${n} / ${total} chapters`),
      );
      I((a) => [...new Set([...a, t])]);
      DP(`${t} is available offline.`);
    } catch (e) {
      DP(`Download stopped safely: ${String(e)}. Download again to resume.`);
    }
  }
  function narrate() {
    if (!("speechSynthesis" in window)) {
      N("Read aloud is unavailable in this browser.");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      data?.verses.map((v) => v.text).join(" ") || "",
    );
    utterance.rate = 0.85;
    utterance.onstart = () => backgroundAudio.duck(true);
    utterance.onend = utterance.onerror = () => backgroundAudio.duck(false);
    speechSynthesis.speak(utterance);
    N("Browser narration uses its own timing; RSVP is not synchronized.");
  }
  useEffect(() => {
    if (!modal && onboard < 0) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modal) {
        Q("");
        return;
      }
      if (e.key === "Tab") {
        const nodes = focusable();
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, [modal, onboard]);
  useEffect(() => {
    if (mode !== "traditional" || page !== "Read" || !data) return;
    const key = `scroll:${pos.translation}:${pos.book}:${pos.chapter}`;
    get<number>(key).then((y) => {
      if (y) window.scrollTo(0, y);
      else
        document
          .getElementById(`verse-${pos.verse}`)
          ?.scrollIntoView({ block: "center" });
    });
    const save = () => void set(key, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [mode, page, data]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => N(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  const nav = [
    { name: "Home", icon: Home },
    { name: "Read", icon: BookOpen },
    { name: "Plans", icon: CalendarDays },
    { name: "Library", icon: Library },
    { name: "Settings", icon: Settings },
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            P("Home");
          }}
        >
          <span className="brand-icon">
            <BookOpen size={25} />
          </span>
          <span>
            Scripture<span className="brand-second">Focus</span>
          </span>
        </a>
        <p className="sidebar-caption">MAKE ROOM FOR THE WORD</p>
        <nav aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => {
                P(name);
                Q("");
                get<any[]>("sessions").then((s) => J(s || []));
              }}
            >
              <Icon size={19} />
              <span>{name}</span>
              {page === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-badge">
            <span /> A quiet, private space
          </div>
          <p>
            No accounts. No distractions.
            <br />
            Just you and Scripture.
          </p>
          <button
            className="theme-toggle"
            onClick={() => T(theme === "light" ? "dark" : "light")}
          >
            <Sun size={16} /> <span>Appearance</span>
            <Moon size={16} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {page === "Home" ? "YOUR DAILY PAUSE" : page.toUpperCase()}
          </span>
          <div>
            <span className="offline-dot" /> LOCAL & PRIVATE{" "}
            <button
              className="icon-button"
              aria-label="Search Scripture"
              onClick={() => Q("choose")}
            >
              <Search size={18} />
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="notice error">
            {error}
            <button onClick={() => E("")}>Dismiss</button>
          </div>
        )}
        {notice && (
          <div role="status" className="toast">
            {notice}
            <button aria-label="Dismiss" onClick={() => N("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {page === "Home" && (
          <div className="content home">
            <div className="intro">
              <span className="eyebrow">SLOW DOWN. DRAW NEAR.</span>
              <h1>
                A little stillness.
                <br />
                <em>A little Scripture.</em>
              </h1>
              <p>
                A quiet space to give the Word your full attention.
                <br className="desktop-only" /> One word, one verse, one moment
                at a time.
              </p>
            </div>
            <div className="home-grid">
              <section className="continue-card">
                <div className="card-heading">
                  <span className="eyebrow">CONTINUE READING</span>
                  <BookOpen size={21} />
                </div>
                <div>
                  <h2>
                    {BOOK_NAMES[pos.book - 1]} {pos.chapter}
                  </h2>
                  <p>
                    {pos.translation}
                    {pos.translation === "BLB" ? " · Draft" : ""} <span>·</span>{" "}
                    Verse {pos.verse} <span>·</span> {settings.wpm} WPM
                  </p>
                  <p className="passage-excerpt">
                    {currentVerse?.text ||
                      "Your next moment in Scripture starts here."}
                  </p>
                </div>
                <div className="continue-bottom">
                  <button
                    className="button primary"
                    onClick={() => {
                      P("Read");
                      M("rsvp");
                    }}
                  >
                    Resume reading <ArrowRight size={17} />
                  </button>
                  <span>Pick up where you left off</span>
                </div>
              </section>
              <section className="intention-card">
                <Feather size={25} />
                <span className="eyebrow">READ WITH INTENTION</span>
                <h3>Attention over speed.</h3>
                <p>
                  There is no finish line here. Find a comfortable pace, and
                  give each word room to settle.
                </p>
                <button onClick={() => Q("about")}>
                  A different way to read <ArrowUpRight size={16} />
                </button>
              </section>
            </div>
            <div className="section-heading">
              <h2>Make this moment yours</h2>
              <span>BEGIN WITH A LITTLE SPACE</span>
            </div>
            <div className="quick-grid">
              <button
                className="quick-card"
                onClick={() => {
                  M("rsvp");
                  P("Read");
                }}
              >
                <span className="quick-icon">
                  <PlayIcon />
                </span>
                <ArrowUpRight className="quick-arrow" size={18} />
                <h3>Quick focus</h3>
                <p>
                  One word at a time.
                  <br />
                  At your own pace.
                </p>
                <span className="tag">
                  {settings.wpm} WPM · {pos.translation}
                </span>
              </button>
              <button
                className="quick-card"
                onClick={() => {
                  V({
                    book: pos.book,
                    chapter: pos.chapter,
                    verse: 1,
                    endChapter: pos.chapter,
                    endVerse: 999,
                  });
                  Q("choose");
                }}
              >
                <span className="quick-icon">
                  <BookOpen size={21} />
                </span>
                <ArrowUpRight className="quick-arrow" size={18} />
                <h3>Choose Scripture</h3>
                <p>
                  Open a familiar passage.
                  <br />
                  Or begin somewhere new.
                </p>
                <span className="small-link">Browse the Bible</span>
              </button>
              <button className="quick-card" onClick={() => Q("session")}>
                <span className="quick-icon">
                  <Target size={21} />
                </span>
                <ArrowUpRight className="quick-arrow" size={18} />
                <h3>Set aside time</h3>
                <p>
                  Five minutes or a little longer.
                  <br />
                  Make room in your day.
                </p>
                <span className="small-link">Start a reading session</span>
              </button>
            </div>
            <div className="home-lower">
              <section>
                <div className="section-heading">
                  <h2>A steady rhythm</h2>
                  <button onClick={() => P("Plans")}>
                    View plans <ArrowRight size={15} />
                  </button>
                </div>
                <HomePlan
                  onRead={(b, c) => read(b, c)}
                  onPlans={() => P("Plans")}
                />
              </section>
              <section className="quiet-note">
                <span className="eyebrow">ALWAYS WITH YOU</span>
                <p>Read wherever you find stillness.</p>
                <span>
                  Download a translation to make Scripture available offline.
                </span>
                <button onClick={() => P("Settings")}>
                  Manage offline library <ArrowRight size={14} />
                </button>
              </section>
            </div>
            <footer>
              <span className="tiny-mark">✦</span> Free to read. Private by
              design. Made for attention.
            </footer>
          </div>
        )}
        {page === "Read" && (
          <div className="content read-content">
            <div className="read-heading">
              <button className="passage-picker" onClick={() => Q("choose")}>
                {BOOK_NAMES[pos.book - 1]} {pos.chapter} <span>⌄</span>
              </button>
              <select
                aria-label="Bible translation"
                onFocus={() => PauseControls(true)}
                onBlur={() => PauseControls(false)}
                value={pos.translation}
                onChange={(e) => {
                  cursor.current = {
                    ...pos,
                    translation: e.target.value,
                    index: -1,
                  };
                  S({ ...cursor.current });
                }}
              >
                {translations.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <div className="segmented">
                {[
                  ["rsvp", "Focus"],
                  ["traditional", "Read"],
                  ["memory", "Memorize"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={mode === v ? "selected" : ""}
                    onClick={() => M(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {pos.translation === "BLB" && (
              <p className="draft-notice">
                Berean Literal Bible · Full-Bible draft. Publisher text may
                change.
              </p>
            )}
            {data ? (
              <>
                {mode === "rsvp" && filteredData && (
                  <Reader
                    key={`${pos.translation}:${pos.book}:${pos.chapter}:${seekEpoch}`}
                    data={filteredData}
                    completeChapter={
                      filteredData.verses.length === data.verses.length
                    }
                    initial={
                      cursor.current.book === pos.book &&
                      cursor.current.chapter === pos.chapter &&
                      cursor.current.translation === pos.translation
                        ? cursor.current.index
                        : pos.index
                    }
                    initialVerse={pos.verse}
                    paused={!!modal || onboard >= 0 || controlsOpen}
                    settings={settings}
                    update={update}
                    reference={ref}
                    onPosition={(i, v) => {
                      cursor.current = { ...pos, index: i, verse: v };
                      if (v !== pos.verse)
                        S((p) => ({ ...p, index: i, verse: v }));
                    }}
                    onVerse={(v) => S((p) => ({ ...p, verse: v, index: -1 }))}
                    onContext={() => {
                      S({ ...cursor.current });
                      M("traditional");
                    }}
                    onNext={() => next()}
                    onSave={() => {
                      Note("");
                      Tags("");
                      Q("save");
                    }}
                    onAudio={() => Q("audio")}
                    onComplete={complete}
                    sessionMinutes={sessionMinutes}
                  />
                )}
                {mode === "traditional" && (
                  <article
                    className="traditional card"
                    style={{
                      fontFamily: settings.font,
                      fontSize: Math.max(18, settings.fontSize / 2.5),
                    }}
                  >
                    <div className="traditional-tools">
                      <button
                        onClick={() => {
                          Q("save");
                          Note("");
                          Tags("");
                        }}
                      >
                        <Bookmark size={17} /> Save verse
                      </button>
                      <button onClick={compareVerse}>
                        <Columns2 size={17} /> Compare
                      </button>
                      <button onClick={narrate}>
                        <Volume2 size={17} /> Read aloud
                      </button>
                      <button
                        onClick={() => {
                          if ("speechSynthesis" in window)
                            speechSynthesis.cancel();
                          backgroundAudio.duck(false);
                        }}
                      >
                        Stop audio
                      </button>
                      <button
                        onClick={() =>
                          document.documentElement.requestFullscreen?.()
                        }
                      >
                        Full screen
                      </button>
                    </div>
                    <h1>
                      {BOOK_NAMES[pos.book - 1]} {pos.chapter}
                    </h1>
                    {data.titles?.map((t, i) => (
                      <p className="psalm-title" key={i}>
                        {t.text}
                      </p>
                    ))}
                    {data.verses.map((v) => (
                      <div key={v.verse}>
                        {v.heading && (
                          <h4 className="editorial-heading">
                            {v.heading} <small>Editorial heading</small>
                          </h4>
                        )}
                        <p
                          id={`verse-${v.verse}`}
                          className={
                            (v.verse === pos.verse ? "current-verse " : "") +
                            (saved.some(
                              (s) =>
                                s.book === pos.book &&
                                s.chapter === pos.chapter &&
                                s.verse === v.verse,
                            )
                              ? "highlighted"
                              : "")
                          }
                          onClick={() =>
                            (() => {
                              cursor.current = {
                                ...pos,
                                verse: v.verse,
                                index: -1,
                              };
                              S({ ...cursor.current });
                            })()
                          }
                        >
                          <button
                            className="verse-number"
                            aria-label={`Select verse ${v.verse}`}
                            onClick={() =>
                              (() => {
                                cursor.current = {
                                  ...pos,
                                  verse: v.verse,
                                  index: -1,
                                };
                                S({ ...cursor.current });
                              })()
                            }
                          >
                            {v.verse}
                          </button>{" "}
                          {v.sourceEmpty ? (
                            <span className="source-omission">
                              This numbered verse is absent from the publisher’s
                              main text. No substitute has been inserted.
                            </span>
                          ) : v.segments?.length ? (
                            v.segments.map((s, i) =>
                              s.italic ? (
                                <i key={i}>{s.text}</i>
                              ) : (
                                <span key={i}>{s.text}</span>
                              ),
                            )
                          ) : (
                            v.text
                          )}
                        </p>
                      </div>
                    ))}
                    <button
                      className="button"
                      onClick={() => {
                        M("rsvp");
                      }}
                    >
                      Return to Focus · verse {pos.verse}
                    </button>
                    <div className="reflection">
                      <h3>A moment to reflect</h3>
                      <p className="muted">
                        What would you like to remember from this chapter?
                      </p>
                      <textarea
                        aria-label="Personal reflection"
                        placeholder="Your private reflection…"
                        value={reflection}
                        onChange={(e) => {
                          Reflection(e.target.value);
                          void set(
                            `reflection:${pos.book}:${pos.chapter}`,
                            e.target.value,
                          );
                        }}
                      />
                      <button
                        onClick={() => {
                          update({ wpm: 150 });
                          M("rsvp");
                        }}
                      >
                        Read again more slowly
                      </button>
                      <button onClick={complete}>Mark chapter read</button>
                    </div>
                  </article>
                )}
                {mode === "memory" && (
                  <MemorizePassage
                    key={`${pos.translation}:${pos.book}:${pos.chapter}`}
                    data={data}
                    verse={pos.verse}
                    onRsvp={(start, end) => {
                      Range({
                        book: pos.book,
                        start: pos.chapter,
                        end: pos.chapter,
                        verseEnd: end,
                      });
                      update({ wpm: 150 });
                      read(pos.book, pos.chapter, start);
                      M("rsvp");
                    }}
                  />
                )}
                <div className="chapter-nav">
                  <button onClick={() => next(-1)}>
                    <ChevronLeft size={17} /> Previous chapter
                  </button>
                  <span>
                    {pos.translation}{" "}
                    {pos.translation === "BLB" ? "· DRAFT" : ""}
                  </span>
                  <button onClick={() => next()}>
                    Next chapter <ChevronRight size={17} />
                  </button>
                </div>
              </>
            ) : (
              !error && <p className="loading">Opening Scripture…</p>
            )}
          </div>
        )}
        {page === "Plans" && (
          <div className="content">
            <div className="page-intro">
              <span className="eyebrow">A STEADY RHYTHM</span>
              <h1>Reading plans</h1>
              <p>A little each day. Space for the whole story.</p>
            </div>
            <Plans
              translation={pos.translation}
              speed={settings.wpm}
              onRead={(b, c) => read(b, c)}
            />
          </div>
        )}
        {page === "Library" && (
          <div className="content">
            <div className="page-intro">
              <span className="eyebrow">KEPT CLOSE</span>
              <h1>Your library</h1>
              <p>Words to return to. Thoughts to remember.</p>
            </div>
            <input
              className="library-search"
              aria-label="Filter saved passages"
              placeholder="Search notes, references, or tags…"
              value={filter}
              onChange={(e) => Filter(e.target.value)}
            />
            <div className="section-heading">
              <h2>Saved passages & notes</h2>
              <span>{saved.length} SAVED</span>
            </div>
            {saved
              .filter((s) =>
                `${BOOK_NAMES[s.book - 1]} ${s.chapter}:${s.verse} ${s.note} ${s.tags}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((s) => (
                <section className="card saved-item" key={s.id}>
                  <button
                    className="saved-reference"
                    onClick={() => read(s.book, s.chapter, s.verse)}
                  >
                    {BOOK_NAMES[s.book - 1]} {s.chapter}:{s.verse}{" "}
                    <ArrowUpRight size={16} />
                  </button>
                  <p>{s.note || "Saved for another quiet moment."}</p>
                  <span className="tag">{s.tags || s.translation}</span>
                  <button
                    onClick={() => {
                      S((p) => ({
                        ...p,
                        book: s.book,
                        chapter: s.chapter,
                        verse: s.verse,
                      }));
                      Note(s.note);
                      Tags(s.tags);
                      Q("save");
                    }}
                  >
                    Edit note
                  </button>
                  <button
                    onClick={() => {
                      const l = saved.filter((x) => x.id !== s.id);
                      B(l);
                      void set("saved", l);
                    }}
                  >
                    Remove
                  </button>
                </section>
              ))}
            {!saved.length && (
              <div className="empty card">
                <Bookmark size={28} />
                <h3>Make room for words that stay.</h3>
                <p>
                  Save a verse or write a note while reading. You’ll find it
                  here.
                </p>
                <button className="button" onClick={() => P("Read")}>
                  Open Scripture
                </button>
              </div>
            )}
            <Activity sessions={sessions} onRead={read} />
          </div>
        )}
        {page === "Settings" && (
          <div className="content settings">
            <div className="page-intro">
              <span className="eyebrow">YOUR READING INSTRUMENT</span>
              <h1>Make yourself comfortable.</h1>
              <p>Every preference stays on this device.</p>
            </div>
            <section className="card">
              <h2>Reading</h2>
              <label>
                Reading speed <strong>{settings.wpm} WPM</strong>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="25"
                  value={settings.wpm}
                  onChange={(e) => update({ wpm: +e.target.value })}
                />
              </label>
              <div className="row">
                {[150, 250, 400, 600].map((n) => (
                  <button
                    className="button"
                    key={n}
                    onClick={() => update({ wpm: n })}
                  >
                    {n} WPM
                  </button>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={settings.natural}
                  onChange={(e) => update({ natural: e.target.checked })}
                />{" "}
                Natural pacing · pause for punctuation and boundaries
              </label>
              <label>
                Typeface
                <select
                  value={settings.font}
                  onChange={(e) => update({ font: e.target.value })}
                >
                  <option value="Georgia, serif">Literary serif</option>
                  <option value="system-ui, sans-serif">Humanist sans</option>
                  <option value="monospace">Monospace</option>
                </select>
              </label>
              <label>
                Word size
                <input
                  type="range"
                  min="32"
                  max="96"
                  value={settings.fontSize}
                  onChange={(e) => update({ fontSize: +e.target.value })}
                />
              </label>
              <label>
                Font weight
                <select
                  value={settings.weight}
                  onChange={(e) => update({ weight: +e.target.value })}
                >
                  <option value="400">Regular</option>
                  <option value="600">Semibold</option>
                  <option value="700">Bold</option>
                </select>
              </label>
              {(["markers", "reference", "progress"] as const).map((k) => (
                <label className="check-label" key={k}>
                  <input
                    type="checkbox"
                    checked={settings[k]}
                    onChange={(e) => update({ [k]: e.target.checked })}
                  />
                  {k === "markers"
                    ? "Focal markers"
                    : k === "reference"
                      ? "Verse reference"
                      : "Reading progress"}
                </label>
              ))}
              <p className="muted">
                The focal letter is a reading aid, unrelated to red-letter Bible
                formatting.
              </p>
            </section>
            <section className="card">
              <h2>Appearance & accessibility</h2>
              <label>
                Theme
                <select value={theme} onChange={(e) => T(e.target.value)}>
                  <option value="light">Warm light</option>
                  <option value="dark">Charcoal dark</option>
                  <option value="black">True black · high contrast</option>
                </select>
              </label>
              <div className="row">
                {(["focal", "textColor", "background"] as const).map((k) => (
                  <label key={k}>
                    {k === "focal"
                      ? "Focal letter"
                      : k === "textColor"
                        ? "Text"
                        : "Reading background"}
                    <input
                      type="color"
                      value={
                        settings[k] ||
                        (k === "background" ? "#f6f4ee" : "#33352e")
                      }
                      onChange={(e) => update({ [k]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <button
                onClick={() =>
                  update({
                    textColor: "",
                    background: "",
                    focal: defaults.focal,
                  })
                }
              >
                Reset reading colors
              </button>
              <p className="muted">
                System reduced-motion preferences are respected. Traditional
                reading offers continuous text for screen readers.
              </p>
              <button className="button" onClick={() => Q("shortcuts")}>
                Keyboard shortcut guide
              </button>
            </section>
            <Audio />
            <section className="card">
              <h2>Translations & offline storage</h2>
              <p className="muted">
                Opened chapters are saved automatically. Download a complete
                translation for reliable offline reading.
              </p>
              {translations.map((t) => (
                <div className="translation-row" key={t}>
                  <div>
                    <strong>
                      {t}
                      {t === "BLB" ? " · Draft" : ""}
                    </strong>
                    <p>
                      {installed.includes(t)
                        ? "Complete translation saved offline"
                        : "Individual opened chapters cached"}
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={downloadProgress.includes(" / ")}
                    onClick={() => install(t)}
                  >
                    <Download size={16} />
                    {installed.includes(t) ? "Verify download" : "Download"}
                  </button>
                </div>
              ))}
              <p role="status">{downloadProgress}</p>
              <a href="/bibles/index.json" target="_blank" rel="noreferrer">
                Source versions and integrity metadata
              </a>
            </section>
            <section className="card">
              <h2>Data & privacy</h2>
              <p>
                Your reading data is stored locally and never sent to a service.
                JSON backups include preferences, notes, plans and progress.
                Imported audio is excluded; keep a separate copy.
              </p>
              <div className="row">
                <button
                  className="button"
                  onClick={async () => {
                    const blob = new Blob(
                      [JSON.stringify(await exportData(), null, 2)],
                      { type: "application/json" },
                    );
                    const u = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = u;
                    a.download = "scripture-focus-backup.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(u), 1000);
                  }}
                >
                  Export backup
                </button>
                <label className="button file-button">
                  Import backup
                  <input
                    type="file"
                    accept="application/json"
                    onChange={async (e) => {
                      try {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await importData(JSON.parse(await f.text()));
                        location.reload();
                      } catch (e) {
                        E(String(e));
                      }
                    }}
                  />
                </label>
                <button className="button danger" onClick={() => Q("clear")}>
                  Clear local data
                </button>
              </div>
              <button
                onClick={async () => {
                  const s = await navigator.storage?.estimate?.();
                  N(
                    `Storage: ${((s?.usage || 0) / 1048576).toFixed(1)} MB used of ${((s?.quota || 0) / 1048576).toFixed(0)} MB available.`,
                  );
                }}
              >
                Check storage use
              </button>
              <p className="muted">
                Install: use your browser’s Install option. On iOS, choose Share
                → Add to Home Screen.
              </p>
            </section>
          </div>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={page === name ? "active" : ""}
            onClick={() => P(name)}
          >
            <Icon size={20} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      {modal && (
        <div className="modal-backdrop" onClick={() => Q("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              autoFocus
              aria-label="Close dialog"
              onClick={() => Q("")}
            >
              <X size={22} />
            </button>
            {modal === "choose" && (
              <>
                <span className="eyebrow">OPEN THE WORD</span>
                <h2>Choose Scripture</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void search();
                  }}
                >
                  <label>
                    Reference, word, or phrase
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => F(e.target.value)}
                      placeholder="John 3:16 or in the beginning"
                    />
                  </label>
                  <button
                    disabled={searching || !query.trim()}
                    className="button primary"
                  >
                    {searching
                      ? "Searching local Scripture…"
                      : "Search Scripture"}
                  </button>
                </form>
                <p className="muted">
                  Phrase search scans installed chapters; a full offline
                  download is recommended. Up to 100 results.
                </p>
                <div className="row">
                  <label>
                    Book
                    <select
                      value={selection.book}
                      onChange={(e) =>
                        V((s) => ({
                          ...s,
                          book: +e.target.value,
                          chapter: 1,
                          endChapter: 1,
                        }))
                      }
                    >
                      {BOOK_NAMES.map((b, i) => (
                        <option value={i + 1} key={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Chapter
                    <input
                      type="number"
                      min="1"
                      max={CHAPTER_COUNTS[selection.book - 1]}
                      value={selection.chapter}
                      onChange={(e) =>
                        V((s) => ({
                          ...s,
                          chapter: +e.target.value,
                          endChapter: +e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Verse
                    <input
                      type="number"
                      min="1"
                      value={selection.verse}
                      onChange={(e) =>
                        V((s) => ({ ...s, verse: +e.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="row">
                  <label>
                    Through chapter
                    <input
                      type="number"
                      min={selection.chapter}
                      max={CHAPTER_COUNTS[selection.book - 1]}
                      value={selection.endChapter}
                      onChange={(e) =>
                        V((s) => ({ ...s, endChapter: +e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Ending verse (999 = chapter end)
                    <input
                      type="number"
                      min="1"
                      value={selection.endVerse}
                      onChange={(e) =>
                        V((s) => ({ ...s, endVerse: +e.target.value }))
                      }
                    />
                  </label>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    if (
                      selection.chapter < 1 ||
                      selection.chapter > CHAPTER_COUNTS[selection.book - 1] ||
                      selection.endChapter < selection.chapter
                    ) {
                      N("Choose a valid chapter range.");
                      return;
                    }
                    Range({
                      book: selection.book,
                      start: selection.chapter,
                      end: selection.endChapter,
                      verseEnd: selection.endVerse,
                    });
                    read(selection.book, selection.chapter, selection.verse);
                  }}
                >
                  Open passage <ArrowRight size={17} />
                </button>
                {results.map((r) => (
                  <button
                    className="search-result"
                    key={`${r.book}:${r.chapter}:${r.verse}`}
                    onClick={() => read(r.book, r.chapter, r.verse)}
                  >
                    <strong>
                      {BOOK_NAMES[r.book - 1]} {r.chapter}:{r.verse}
                    </strong>
                    <p>{r.text}</p>
                  </button>
                ))}
              </>
            )}
            {modal === "save" && (
              <>
                <h2>Keep this verse close.</h2>
                <p>
                  {ref} · {pos.translation}
                </p>
                <blockquote>{currentVerse?.text}</blockquote>
                <label>
                  Private note
                  <textarea
                    value={note}
                    onChange={(e) => Note(e.target.value)}
                    placeholder="What would you like to remember?"
                  />
                </label>
                <label>
                  Tags
                  <input
                    value={tags}
                    onChange={(e) => Tags(e.target.value)}
                    placeholder="Hope, study, return to…"
                  />
                </label>
                <button className="button primary" onClick={saveVerse}>
                  Save verse & note
                </button>
                <button
                  className="button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(
                        `${currentVerse?.text} — ${ref} (${pos.translation})`,
                      )
                      .then(() => N("Verse copied."))
                      .catch(() =>
                        N(
                          "Select the verse in traditional reading to copy it.",
                        ),
                      )
                  }
                >
                  <Copy size={16} /> Copy
                </button>
              </>
            )}
            {modal === "audio" && (
              <>
                <h2>Space for focus.</h2>
                <Audio />
              </>
            )}
            {modal === "compare" && (
              <>
                <h2>{ref}</h2>
                <p className="muted">
                  Translations are shown verbatim. Missing verse numbering is
                  never filled with another translation.
                </p>
                <div className="comparison">
                  {compare.map((c) => (
                    <div className="card" key={c.translation}>
                      <h3>
                        {c.translation}
                        {c.translation === "BLB" ? " · Draft" : ""}
                      </h3>
                      <p>
                        {c.verses.find((v) => v.verse === pos.verse)?.text ||
                          "This numbered verse is not present in this source."}
                      </p>
                      <button
                        onClick={() => {
                          read(pos.book, pos.chapter, pos.verse, c.translation);
                          M("rsvp");
                        }}
                      >
                        Read in Focus
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {modal === "session" && (
              <>
                <h2>Make a little room.</h2>
                <p>How long would you like to spend reading?</p>
                <div className="row">
                  {[5, 10, 15, 20, 30].map((n) => (
                    <button className="button" key={n} onClick={() => SM(n)}>
                      {n} min
                    </button>
                  ))}
                </div>
                <label>
                  Minutes
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={sessionMinutes || 5}
                    onChange={(e) =>
                      SM(Math.max(1, Math.min(240, +e.target.value)))
                    }
                  />
                </label>
                <p className="muted">
                  About {(sessionMinutes || 5) * settings.wpm} words at your
                  selected pace. The session stops at a verse boundary.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    SM(sessionMinutes || 5);
                    P("Read");
                    M("rsvp");
                    Q("");
                  }}
                >
                  Begin session
                </button>
              </>
            )}
            {modal === "shortcuts" && (
              <>
                <h2>Keep your attention here.</h2>
                <p>
                  Space · play / pause
                  <br />← / → · rewind / skip five words
                  <br />↑ / ↓ · adjust speed by 25 WPM
                  <br />
                  Esc · exit full screen
                </p>
                <p>
                  On touchscreens, tap to play, swipe sideways to move five
                  words, or swipe up for context. Every gesture has a visible
                  control.
                </p>
              </>
            )}
            {modal === "about" && (
              <>
                <h2>One word. A steady focus.</h2>
                <div className="demo-word">
                  be<span>g</span>inning
                </div>
                <p>
                  The muted red letter stays in one place as words change. Rest
                  your eyes on that point and let the words come to you.
                </p>
                <p>
                  Start comfortably. Pause often. Use View in Context whenever
                  you want to see the complete passage.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    Q("");
                    P("Read");
                  }}
                >
                  Begin reading
                </button>
              </>
            )}
            {modal === "clear" && (
              <>
                <h2>Clear this device?</h2>
                <p>
                  This removes notes, settings, progress, imported audio and
                  installed translations. Export a backup first if you want to
                  keep them.
                </p>
                <button
                  className="button danger"
                  onClick={async () => {
                    backgroundAudio.pause();
                    await clearData();
                    for (const k of await caches.keys()) await caches.delete(k);
                    location.reload();
                  }}
                >
                  Clear all local data
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {onboard >= 0 && ready && (
        <div className="modal-backdrop">
          <section
            className="modal onboarding"
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Scripture Focus"
          >
            <BookOpen size={30} />
            <span className="eyebrow">WELCOME TO SCRIPTURE FOCUS</span>
            <h2>
              {
                [
                  "Make room for the Word.",
                  "Find a comfortable pace.",
                  "Choose your quiet.",
                  "A steady point of attention.",
                  "Your next moment starts here.",
                ][onboard]
              }
            </h2>
            {onboard === 0 && (
              <>
                <p>Choose a translation. You can switch any time.</p>
                <select
                  aria-label="Starting translation"
                  value={pos.translation}
                  onChange={(e) =>
                    S((p) => ({ ...p, translation: e.target.value }))
                  }
                >
                  {translations.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <p className="muted">BLB is a publisher draft.</p>
              </>
            )}
            {onboard === 1 && (
              <>
                <p>Attention matters more than speed. Start slowly.</p>
                <input
                  aria-label="Starting speed"
                  type="range"
                  min="100"
                  max="500"
                  step="25"
                  value={settings.wpm}
                  onChange={(e) => update({ wpm: +e.target.value })}
                />
                <p>{settings.wpm} words per minute</p>
              </>
            )}
            {onboard === 2 && (
              <>
                <p>
                  Silence is the default. Import your own instrumental audio in
                  Settings whenever you’d like.
                </p>
                <span className="tag">Silence selected</span>
              </>
            )}
            {onboard === 3 && (
              <>
                <div className="demo-word">
                  be<span>g</span>inning
                </div>
                <p>
                  The red focal letter stays in the same place. Rest your eyes
                  there. Pause whenever you need.
                </p>
              </>
            )}
            {onboard === 4 && (
              <p>
                Genesis 1 is ready. Your progress stays on this device, with no
                account and no tracking.
              </p>
            )}
            <div className="onboarding-bottom">
              <button
                onClick={() => {
                  O(-1);
                  void set("onboarded", true);
                }}
              >
                Skip introduction
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (onboard === 4) {
                    O(-1);
                    void set("onboarded", true);
                    P("Read");
                  } else O(onboard + 1);
                }}
              >
                {onboard === 4 ? "Open Scripture" : "Continue"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="muted">{onboard + 1} of 5</p>
          </section>
        </div>
      )}
    </div>
  );
}
function PlayIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M8 4L20 12L8 20Z" />
    </svg>
  );
}
function Activity({
  sessions,
  onRead,
}: {
  sessions: any[];
  onRead: (b: number, c: number, v?: number) => void;
}) {
  const [history, H] = useState<any[]>([]),
    [completed, C] = useState<string[]>([]);
  useEffect(() => {
    get<any[]>("history").then((h) => H(h || []));
    get<string[]>("completed").then((c) => C(c || []));
  }, []);
  const words = sessions.reduce((n, s) => n + (s.words || 0), 0),
    minutes = sessions.reduce((n, s) => n + (s.ms || 0), 0) / 60000;
  return (
    <>
      <div className="section-heading">
        <h2>Your reading, quietly kept.</h2>
      </div>
      <Statistics sessions={sessions} />
      <h3>Recent passages</h3>
      {history.slice(0, 8).map((h, i) => (
        <button
          className="history-row"
          key={i}
          onClick={() => onRead(h.book, h.chapter, h.verse)}
        >
          <BookOpen size={17} />
          {BOOK_NAMES[h.book - 1]} {h.chapter}:{h.verse}
          <span>{h.translation}</span>
        </button>
      ))}
    </>
  );
}
