# Release acceptance

## Implemented

- Four separately sourced full-Bible editions, publisher attribution and reproducible import/validation.
- Focus reader with fixed focal letter, normalization, speed, keyboard/touch controls, wake-lock best effort and safe background pause.
- Traditional chapter reading, verse selection, notes/highlights/bookmarks, comparison, browser narration and personal reflection.
- Local audio imports, Web Audio playback, sleep/fade/repeat/shuffle and narration ducking.
- Reading plans (including published chronological sequence), rescheduling, memorization, local session statistics and backups.
- Manifest, icons, service worker, chapter-level IndexedDB storage and full-translation offline downloads.

## Known limits and release gates

- Managed browser-control tools are unavailable in this session. Real browser visual/interaction QA and install/offline acceptance on Android Chrome, iOS Safari and desktop remain unverified.
- Accessibility includes semantic controls, visible focus, system reduced motion and traditional-text alternatives; a formal WCAG 2.2 AA audit is still required.
- Personal audio import is the supported music workflow. No downloadable approved audio packs are shipped.
- Narration is browser speech synthesis; no verified recorded/word-timing source is bundled. Speech voices may themselves require a browser/OS download.
- Source plain-text editions cannot recover unsupplied paragraph/italics metadata; no inferred markup is inserted. Empty publisher verse slots display no invented verse.
- Reading progress measures words presented/manual completion, never understanding. Plan completion is manual.
- JSON backups omit imported audio blobs; retain original audio files separately.
- Storage quota, eviction, headphone interruptions, lock screen and battery use require target-device acceptance.
- Timed sessions can finish the current verse, source-marked paragraph, or chapter. Paragraphs fall back to chapter boundaries when the source lacks markers. Cross-chapter sessions require explicit continuation.
- Comparison uses exact verse references, without a difference-highlighting overlay.
