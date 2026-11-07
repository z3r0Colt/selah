import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(import.meta.dirname, "../public");
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const index = read("bibles/index.json");
const omissions = [
  "40:17:21",
  "40:18:11",
  "40:23:14",
  "41:7:16",
  "41:9:44",
  "41:9:46",
  "41:11:26",
  "41:15:28",
  "42:17:36",
  "42:23:17",
  "43:5:4",
  "44:8:37",
  "44:15:34",
  "44:24:7",
  "44:28:29",
  "45:16:24",
].sort();
describe("publisher Scripture snapshots", () => {
  it("documents the requested editions and marks the full-Bible literal draft", () => {
    expect(index.schemaVersion).toBe(1);
    expect(index.translations.map((t: any) => t.id)).toEqual([
      "KJV",
      "ASV",
      "BSB",
      "BLB",
    ]);
    expect(index.translations.find((t: any) => t.id === "BLB").draft).toBe(
      true,
    );
    expect(index.books).toHaveLength(66);
    expect(index.books[0].name).toBe("Genesis");
    expect(index.books[65].name).toBe("Revelation");
    for (const t of index.translations) {
      expect(t.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(t.url).toMatch(/^https:\/\//);
      expect(t.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  for (const edition of ["KJV", "ASV", "BSB", "BLB"])
    it(`${edition}: validates every chapter and exact omission set without filling any gaps`, () => {
      const manifest = index.translations.find((t: any) => t.id === edition);
      const empty: string[] = [];
      let chapters = 0,
        verses = 0;
      for (const book of index.books)
        for (let c = 1; c <= book.chapters; c++) {
          const ch = read(`bibles/${edition}/${book.id}/${c}.json`);
          chapters++;
          verses += ch.verses.length;
          expect([ch.translation, ch.book, ch.chapter]).toEqual([
            edition,
            book.id,
            c,
          ]);
          expect(ch.verses.length).toBe(
            manifest.chapterVerseCounts[`${book.id}:${c}`],
          );
          const labels = ch.verses.map((v: any) => v.verse);
          expect(labels).toEqual(
            [...new Set(labels)].sort((a: any, b: any) => a - b),
          );
          for (const v of ch.verses) {
            expect(v.text).toBe(
              v.segments
                .map((s: any) => s.text)
                .join("")
                .replace(/\s+/g, " ")
                .trim(),
            );
            if (!v.text) {
              expect(v.sourceEmpty).toBe(true);
              empty.push(`${book.id}:${c}:${v.verse}`);
            }
          }
        }
      expect(chapters).toBe(1189);
      expect(verses).toBe(31102);
      expect(empty.sort()).toEqual(edition === "KJV" ? [] : omissions);
    });
  it("keeps Psalm title treatment and supplied-word markings tied to the source", () => {
    const kjv = read("bibles/KJV/1/1.json");
    expect(kjv.verses[0].text).toBe(
      "In the beginning God created the heaven and the earth.",
    );
    expect(
      kjv.verses[1].segments.some(
        (s: any) => s.italic && s.text.includes("was"),
      ),
    ).toBe(true);
    const psalm = read("bibles/BSB/19/3.json");
    expect(psalm.verses[0].verse).toBe(1);
    expect(psalm.verses[0].text).toContain(
      "A Psalm of David, when he fled from his son Absalom. O LORD, how my foes have increased!",
    );
    expect(read("bibles/BLB/1/1.json").verses[1].text).toContain(
      "darkness [was]",
    );
  });
  it("uses a published chronological sequence with all chapters exactly once", () => {
    const plan = read("plans/chronological.json");
    expect(plan.sourceUrl).toContain("blueletterbible.org");
    expect(plan.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.assignments).toHaveLength(365);
    expect(plan.assignments[3].label).toBe("Job 1-5");
    const chapters = plan.assignments.flatMap((a: any) =>
      a.chapters.map((c: any) => `${c.book}:${c.chapter}`),
    );
    expect(chapters).toHaveLength(1189);
    expect(new Set(chapters).size).toBe(1189);
    for (const book of index.books)
      for (let chapter = 1; chapter <= book.chapters; chapter++)
        expect(chapters).toContain(`${book.id}:${chapter}`);
  });
});
