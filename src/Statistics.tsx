import { useEffect, useState } from "react";
import { get } from "./store";
import { BOOK_NAMES, CHAPTER_COUNTS } from "./plans";

function positive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}
function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function readingStatistics(
  sessions: any[],
  completed: string[],
  now = new Date(),
) {
  const unique = new Set(
    completed.filter((ref) => {
      if (typeof ref !== "string") return false;
      const match = ref.match(/^(\d+):(\d+)$/);
      if (!match) return false;
      const book = Number(match[1]),
        chapter = Number(match[2]);
      return (
        book >= 1 &&
        book <= 66 &&
        chapter >= 1 &&
        chapter <= CHAPTER_COUNTS[book - 1]
      );
    }),
  );
  const completedBooks = CHAPTER_COUNTS.flatMap((count, index) =>
    Array.from({ length: count }, (_, n) => `${index + 1}:${n + 1}`).every(
      (key) => unique.has(key),
    )
      ? [BOOK_NAMES[index]]
      : [],
  );
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    date.setDate(date.getDate() - 6 + index);
    return {
      date: localDate(date),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      longLabel: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      ms: 0,
      count: 0,
      words: 0,
    };
  });
  let words = 0,
    ms = 0,
    speedTotal = 0,
    speedWords = 0;
  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const wordCount = positive(session.words),
      duration = positive(session.ms);
    words += wordCount;
    ms += duration;
    const speed =
      positive(session.averageWpm) ||
      (wordCount && positive(session.speedSum)
        ? positive(session.speedSum) / wordCount
        : 0);
    if (speed && wordCount) {
      speedTotal += speed * wordCount;
      speedWords += wordCount;
    }
    const date = new Date(session.date);
    if (!Number.isFinite(date.getTime())) continue;
    const day = days.find((item) => item.date === localDate(date));
    if (day && (duration || wordCount)) {
      day.ms += duration;
      day.words += wordCount;
      day.count += 1;
    }
  }
  return {
    words,
    ms,
    averageWpm: speedWords ? Math.round(speedTotal / speedWords) : 0,
    chapters: unique.size,
    completedBooks,
    percentage: (unique.size / 1189) * 100,
    days,
  };
}
export default function Statistics({ sessions }: { sessions: any[] }) {
  const [completed, setCompleted] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    get<string[]>("completed")
      .then((value) => {
        if (live) setCompleted(Array.isArray(value) ? value : []);
      })
      .catch(() => {
        if (live)
          setError("Chapter completion statistics could not be loaded.");
      });
    return () => {
      live = false;
    };
  }, [sessions]);
  const stats = readingStatistics(sessions, completed);
  const maximum = Math.max(...stats.days.map((day) => day.ms / 60000), 1);
  return (
    <section aria-label="Private reading statistics">
      <div className="section-heading">
        <h2>Your reading, quietly kept.</h2>
      </div>
      {error && (
        <p role="status" className="muted">
          {error}
        </p>
      )}
      <div className="stats-grid">
        <div className="card">
          <strong>{(stats.ms / 60000).toFixed(1)}</strong>
          <span>minutes reading</span>
        </div>
        <div className="card">
          <strong>{stats.chapters.toLocaleString()}</strong>
          <span>
            chapters read · {stats.percentage.toFixed(1)}% of the Bible
          </span>
        </div>
        <div className="card">
          <strong>{stats.words.toLocaleString()}</strong>
          <span>words presented</span>
        </div>
        <div className="card">
          <strong>{stats.completedBooks.length}</strong>
          <span>books completed</span>
        </div>
        <div className="card">
          <strong>{stats.averageWpm || "—"}</strong>
          <span>average selected WPM · weighted by words</span>
        </div>
        <div className="card">
          <strong>{stats.days.reduce((n, day) => n + day.count, 0)}</strong>
          <span>reading sessions in the last 7 days</span>
        </div>
      </div>
      <article className="card" style={{ marginTop: 16 }}>
        <h3>A little space each day</h3>
        <p className="muted">Reading time over the last seven days</p>
        <svg
          role="img"
          aria-labelledby="reading-chart-title reading-chart-description"
          viewBox="0 0 560 180"
          style={{ display: "block", width: "100%", maxHeight: 230 }}
        >
          <title id="reading-chart-title">
            Reading activity, last seven days
          </title>
          <desc id="reading-chart-description">
            {stats.days
              .map(
                (day) =>
                  `${day.longLabel}: ${(day.ms / 60000).toFixed(1)} minutes, ${day.count} sessions`,
              )
              .join("; ")}
          </desc>
          <line
            x1="25"
            x2="535"
            y1="145"
            y2="145"
            stroke="currentColor"
            opacity=".15"
          />
          {stats.days.map((day, index) => {
            const height = (day.ms / 60000 / maximum) * 112,
              x = 37 + index * 75;
            return (
              <g key={day.date}>
                <rect
                  x={x}
                  y={145 - height}
                  width="35"
                  height={height}
                  rx="3"
                  fill="var(--accent, #9c4039)"
                />
                <text
                  x={x + 17.5}
                  y="168"
                  fill="currentColor"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {day.label}
                </text>
                {day.ms > 0 && (
                  <text
                    x={x + 17.5}
                    y={Math.max(15, 136 - height)}
                    fill="currentColor"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {(day.ms / 60000).toFixed(1)}m
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {!stats.words && !stats.ms && (
          <p className="muted">
            Your reading activity will appear here after a reading session.
          </p>
        )}
        <details>
          <summary>Reading activity as a table</summary>
          <table style={{ width: "100%", textAlign: "left", marginTop: 12 }}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Minutes</th>
                <th scope="col">Sessions</th>
                <th scope="col">Words</th>
              </tr>
            </thead>
            <tbody>
              {stats.days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.longLabel}</th>
                  <td>{(day.ms / 60000).toFixed(1)}</td>
                  <td>{day.count}</td>
                  <td>{day.words.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </article>
      {stats.completedBooks.length > 0 && (
        <p className="muted">
          Completed books: {stats.completedBooks.join(", ")}.
        </p>
      )}
      <p className="muted">
        Words presented and chapters marked read do not measure understanding,
        retention, or spiritual growth. All statistics stay on this device.
      </p>
    </section>
  );
}
