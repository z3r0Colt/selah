/** Canonical chapter assignments. Chapters are never split or silently omitted. */
export const BOOK_NAMES = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];
export const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1,
  22,
];
export type ChapterRef = { book: number; chapter: number };
export type ReadingPlan = {
  id: string;
  name: string;
  description: string;
  days: ChapterRef[][];
  source?: { name: string; url: string; sha256: string; retrieved: string };
};
export function chapters(first = 1, last = 66): ChapterRef[] {
  return CHAPTER_COUNTS.flatMap((count, index) =>
    index + 1 >= first && index + 1 <= last
      ? Array.from({ length: count }, (_, n) => ({
          book: index + 1,
          chapter: n + 1,
        }))
      : [],
  );
}
export function distribute(
  assignments: ChapterRef[],
  dayCount: number,
): ChapterRef[][] {
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 3660)
    throw new Error("Choose between 1 and 3,660 days.");
  return Array.from({ length: dayCount }, (_, day) =>
    assignments.slice(
      Math.floor((day * assignments.length) / dayCount),
      Math.floor(((day + 1) * assignments.length) / dayCount),
    ),
  );
}
export function label(ref: ChapterRef) {
  return `${BOOK_NAMES[ref.book - 1]} ${ref.chapter}`;
}
export const READING_PLANS: ReadingPlan[] = [
  {
    id: "year",
    name: "The Bible in a year",
    description:
      "All 1,189 chapters, in canonical order. A steady rhythm of three or four chapters each day.",
    days: distribute(chapters(), 365),
  },
  {
    id: "ninety",
    name: "The Bible in 90 days",
    description: "Read the complete Bible in canonical order over ninety days.",
    days: distribute(chapters(), 90),
  },
  {
    id: "nt",
    name: "New Testament in 30 days",
    description:
      "All 260 New Testament chapters, from Matthew through Revelation.",
    days: distribute(chapters(40, 66), 30),
  },
  {
    id: "psalms",
    name: "Psalms in 30 days",
    description: "Five psalms each day, in their printed order.",
    days: distribute(chapters(19, 19), 30),
  },
  {
    id: "proverbs",
    name: "Proverbs in 31 days",
    description: "One chapter of Proverbs a day.",
    days: distribute(chapters(20, 20), 31),
  },
];
export function validateAssignments(value: unknown): ChapterRef[][] {
  if (!Array.isArray(value) || !value.length || value.length > 3660)
    throw new Error("Expected an array of 1–3,660 daily chapter arrays.");
  return value.map((day) => {
    if (!Array.isArray(day))
      throw new Error("Each day must be an array of chapters.");
    return day.map((ref) => {
      if (
        !ref ||
        typeof ref !== "object" ||
        !Number.isInteger(ref.book) ||
        !Number.isInteger(ref.chapter) ||
        ref.book < 1 ||
        ref.book > 66 ||
        ref.chapter < 1 ||
        ref.chapter > CHAPTER_COUNTS[ref.book - 1]
      )
        throw new Error(
          "Every assignment needs a valid book number (1–66) and chapter number.",
        );
      return { book: ref.book, chapter: ref.chapter };
    });
  });
}
export function dateForDay(start: string, day: number): string {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Preserve the publisher's sequence; validation does not sort or regenerate assignments. */
export function chronologicalPlan(value: unknown): ReadingPlan {
  if (!value || typeof value !== "object")
    throw new Error("Invalid chronological plan.");
  const data = value as Record<string, unknown>;
  if (
    data.id !== "chronological" ||
    data.days !== 365 ||
    !Array.isArray(data.assignments) ||
    data.assignments.length !== 365
  )
    throw new Error(
      "Chronological plan must contain all 365 publisher assignments.",
    );
  const assignments = data.assignments.map((item, i) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid publisher assignment.");
    const day = item as Record<string, unknown>;
    if (day.day !== i + 1)
      throw new Error("Publisher day sequence is incomplete.");
    return day.chapters;
  });
  const days = validateAssignments(assignments);
  const refs = days.flat().map((ref) => `${ref.book}:${ref.chapter}`);
  if (refs.length !== 1189 || new Set(refs).size !== 1189)
    throw new Error(
      "Chronological plan must cover all 1,189 chapters exactly once.",
    );
  if (
    typeof data.source !== "string" ||
    typeof data.sourceUrl !== "string" ||
    !data.sourceUrl.startsWith("https://") ||
    typeof data.sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.sourceSha256) ||
    typeof data.retrieved !== "string"
  )
    throw new Error("Chronological source provenance is missing.");
  return {
    id: "chronological",
    name: String(data.name),
    description:
      "The complete Bible in the publisher-defined chronological reading order. Chapters remain in the supplied sequence.",
    days,
    source: {
      name: data.source,
      url: data.sourceUrl,
      sha256: data.sourceSha256,
      retrieved: data.retrieved,
    },
  };
}
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
