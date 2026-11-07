import { useEffect, useState } from "react";
import { chapter, get, set } from "./store";
import {
  BOOK_NAMES,
  READING_PLANS,
  chapters,
  distribute,
  label,
  today,
  dateForDay,
  validateAssignments,
  chronologicalPlan,
  type ReadingPlan,
} from "./plans";

type Enrollment = {
  id: string;
  start: string;
  completed: number[];
  custom?: ReadingPlan;
};
export default function Plans({
  onRead,
  translation = "KJV",
  speed = 250,
}: {
  onRead: (book: number, chapter: number) => void;
  translation?: string;
  speed?: number;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [start, setStart] = useState(today());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [custom, setCustom] = useState(false);
  const [first, setFirst] = useState(1),
    [last, setLast] = useState(66),
    [duration, setDuration] = useState(30);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [chronological, setChronological] = useState<ReadingPlan | null>(null);
  const [chronologicalError, setChronologicalError] = useState("");
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const cached = await get<ReadingPlan>("chronological-plan");
        if (cached && !canceled) setChronological(cached);
        const response = await fetch("/plans/chronological.json");
        if (!response.ok)
          throw new Error("Chronological assignments are not available.");
        const verified = chronologicalPlan(await response.json());
        if (!canceled) {
          setChronological(verified);
          setChronologicalError("");
        }
        await set("chronological-plan", verified);
      } catch {
        if (!canceled)
          setChronologicalError(
            "The chronological schedule could not be refreshed. Previously saved assignments remain usable.",
          );
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    get("active-plan")
      .then((v) => {
        setEnrollment((v as Enrollment) || null);
        setLoaded(true);
      })
      .catch(() => {
        setError("Your reading plan could not be loaded.");
        setLoaded(true);
      });
  }, []);
  async function save(next: Enrollment | null) {
    try {
      await set("active-plan", next);
      setEnrollment(next);
      setError("");
    } catch {
      setError("The plan could not be saved. Check available device storage.");
    }
  }
  async function begin(plan: ReadingPlan) {
    if (!start || !Number.isFinite(new Date(`${start}T12:00:00`).getTime())) {
      setError("Choose a valid start date.");
      return;
    }
    if (
      enrollment &&
      !window.confirm(
        "Replace your active plan? Its progress will be saved in plan history.",
      )
    )
      return;
    if (enrollment) {
      const history =
        ((await get("plan-history")) as Enrollment[] | undefined) || [];
      await set("plan-history", [enrollment, ...history]);
    }
    await save({
      id: plan.id,
      start,
      completed: [],
      ...(!READING_PLANS.some((p) => p.id === plan.id) ? { custom: plan } : {}),
    });
    setSelectedDay(null);
    setNotice(
      "Your plan is ready. Read at a pace that lets you pay attention.",
    );
  }
  const availablePlans = chronological
    ? [...READING_PLANS, chronological]
    : READING_PLANS;
  const plan =
    enrollment?.custom || availablePlans.find((p) => p.id === enrollment?.id);
  const nextDay = plan
    ? plan.days.findIndex((_, i) => !enrollment?.completed.includes(i))
    : -1;
  const shownDay = selectedDay ?? (nextDay < 0 ? 0 : nextDay);
  useEffect(() => {
    let canceled = false;
    setWordCount(null);
    if (plan)
      Promise.all(
        (plan.days[shownDay] || []).map((ref) =>
          chapter(translation, ref.book, ref.chapter),
        ),
      )
        .then((values) => {
          if (!canceled)
            setWordCount(
              values.reduce(
                (total, value) =>
                  total +
                  value.verses.reduce(
                    (n, verse) =>
                      n + verse.text.split(/\s+/).filter(Boolean).length,
                    0,
                  ),
                0,
              ),
            );
        })
        .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [plan, shownDay, translation]);
  async function complete(day: number) {
    if (!enrollment || !plan) return;
    const completed = enrollment.completed.includes(day)
      ? enrollment.completed.filter((n) => n !== day)
      : [...enrollment.completed, day];
    await save({ ...enrollment, completed });
    setNotice(
      completed.length === plan.days.length
        ? "Plan complete. Your progress is saved on this device."
        : "Progress saved. Mark a day complete after reading its assigned passages.",
    );
  }
  async function importPlan(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const days = validateAssignments(payload.days);
      await begin({
        id: "imported",
        name: String(payload.name || "Imported reading plan").slice(0, 100),
        description:
          "Imported chapter assignments. Verify the sequence against your chosen source.",
        days,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import this plan.");
    }
  }
  if (!loaded) return <p role="status">Loading your plans…</p>;
  return (
    <section className="plans-page">
      <div className="eyebrow">A sustainable rhythm</div>
      <h1>Reading plans</h1>
      <p className="muted">
        A little structure. Space to linger. No streaks to protect.
      </p>
      {error && (
        <p role="alert" className="card">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      {enrollment && plan && (
        <article className="card">
          <div className="eyebrow">Your reading plan</div>
          <h2>{plan.name}</h2>
          <p>
            {enrollment.completed.length} of {plan.days.length} days complete
          </p>
          <progress
            aria-label="Reading plan progress"
            value={enrollment.completed.length}
            max={plan.days.length}
          />
          <div className="field-row">
            <label>
              Assignment{" "}
              <select
                value={shownDay}
                onChange={(e) => setSelectedDay(Number(e.target.value))}
              >
                {plan.days.map((_, i) => (
                  <option key={i} value={i}>
                    Day {i + 1} · {dateForDay(enrollment.start, i)}
                    {enrollment.completed.includes(i) ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="plan-assignment">
            {plan.days[shownDay]?.map((ref) => (
              <button
                className="button secondary"
                key={`${ref.book}-${ref.chapter}`}
                onClick={() => onRead(ref.book, ref.chapter)}
              >
                {label(ref)} ↗
              </button>
            ))}
          </div>
          {!plan.days[shownDay]?.length && (
            <p>A rest day. Revisit a passage or take time to reflect.</p>
          )}
          <p className="muted">
            {wordCount === null
              ? "Reading time is available when the assigned chapters are downloaded."
              : `About ${Math.max(1, Math.ceil(wordCount / Math.max(100, speed)))} minutes at ${speed} WPM · ${wordCount.toLocaleString()} words in ${translation}. Allow extra time for pauses and reflection.`}
          </p>
          <div className="actions">
            <button className="button" onClick={() => complete(shownDay)}>
              {enrollment.completed.includes(shownDay)
                ? "Mark incomplete"
                : "Mark day complete"}
            </button>
            <button
              className="button secondary"
              onClick={() => {
                if (nextDay < 0) return;
                const d = new Date(`${today()}T12:00:00`);
                d.setDate(d.getDate() - nextDay);
                const newStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                save({ ...enrollment, start: newStart });
                setNotice(
                  "Your next unfinished assignment is scheduled for today. Previous progress is kept.",
                );
              }}
            >
              Resume from today
            </button>
          </div>
        </article>
      )}
      <label className="field-row">
        Start date{" "}
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <div className="plan-grid">
        {availablePlans.map((p) => (
          <article className="card" key={p.id}>
            <span className="eyebrow">{p.days.length} days</span>
            <h2>{p.name}</h2>
            <p className="muted">{p.description}</p>
            {p.source && (
              <p className="muted">
                Source:{" "}
                <a href={p.source.url} target="_blank" rel="noreferrer">
                  {p.source.name}
                </a>{" "}
                · retrieved {p.source.retrieved}
              </p>
            )}
            <button className="button secondary" onClick={() => begin(p)}>
              Choose plan
            </button>
          </article>
        ))}
        <article className="card">
          <span className="eyebrow">Your own rhythm</span>
          <h2>Custom plan</h2>
          <p className="muted">
            Choose a range of books and a daily schedule, or import chapter
            assignments.
          </p>
          <button
            className="button secondary"
            onClick={() => setCustom(!custom)}
            aria-expanded={custom}
          >
            Create a plan
          </button>
          {custom && (
            <div>
              <label>
                First book{" "}
                <select
                  value={first}
                  onChange={(e) => setFirst(Number(e.target.value))}
                >
                  {BOOK_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Last book{" "}
                <select
                  value={last}
                  onChange={(e) => setLast(Number(e.target.value))}
                >
                  {BOOK_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Days{" "}
                <input
                  type="number"
                  min={1}
                  max={3660}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <button
                className="button"
                onClick={() => {
                  try {
                    if (first > last)
                      throw new Error("The last book must follow the first.");
                    begin({
                      id: "custom",
                      name: `${BOOK_NAMES[first - 1]} to ${BOOK_NAMES[last - 1]}`,
                      description: "Your custom canonical reading schedule.",
                      days: distribute(chapters(first, last), duration),
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Start custom plan
              </button>
            </div>
          )}
        </article>
      </div>
      {chronologicalError && (
        <p role="status" className="muted">
          {chronologicalError}
        </p>
      )}
      <article className="card">
        <h2>Import your own assignments</h2>
        <p className="muted">
          Follow another reading schedule by importing its chapter assignments.
        </p>
        <label className="button secondary">
          Import reading plan{" "}
          <input
            aria-label="Import reading plan JSON"
            type="file"
            accept="application/json,.json"
            onChange={(e) => importPlan(e.target.files?.[0])}
          />
        </label>
        <details>
          <summary>Plan file format</summary>
          <p>
            Use book numbers 1 (Genesis) to 66 (Revelation). Each nested array
            is one day's chapters. Preserve your source attribution in the name.
          </p>
          <pre>
            {'{"name":"Plan name · source", "days":[[{"book":1,"chapter":1}]]}'}
          </pre>
        </details>
      </article>
    </section>
  );
}
