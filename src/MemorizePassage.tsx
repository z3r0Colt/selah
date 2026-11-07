import { useState } from "react";
import Memory from "./Memory";
import type { Chapter } from "./store";
import { BOOK_NAMES } from "./plans";
export default function MemorizePassage({
  data,
  verse,
  onRsvp,
}: {
  data: Chapter;
  verse: number;
  onRsvp: (start: number, end: number) => void;
}) {
  const [first, F] = useState(verse),
    [last, L] = useState(verse);
  const verses = data.verses.filter(
    (v) => v.verse >= first && v.verse <= last && !v.sourceEmpty,
  );
  const reference = `${BOOK_NAMES[data.book - 1]} ${data.chapter}:${first}${last !== first ? "-" + last : ""} (${data.translation}${data.translation === "BLB" ? " draft" : ""})`;
  return (
    <section>
      <div className="card">
        <h3>Choose a memory passage</h3>
        <div className="row">
          <label>
            From verse
            <select
              value={first}
              onChange={(e) => {
                const n = +e.target.value;
                F(n);
                if (last < n) L(n);
              }}
            >
              {data.verses
                .filter((v) => !v.sourceEmpty)
                .map((v) => (
                  <option key={v.verse}>{v.verse}</option>
                ))}
            </select>
          </label>
          <label>
            Through verse
            <select value={last} onChange={(e) => L(+e.target.value)}>
              {data.verses
                .filter((v) => v.verse >= first && !v.sourceEmpty)
                .map((v) => (
                  <option key={v.verse}>{v.verse}</option>
                ))}
            </select>
          </label>
        </div>
        <p className="muted">
          The selected publisher text is kept verbatim. Hidden words can always
          be revealed.
        </p>
      </div>
      <Memory
        text={verses.map((v) => v.text).join("\n")}
        reference={reference}
        onRsvp={() => onRsvp(first, last)}
      />
    </section>
  );
}
