import { useEffect, useState } from "react";
import { get, set } from "./store";
type SavedMemory = {
  reference: string;
  text: string;
  rounds: number;
  due: string;
  interval: number;
  updated: string;
};
export default function Memory({
  text,
  reference,
  onRsvp,
}: {
  text: string;
  reference: string;
  onRsvp: () => void;
}) {
  const [method, setMethod] = useState("repetition");
  const [round, setRound] = useState(0),
    [target, setTarget] = useState(5),
    [reveal, setReveal] = useState(false),
    [answer, setAnswer] = useState("");
  const [revealedWords, setRevealedWords] = useState<number[]>([]);
  const [notice, setNotice] = useState(""),
    [saved, setSaved] = useState<SavedMemory[]>([]);
  useEffect(() => {
    get("memory-passages")
      .then((v) => setSaved((v as SavedMemory[]) || []))
      .catch(() => setNotice("Saved memory passages could not be loaded."));
  }, []);
  useEffect(() => {
    setRound(0);
    setReveal(false);
    setAnswer("");
  }, [text, reference]);
  useEffect(() => setRevealedWords([]), [round, method, text, reference]);
  async function remember(reviewed = false) {
    try {
      const current =
        ((await get("memory-passages")) as SavedMemory[] | undefined) || [];
      const old = current.find(
        (x) => x.reference === reference && x.text === text,
      );
      const interval = reviewed
        ? Math.min(90, old ? old.interval * 2 : 1)
        : old?.interval || 1;
      const due = new Date();
      due.setDate(due.getDate() + interval);
      const entry = {
        reference,
        text,
        rounds: (old?.rounds || 0) + (reviewed ? 1 : 0),
        interval,
        due: due.toISOString(),
        updated: new Date().toISOString(),
      };
      const next = [
        entry,
        ...current.filter(
          (x) => !(x.reference === reference && x.text === text),
        ),
      ];
      await set("memory-passages", next);
      setSaved(next);
      setNotice(
        reviewed
          ? `Review saved. Suggested next review: ${due.toLocaleDateString()}.`
          : "Passage saved for spaced review.",
      );
    } catch {
      setNotice("Could not save this passage. Check available storage.");
    }
  }
  const tokens = text.split(/(\s+)/);
  const hideLevel = Math.min(4, round);
  let index = 0;
  return (
    <section className="memory-panel">
      <div className="eyebrow">Keep the words close</div>
      <h2>Memorize Scripture</h2>
      <p className="muted">{reference}</p>
      <label>
        Practice method{" "}
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setRound(0);
            setReveal(false);
          }}
        >
          <option value="repetition">Repetition</option>
          <option value="hiding">Progressive hiding</option>
          <option value="recall">Recall</option>
          <option value="rsvp">RSVP review</option>
        </select>
      </label>
      {method === "repetition" && (
        <label>
          Repetitions{" "}
          <input
            type="number"
            min={1}
            max={100}
            value={target}
            onChange={(e) =>
              setTarget(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
            }
          />
        </label>
      )}
      {method === "recall" && (
        <div>
          <p>
            Type or recite the passage, then reveal the original to compare for
            yourself.
          </p>
          <label>
            Your recall{" "}
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write what you remember…"
            />
          </label>
        </div>
      )}
      {(method !== "recall" || reveal) && (
        <blockquote className="memory-text">
          {tokens.map((token, i) => {
            if (!token.trim()) return token;
            const ordinal = index++;
            const hidden =
              method === "hiding" &&
              !reveal &&
              !revealedWords.includes(ordinal) &&
              hideLevel > 0 &&
              (hideLevel === 4 || ordinal % 4 < hideLevel);
            return hidden ? (
              <button
                key={i}
                className="hidden-word"
                aria-label={`Reveal hidden word ${ordinal + 1}`}
                onClick={() => setRevealedWords([...revealedWords, ordinal])}
              >
                {"＿".repeat(Math.min(token.length, 10))}
              </button>
            ) : (
              <span key={i}>{token}</span>
            );
          })}
        </blockquote>
      )}
      <div className="actions">
        {method === "repetition" && (
          <button
            className="button"
            onClick={() => setRound(Math.min(target, round + 1))}
          >
            {round >= target
              ? "Repeat practice complete"
              : `Read again · ${round} / ${target}`}
          </button>
        )}
        {method === "hiding" && (
          <>
            <button
              className="button"
              onClick={() => {
                setRound(round + 1);
                setReveal(false);
              }}
            >
              Hide more words
            </button>
            <button
              className="button secondary"
              onClick={() => setReveal(!reveal)}
            >
              {reveal ? "Hide words again" : "Reveal all words"}
            </button>
          </>
        )}
        {method === "recall" && (
          <button className="button" onClick={() => setReveal(!reveal)}>
            {reveal ? "Practice again" : "Reveal passage"}
          </button>
        )}
        {method === "rsvp" && (
          <>
            <p className="muted">
              Review this passage with the fixed focal letter at a comfortable
              pace.
            </p>
            <button className="button" onClick={onRsvp}>
              Begin RSVP review
            </button>
          </>
        )}
        <button
          className="button secondary"
          onClick={() => {
            setRound(0);
            setReveal(false);
            setAnswer("");
          }}
        >
          Reset practice
        </button>
        <button className="button secondary" onClick={() => remember(false)}>
          Save passage
        </button>
        <button className="button secondary" onClick={() => remember(true)}>
          Mark reviewed
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <h3>Spaced review</h3>
      <p className="muted">
        Review intervals start at one day and double after each marked review.
        This is a reminder, not a measure of retention.
      </p>
      {!saved.length && <p>No saved memory passages yet.</p>}
      {saved.map((entry, i) => (
        <details className="card" key={`${entry.reference}-${i}`}>
          <summary>
            {entry.reference} ·{" "}
            {new Date(entry.due) <= new Date()
              ? "Ready to review"
              : `Review ${new Date(entry.due).toLocaleDateString()}`}
          </summary>
          <p>{entry.text}</p>
          <p className="muted">{entry.rounds} reviews recorded</p>
          <button
            className="button secondary"
            onClick={async () => {
              const due = new Date();
              const interval = Math.min(90, entry.interval * 2);
              due.setDate(due.getDate() + interval);
              const next = saved.map((x, n) =>
                n === i
                  ? {
                      ...x,
                      rounds: x.rounds + 1,
                      interval,
                      due: due.toISOString(),
                      updated: new Date().toISOString(),
                    }
                  : x,
              );
              try {
                await set("memory-passages", next);
                setSaved(next);
              } catch {
                setNotice("Could not save review.");
              }
            }}
          >
            Mark reviewed
          </button>
          <button
            className="button secondary"
            onClick={async () => {
              const next = saved.filter((_, n) => n !== i);
              try {
                await set("memory-passages", next);
                setSaved(next);
              } catch {
                setNotice("Could not remove passage.");
              }
            }}
          >
            Remove saved passage
          </button>
        </details>
      ))}
    </section>
  );
}
