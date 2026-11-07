import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { audioCategories, backgroundAudio, type AudioCategory } from "./audio";

export default function Audio({ compact = false }: { compact?: boolean }) {
  const state = useSyncExternalStore(
    backgroundAudio.subscribe,
    backgroundAudio.snapshot,
  );
  const [expanded, setExpanded] = useState(!compact);
  const [importCategory, setImportCategory] =
    useState<AudioCategory>("Deep Focus");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void backgroundAudio.init();
  }, []);
  const tracks = state.tracks.filter(
    (track) => track.category === state.category,
  );
  const selected = state.tracks.find((track) => track.id === state.selected);
  const size = state.tracks.reduce((sum, track) => sum + track.size, 0);
  return (
    <section className="card audio-panel" aria-label="Background music">
      <div
        className="audio-heading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <span className="eyebrow">FOCUS AUDIO</span>
          <p className="muted" style={{ margin: "6px 0" }}>
            {selected?.name || "A little space for silence."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="button"
            onClick={() =>
              state.playing
                ? void backgroundAudio.pause()
                : void backgroundAudio.play()
            }
            disabled={
              state.loading ||
              !state.tracks.length ||
              state.category === "Silence"
            }
            aria-label={
              state.playing ? "Pause background music" : "Play background music"
            }
          >
            {state.playing ? "Pause" : "Play"}
          </button>
          {compact && (
            <button
              className="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Close audio" : "Audio settings"}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <label>
            Sound category
            <select
              value={state.category}
              onChange={(event) =>
                void backgroundAudio.category(
                  event.target.value as AudioCategory,
                )
              }
            >
              {audioCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          {state.category !== "Silence" && (
            <label>
              Track
              <select
                value={state.selected || ""}
                onChange={(event) =>
                  void backgroundAudio.select(event.target.value)
                }
                disabled={!tracks.length}
              >
                <option value="">
                  {tracks.length
                    ? "Choose a track"
                    : "No imported tracks in this category"}
                </option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Volume · {Math.round(state.volume * 100)}%
            <input
              aria-label="Music volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.volume}
              onChange={(event) =>
                backgroundAudio.preference({
                  volume: Number(event.target.value),
                })
              }
            />
          </label>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              className="button"
              aria-pressed={state.muted}
              onClick={() =>
                backgroundAudio.preference({ muted: !state.muted })
              }
            >
              {state.muted ? "Unmute" : "Mute"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={state.repeat}
                onChange={(event) =>
                  backgroundAudio.preference({ repeat: event.target.checked })
                }
              />{" "}
              Repeat
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.shuffle}
                onChange={(event) =>
                  backgroundAudio.preference({ shuffle: event.target.checked })
                }
              />{" "}
              Shuffle category
            </label>
            <button
              className="button"
              disabled={!tracks.length}
              onClick={() => void backgroundAudio.next()}
            >
              Next track
            </button>
          </div>
          {state.duration > 0 && (
            <label>
              Track position · {Math.floor(state.currentTime / 60)}:
              {String(Math.floor(state.currentTime % 60)).padStart(2, "0")}
              <input
                aria-label="Track position"
                type="range"
                min="0"
                max={state.duration}
                step="1"
                value={Math.min(state.currentTime, state.duration)}
                onChange={(event) =>
                  backgroundAudio.seek(Number(event.target.value))
                }
              />
            </label>
          )}
          <label>
            Sleep timer
            <select
              defaultValue="0"
              onChange={(event) =>
                backgroundAudio.sleep(Number(event.target.value))
              }
            >
              <option value="0">Off</option>
              {[5, 10, 15, 20, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          {state.sleepAt && (
            <p className="muted">
              Music will fade out at{" "}
              {new Date(state.sleepAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          )}
          <div
            style={{
              borderTop: "1px solid var(--border, #ddd)",
              paddingTop: 16,
            }}
          >
            <h3>Your offline audio library</h3>
            <p className="muted">
              {state.tracks.length
                ? `${state.tracks.length} imported files · ${(size / 1048576).toFixed(1)} MB stored on this device.`
                : "Your library is empty. Import instrumental music or nature recordings from your device. No streaming service or account is needed."}
            </p>
            <p className="muted">
              Only import audio you have permission to use. Files stay on this
              device. No audio packs are bundled.
            </p>
            <label>
              Import into
              <select
                value={importCategory}
                onChange={(event) =>
                  setImportCategory(event.target.value as AudioCategory)
                }
              >
                {audioCategories
                  .filter((category) => category !== "Silence")
                  .map((category) => (
                    <option key={category}>{category}</option>
                  ))}
              </select>
            </label>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files)
                  void backgroundAudio.import(
                    event.target.files,
                    importCategory,
                  );
                event.target.value = "";
              }}
            />
            <button
              className="button"
              style={{ marginTop: 12 }}
              disabled={state.loading}
              onClick={() => fileInput.current?.click()}
            >
              {state.loading ? "Saving audio…" : "Import audio files"}
            </button>
            {state.tracks.length > 0 && (
              <ul style={{ padding: 0, listStyle: "none" }}>
                {state.tracks.map((track) => (
                  <li
                    key={track.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--border, #ddd)",
                    }}
                  >
                    <span>
                      {track.name}
                      <small className="muted" style={{ display: "block" }}>
                        {track.category} · {(track.size / 1048576).toFixed(1)}{" "}
                        MB · offline
                      </small>
                    </span>
                    <button
                      className="button"
                      aria-label={`Remove ${track.name}`}
                      onClick={() => void backgroundAudio.remove(track.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {state.error && <p role="alert">{state.error}</p>}
    </section>
  );
}
