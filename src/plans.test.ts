import { describe, it, expect } from "vitest";
import {
  chapters,
  distribute,
  READING_PLANS,
  validateAssignments,
  dateForDay,
} from "./plans";
describe("reading plan integrity", () => {
  it("includes each of the 1189 canonical chapters exactly once", () => {
    const all = chapters();
    expect(all).toHaveLength(1189);
    expect(new Set(all.map((r) => `${r.book}:${r.chapter}`)).size).toBe(1189);
    for (const id of ["year", "ninety"])
      expect(READING_PLANS.find((p) => p.id === id)!.days.flat()).toEqual(all);
  });
  it("covers all 260 New Testament chapters and each wisdom chapter", () => {
    expect(READING_PLANS.find((p) => p.id === "nt")!.days.flat()).toHaveLength(
      260,
    );
    expect(
      READING_PLANS.find((p) => p.id === "psalms")!.days.every(
        (day) => day.length === 5,
      ),
    ).toBe(true);
    expect(
      READING_PLANS.find((p) => p.id === "proverbs")!.days.every(
        (day) => day.length === 1,
      ),
    ).toBe(true);
  });
  it("validates imported references without manufacturing missing assignments", () => {
    expect(validateAssignments([[{ book: 19, chapter: 150 }]])).toEqual([
      [{ book: 19, chapter: 150 }],
    ]);
    expect(() => validateAssignments([[{ book: 19, chapter: 151 }]])).toThrow();
    expect(() => validateAssignments([[{ book: 0, chapter: 1 }]])).toThrow();
    expect(() => distribute(chapters(), 0)).toThrow();
  });
  it("keeps dates stable across month and year boundaries", () => {
    expect(dateForDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});
