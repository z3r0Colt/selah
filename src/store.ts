import { openDB } from "idb";
export const database = openDB("scripture-focus", 1, {
  upgrade(db) {
    db.createObjectStore("kv");
    db.createObjectStore("chapters");
  },
});
export async function get<T>(key: string): Promise<T | undefined> {
  return (await database).get("kv", key);
}
export async function set(key: string, value: unknown) {
  await (await database).put("kv", value, key);
}
export async function exportData() {
  const db = await database;
  const keys = await db.getAllKeys("kv");
  return {
    format: "scripture-focus",
    version: 1,
    exported: new Date().toISOString(),
    entries: await Promise.all(
      keys
        .filter((k) => !String(k).startsWith("audio"))
        .map(async (k) => [k, await db.get("kv", k)]),
    ),
  };
}
export async function importData(data: any) {
  if (
    data?.format !== "scripture-focus" ||
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    data.entries.some(
      (e: any) =>
        !Array.isArray(e) || e.length !== 2 || typeof e[0] !== "string",
    )
  )
    throw Error("Invalid Scripture Focus backup");
  const db = await database;
  const tx = db.transaction("kv", "readwrite");
  for (const [key, value] of data.entries) await tx.store.put(value, key);
  await tx.done;
}
export async function clearData() {
  const db = await database;
  await db.clear("kv");
  await db.clear("chapters");
}
export type Verse = {
  verse: number;
  text: string;
  sourceEmpty?: boolean;
  notes?: string[];
  segments?: { text: string; italic?: boolean }[];
  paragraph?: boolean;
  heading?: string;
};
export type Chapter = {
  translation: string;
  book: number;
  chapter: number;
  verses: Verse[];
  titles?: { text: string; kind: string }[];
};
export async function chapter(
  t: string,
  b: number,
  c: number,
): Promise<Chapter> {
  const key = `${t}/${b}/${c}`;
  const db = await database;
  const saved = await db.get("chapters", key);
  if (saved) return saved;
  const response = await fetch(`/bibles/${key}.json`);
  if (!response.ok)
    throw Error(
      "Chapter is not available offline. Download this translation in Settings.",
    );
  const data = await response.json();
  if (!Array.isArray(data.verses)) throw Error("Invalid chapter data");
  await db.put("chapters", data, key);
  return data;
}
export async function downloadTranslation(
  t: string,
  books: { id: number; chapters: number }[],
  progress: (n: number, total: number) => void,
) {
  let n = 0;
  const total = books.reduce((s, b) => s + b.chapters, 0);
  for (const b of books)
    for (let c = 1; c <= b.chapters; c++) {
      await chapter(t, b.id, c);
      progress(++n, total);
    }
  await set(`installed:${t}`, true);
}
