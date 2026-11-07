# Scripture sources and integrity

Imported 2026-11-07. Scripture is downloaded from the source publishers, never generated or completed by AI. Every edition has all 66 Protestant books and 1,189 chapters. Each chapter is stored independently so a reader can load one chapter at a time. Each source provides 31,102 verse records; an empty source record is not replaced with another translation.

| Edition | Authoritative source | Status and rights |
|---|---|---|
| KJV | [eBible.org USFX](https://ebible.org/Scriptures/eng-kjv_usfx.zip) | Public domain in most countries; Crown rights apply in the United Kingdom. Includes supplied-word italics, publisher notes, and Psalm titles. The wider eBible archive includes other books; this app imports only the requested 66-book Protestant canon. |
| ASV | [eBible.org USFX](https://ebible.org/Scriptures/eng-asv_usfx.zip) | 1901 American Standard Version, public domain. Supplied-word italics, poetry line breaks, publisher notes, Psalm titles retained. |
| BSB | [Official publisher verse text](https://bereanbible.com/bsb.txt), linked by [official downloads page](https://berean.bible/downloads.htm) | Berean Standard Bible; [dedicated to the public domain](https://berean.bible/licensing.htm). Publisher does not provide a version/date identifier in this TXT artifact; download date and SHA-256 identify the exact snapshot. |
| BLB | [Official full-Bible draft](https://literalbible.com/blb.txt), linked at [LiteralBible.com](https://literalbible.com/) | **Early draft**, subject to revision. The artifact dedicates the text to the public domain. Supplied-word brackets remain exactly as supplied; they are not converted or deleted. |

The exact source URL, retrieval date, SHA-256, original byte length, number of books/chapters/verses, and per-chapter verse counts appear in [`public/bibles/index.json`](../public/bibles/index.json). eBible metadata is carried in each source archive. Raw downloads are cached in the ignored `.cache/bibles` directory; regenerate with `python3 scripts/import-bibles.py --refresh` on an internet connection. Without `--refresh`, retained cached files are reused. Python's standard library is sufficient.

## Transformations

XML markup is parsed structurally. Source whitespace is normalized to single spaces for `text`; words, case, punctuation, paragraph signs, and spelling are preserved. Strong's metadata and footnotes do not enter the Scripture body. Supplied words use italic segments. Poetry and paragraph breaks are retained in `segments` and `paragraph`. Source titles and editorial headings are stored separately in `headings`, labelled by kind and anchored before a verse. Notes are stored as notes. Only the two plain-text Berean editions lack source-supplied paragraph and italic markup; the UI must not claim that format is preserved for those editions. Their Psalm superscriptions remain embedded in the verse text exactly where the official TXT places them.

The official BSB USX was investigated but deliberately **not** used as the canonical source: it numbers some Psalm superscriptions as additional verses (Psalm 3 is an example) and differs from the publisher's verse-per-line TXT. The selected official TXT preserves conventional source references and includes the superscription in Psalm 3:1. No effort is made to force editions to share numerical word indexes. Compare at verse boundaries.

ASV, BSB, and BLB each contain 16 empty verse slots: Matthew 17:21; 18:11; 23:14; Mark 7:16; 9:44; 9:46; 11:26; 15:28; Luke 17:36; 23:17; John 5:4; Acts 8:37; 15:34; 24:7; 28:29; Romans 16:24. These are deliberately preserved as `sourceEmpty: true`, never filled. ASV source notes explain its omissions. KJV has text at those references. A missing verse is an edition difference, not a download failure.

## Internal schema (version 1)

`/bibles/index.json`: `{ schemaVersion, books: [{ id, code, name, chapters }], translations: [{ id, name, url, sha256, retrieved, draft?, ... }] }`. Book IDs are **1-based canonical order**, Genesis 1 through Revelation 66.

`/bibles/{translation}/{book}/{chapter}.json`:

```typescript
{
  translation: 'KJV' | 'ASV' | 'BSB' | 'BLB';
  book: number;
  chapter: number;
  verses: {
    verse: number;
    text: string;
    segments: { text: string; italic?: boolean; lineBreak?: boolean }[];
    paragraph: boolean;
    notes?: string[];
    sourceEmpty?: true;
  }[];
  headings: {
    text: string;
    kind: 'psalm-title' | 'editorial';
    beforeVerse: number;
  }[];
}
```

Validation asserts all 66 books and their canonical chapter counts, unique numeric verse labels, and source verse-count agreement per chapter; source digests make changes auditable. This is structural and programmatic source validation, not a claim of independent scholarly collation. Publication review should include publisher updates, local KJV rights, and human Scripture-integrity review.

## Chronological reading plan

`public/plans/chronological.json` transcribes only the Scripture-reference assignments from the published [Blue Letter Bible one-year chronological reading plan](https://www.blueletterbible.org/assets/pdf/dbrp/1Yr_ChronologicalPlan.pdf), retrieved 2026-11-07. The PDF SHA-256 is recorded in that JSON. This is an attributed published sequence, not an algorithmically invented historical order. The source's commentary is not copied. There are 365 assignments. Validation confirms each of the 1,189 canonical chapters occurs exactly once, with no invalid chapter numbers. Days listing an entire book are expanded into that book's actual chapters; the original reference label is also retained. Reproduce using `python3 scripts/import-chronological.py` (requires Poppler's `pdftotext`).

### Edition identification from publisher metadata

The eBible archive identifies KJV as the standardized **1769** text (metadata ID `de4e12af7f28f599`) and ASV as **1901** (metadata ID `06125adad2d5898a`). The exact identification fields and metadata-file digests are retained in `docs/ebible-editions.json`. Berean TXT artifacts do not declare a separate revision date; the source byte digests and retrieval date identify those snapshots without inventing a publisher version.

### Audited totals and publication limitations

| Edition | Verse slots | Nonempty Scripture records | Empty slots | Chapter files |
|---|---:|---:|---:|---:|
| KJV | 31,102 | 31,102 | 0 | 1,189 |
| ASV | 31,102 | 31,086 | 16 | 1,189 |
| BSB | 31,102 | 31,086 | 16 | 1,189 |
| BLB draft | 31,102 | 31,086 | 16 | 1,189 |

`tests/scripture-integrity.test.ts` enumerates every delivered chapter, validates canonical references and segment/text agreement, asserts the exact 16-slot omission set for each relevant edition, checks source-identifying metadata, and verifies the published chronological plan's coverage. `tests/offline.test.ts` exercises the service-worker lifecycle and offline fetch behavior in an isolated worker harness, plus production precache generation. These checks establish asset and logic contracts; they do not establish real-device installation, browser storage durability, or an independent human collation of every verse.

Source-specific release limitations: BLB must remain visibly marked **Draft**. The BSB and BLB publisher TXT snapshots lack paragraph/italic markup, and this app preserves those supplied texts without guessing missing formatting. Their Psalm superscriptions remain inside the publisher's verse text. KJV use in the United Kingdom needs applicable Crown-rights review. Publisher updates should be imported and compared deliberately rather than silently refreshing a deployed edition. These are disclosed limitations; no missing verse has been synthesized or substituted.
