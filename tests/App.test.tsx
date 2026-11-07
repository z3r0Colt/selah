// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { clearData, database, get, set, type Chapter } from '../src/store';
import { tokenize } from '../src/engine';

// Use real publisher-derived chapter assets, rather than fabricated Scripture fixtures.
const chapters: Record<string, Chapter> = Object.fromEntries(['KJV', 'ASV', 'BSB', 'BLB'].map(translation => [translation, JSON.parse(readFileSync(`${process.cwd()}/public/bibles/${translation}/1/1.json`, 'utf8'))]));
let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const immediate = () => new Promise<void>(resolve => setImmediate(resolve));
async function flush() { await act(async () => { for (let n = 0; n < 5; n++) await immediate(); }); }
async function until(assertion: () => void | Promise<void>) {
  let last: unknown;
  for (let n = 0; n < 60; n++) {
    await flush();
    try { await assertion(); return; } catch (error) { last = error; }
  }
  throw last;
}
async function click(element: Element) { await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush(); }
function button(label: string) { const element = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); expect(element, `Missing ${label}`).not.toBeNull(); return element!; }
function textButton(text: string) { const element = [...host.querySelectorAll('button')].find(node => node.textContent?.trim().startsWith(text)); expect(element, `Missing ${text}`).toBeTruthy(); return element!; }
function word() { return host.querySelector('.focal-word')?.textContent; }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); await flush(); }

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.stubGlobal('scrollTo', vi.fn());
  await clearData();
  await set('onboarded', true);
  await set('settings', { wpm: 250, natural: false });
  fetcher = vi.fn(async (url: string) => {
    const match = /^\/bibles\/(KJV|ASV|BSB|BLB)\/1\/1\.json$/.exec(String(url));
    if (!match) throw Error(`Unexpected test network request: ${url}`);
    return { ok: true, json: async () => structuredClone(chapters[match[1]]) };
  });
  vi.stubGlobal('fetch', fetcher);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<App />));
  await until(() => expect(host.querySelector('.passage-excerpt')?.textContent).toBe(chapters.KJV.verses[0].text));
  expect(host.querySelector('.onboarding')).toBeNull();
  // Keep IndexedDB's setImmediate scheduling real while advancing the RSVP clock deterministically.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); await flush(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
afterAll(async () => { (await database).close(); });

describe('application reading flow', () => {
  it('opens Home → Read and plays through a verse transition without resetting the word or scheduler', async () => {
    expect(host.querySelector('.home')).not.toBeNull();
    await click(textButton('Resume reading'));
    expect(word()).toBe('In');
    await click(button('Play'));
    const expected = tokenize(chapters.KJV.verses).slice(0, 14);
    const presented = [word()];
    for (let index = 1; index < expected.length; index++) {
      await advance(240); presented.push(word()); expect(button('Pause')).toBeTruthy();
    }
    expect(presented).toEqual(expected.map(token => token.text));
    await click(button('Pause'));
    await until(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(await get('position')).toMatchObject({ translation: 'KJV', book: 1, chapter: 1, verse: expected.at(-1)!.verse, index: 13 });
  });

  it('switches translation at the beginning of the corresponding verse instead of retaining a word index', async () => {
    await click(textButton('Resume reading'));
    await click(button('Next verse'));
    await click(button('Play')); await advance(240); await advance(240);
    expect(word()).toBe(tokenize(chapters.KJV.verses.filter(verse => verse.verse === 2))[2].text);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Bible translation"]')!;
    await act(async () => { select.value = 'ASV'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => {
      expect(host.querySelector('.reader-reference')?.textContent).toContain('ASV');
      expect(word()).toBe(tokenize(chapters.ASV.verses.filter(verse => verse.verse === 2))[0].text);
    });
    expect(button('Play')).toBeTruthy();
    const tokens = tokenize(chapters.ASV.verses);
    await until(async () => expect(await get('position')).toMatchObject({ translation: 'ASV', verse: 2, index: tokens.findIndex(token => token.verse === 2) }));
  });

  it('opens complete context and returns to the exact RSVP word', async () => {
    await click(textButton('Resume reading')); await click(button('Play'));
    await advance(240); await advance(240); await advance(240); await advance(240);
    const current = word(); expect(current).toBe('created');
    await click(textButton('View in Context'));
    expect(host.querySelector('.traditional')).not.toBeNull();
    expect(host.querySelector('#verse-1')?.textContent).toContain(chapters.KJV.verses[0].text);
    expect(host.querySelector('#verse-1')?.classList.contains('current-verse')).toBe(true);
    await advance(10000);
    await click(textButton('Return to Focus'));
    expect(word()).toBe(current); expect(button('Play')).toBeTruthy();
    await click(button('Play')); await advance(240);
    expect(word()).toBe('the');
  });
});
