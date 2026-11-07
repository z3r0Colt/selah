# Scripture Focus

A local-first Bible reading PWA built with React, TypeScript, Vite, Tailwind and IndexedDB. No account, tracking or backend is required. Scripture is served as static files and cached locally; reading data stays in IndexedDB.

## Develop and build

Requires Node 22+ and Python 3 for source verification.

```sh
npm ci
npm run dev
npm test
python scripts/validate-bibles.py
npm run build
npm run preview
```

Serve `dist/` from any HTTPS static host (localhost is allowed for development). Use a root path, an SPA fallback to index.html, JSON MIME types, and no-cache headers for sw.js. The build checks manifest icons and injects hashed assets into the service-worker precache. All four Bible sources are included as chapter JSON; the shell precaches only metadata and assets. Settings → Translations downloads a full edition to IndexedDB. Opened chapters are cached automatically. Failed downloads can resume without losing existing chapters.

## Source integrity

See [docs/SOURCES.md](docs/SOURCES.md) for publisher URLs, versions, hashes, import decisions and source omissions. Run `python scripts/import-bibles.py` to rebuild publisher data; network access is required. Never edit Bible JSON manually. KJV/ASV come from eBible; BSB comes from official Berean TXT; BLB from the publisher full-Bible draft. BLB is labeled draft throughout. BSB/BLB plain-text sources do not supply paragraph or italic markup. Source-empty verses are retained and never substituted.

## Reading

Focus uses fixed focal-glyph positioning and a deadline scheduler. Natural pacing is normalized over the passage; constant mode provides uniform dwell. Backgrounding or a busy device pauses presentation instead of skipping words. Traditional reading supports verse selection, copy, bookmarks, notes and reflections. Browser narration is independent and **does not** claim word synchronization.

Import audio in Settings or Focus audio. Files stay in IndexedDB; the Web Audio player supports categories, fades, volume, mute, repeat, shuffle and sleep. No licensed third-party music pack is bundled. Music starts only on user interaction. Keep original files separately.

## Backups and privacy

Settings → Export produces a versioned JSON object `{format:"scripture-focus",version:1,exported,entries:[[key,value],...]}`. Import replaces matching local keys and preserves other keys. Audio blobs and downloaded chapter assets are excluded; they can be reimported/redownloaded. Backups include personal notes, so store them privately. Clearing data removes local structured stores and caches. Browser/site-data removal also deletes local reading data. Persistent storage is requested when downloading a translation, but browser eviction remains possible.

## Release validation status

This is a functional initial implementation, not a claim of completed public-release certification. Automated engine, scheduler, source, plan, storage and audio tests are included. Device/browser acceptance testing, a WCAG 2.2 AA audit and long-session battery measurements are still required before a public-release claim. Exact recorded narration synchronization and prelicensed audio packs are not included; browser narration and personal audio import are functional alternatives. See [docs/RELEASE.md](docs/RELEASE.md) for the acceptance checklist and remaining limitations.
