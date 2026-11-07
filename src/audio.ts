import { get, set } from "./store";

export const audioCategories = [
  "Lo-fi Focus",
  "Deep Focus",
  "Piano",
  "Nature",
  "Minimal Ambient",
  "Silence",
] as const;
export type AudioCategory = (typeof audioCategories)[number];
export interface AudioTrack {
  id: string;
  name: string;
  category: AudioCategory;
  size: number;
  type: string;
}
interface Preferences {
  volume: number;
  muted: boolean;
  repeat: boolean;
  shuffle: boolean;
  category: AudioCategory;
  selected: string | null;
}
export interface AudioState extends Preferences {
  tracks: AudioTrack[];
  playing: boolean;
  loading: boolean;
  error: string;
  sleepAt: number | null;
  currentTime: number;
  duration: number;
}
const initial: AudioState = {
  tracks: [],
  playing: false,
  loading: false,
  error: "",
  sleepAt: null,
  currentTime: 0,
  duration: 0,
  volume: 0.25,
  muted: false,
  repeat: true,
  shuffle: false,
  category: "Silence",
  selected: null,
};

/** One player for the application lifetime; reader play/pause never controls music. */
class BackgroundAudio {
  state: AudioState = { ...initial };
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private element: HTMLAudioElement | null = null;
  private url: string | null = null;
  private loadedId: string | null = null;
  private ready: Promise<void> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private operation = 0;
  private ducked = false;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private async persist() {
    const { volume, muted, repeat, shuffle, category, selected } = this.state;
    await set("audio:preferences", {
      volume,
      muted,
      repeat,
      shuffle,
      category,
      selected,
    }).catch(() =>
      this.update({
        error: "Audio preferences could not be saved. Check device storage.",
      }),
    );
  }
  init() {
    if (!this.ready)
      this.ready = (async () => {
        try {
          const prefs = (await get("audio:preferences")) as
            Partial<Preferences> | undefined;
          const tracks = (await get("audio:tracks")) as
            AudioTrack[] | undefined;
          this.update({ ...prefs, tracks: tracks || [], playing: false });
        } catch {
          this.update({
            error: "The local audio library could not be opened.",
          });
        }
      })();
    return this.ready;
  }
  private setup() {
    if (this.element) return;
    this.context = new AudioContext();
    this.element = new Audio();
    this.element.preload = "metadata";
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.context
      .createMediaElementSource(this.element)
      .connect(this.gain)
      .connect(this.context.destination);
    this.element.addEventListener("ended", () => {
      this.update({ playing: false });
      void this.next();
    });
    this.element.addEventListener("pause", () =>
      this.update({ playing: false }),
    );
    this.element.addEventListener("error", () =>
      this.update({
        playing: false,
        loading: false,
        error:
          "This audio format could not be played. Try an MP3, WAV, or M4A file supported by your browser.",
      }),
    );
    this.element.addEventListener("timeupdate", () =>
      this.update({ currentTime: this.element!.currentTime }),
    );
    this.element.addEventListener("loadedmetadata", () =>
      this.update({
        duration: Number.isFinite(this.element!.duration)
          ? this.element!.duration
          : 0,
      }),
    );
    this.context.addEventListener("statechange", () => {
      if (this.context?.state === "suspended" && this.state.playing) {
        this.element?.pause();
        this.update({
          playing: false,
          error: "Audio was interrupted. Press Play to resume.",
        });
      }
    });
  }
  private fade(seconds = 0.45) {
    if (!this.context || !this.gain) return;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(
      this.state.playing && !this.state.muted
        ? this.state.volume * (this.ducked ? 0.2 : 1)
        : 0,
      now + seconds,
    );
  }
  async play(id = this.state.selected) {
    const op = ++this.operation;
    try {
      // Called directly from a control: create/resume the audio context before async storage reads.
      this.setup();
      await this.context!.resume();
      await this.init();
      id =
        id ||
        this.state.tracks.find((t) => t.category === this.state.category)?.id ||
        null;
      const track = this.state.tracks.find((t) => t.id === id);
      if (!track) {
        this.update({ error: "Import an audio file to begin listening." });
        return;
      }
      this.update({
        loading: true,
        error: "",
        selected: track.id,
        category: track.category,
      });
      if (this.loadedId !== track.id) {
        this.element!.pause();
        const blob = (await get("audio:track:" + track.id)) as Blob | undefined;
        if (op !== this.operation) return;
        if (!(blob instanceof Blob))
          throw new Error("The saved audio file is missing. Import it again.");
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(blob);
        this.element!.src = this.url;
        this.loadedId = track.id;
        this.update({ currentTime: 0, duration: 0 });
      }
      this.element!.loop = this.state.repeat && !this.state.shuffle;
      await this.element!.play();
      if (op !== this.operation) {
        this.element!.pause();
        return;
      }
      this.update({ playing: true, loading: false });
      this.fade();
      void this.persist();
    } catch (e) {
      this.update({
        playing: false,
        loading: false,
        error:
          e instanceof Error
            ? e.message
            : "Audio could not start. Press Play to retry.",
      });
    }
  }
  async pause() {
    ++this.operation;
    this.update({ playing: false, loading: false });
    this.fade();
    const element = this.element;
    await new Promise((resolve) => setTimeout(resolve, 460));
    if (!this.state.playing) element?.pause();
  }
  async select(id: string) {
    const track = this.state.tracks.find((t) => t.id === id);
    if (!track) return;
    const wasPlaying = this.state.playing;
    await this.pause();
    this.update({ selected: id, category: track.category });
    void this.persist();
    if (wasPlaying) await this.play(id);
  }
  async category(category: AudioCategory) {
    const selected =
      this.state.tracks.find((t) => t.category === category)?.id || null;
    const playing = this.state.playing;
    await this.pause();
    this.update({ category, selected });
    void this.persist();
    if (playing && selected && category !== "Silence")
      await this.play(selected);
  }
  preference(
    patch: Partial<
      Pick<Preferences, "volume" | "muted" | "repeat" | "shuffle">
    >,
  ) {
    this.update({
      ...patch,
      ...(patch.volume !== undefined
        ? { volume: Math.max(0, Math.min(1, patch.volume)) }
        : {}),
    });
    if (this.element)
      this.element.loop = this.state.repeat && !this.state.shuffle;
    this.fade(0.08);
    void this.persist();
  }
  duck(active: boolean) {
    this.ducked = active;
    this.fade(0.3);
  }
  async next() {
    const tracks = this.state.tracks.filter(
      (t) => t.category === this.state.category,
    );
    if (!tracks.length) return;
    const index = tracks.findIndex((t) => t.id === this.state.selected);
    const candidates = tracks.filter((t) => t.id !== this.state.selected);
    if (this.state.shuffle && candidates.length)
      await this.play(
        candidates[Math.floor(Math.random() * candidates.length)].id,
      );
    else if (index + 1 < tracks.length) await this.play(tracks[index + 1].id);
    else if (this.state.repeat) await this.play(tracks[0].id);
  }
  seek(seconds: number) {
    if (this.element && Number.isFinite(seconds))
      this.element.currentTime = Math.max(
        0,
        Math.min(seconds, this.state.duration),
      );
  }
  sleep(minutes: number) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.update({ sleepAt: minutes > 0 ? Date.now() + minutes * 60000 : null });
    if (minutes > 0)
      this.sleepTimer = setTimeout(() => {
        void this.pause();
        this.update({ sleepAt: null });
      }, minutes * 60000);
  }
  async import(files: FileList | File[], category: AudioCategory) {
    this.update({ loading: true, error: "" });
    try {
      await this.init();
      let tracks = [...this.state.tracks];
      for (const file of Array.from(files)) {
        if (
          !file.type.startsWith("audio/") &&
          !/\.(mp3|wav|m4a|aac|ogg|opus|flac|webm)$/i.test(file.name)
        )
          throw new Error("Choose audio files such as MP3, WAV, M4A, or OGG.");
        const track: AudioTrack = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ""),
          category: category === "Silence" ? "Deep Focus" : category,
          size: file.size,
          type: file.type,
        };
        await set("audio:track:" + track.id, file);
        tracks = [...tracks, track];
        await set("audio:tracks", tracks);
        this.update({
          tracks,
          category: track.category,
          selected: this.state.selected || track.id,
        });
      }
      void this.persist();
    } catch (e) {
      this.update({
        error:
          e instanceof Error
            ? e.message
            : "Audio import failed. Your device may not have enough storage.",
      });
    } finally {
      this.update({ loading: false });
    }
  }
  async remove(id: string) {
    if (this.state.selected === id) {
      await this.pause();
      this.loadedId = null;
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = null;
      this.element?.removeAttribute("src");
    }
    // The common store has no delete contract; null releases the Blob's storage.
    await set("audio:track:" + id, null);
    const tracks = this.state.tracks.filter((t) => t.id !== id);
    await set("audio:tracks", tracks);
    this.update({
      tracks,
      selected:
        this.state.selected === id
          ? tracks[0]?.id || null
          : this.state.selected,
    });
    void this.persist();
  }
}
export const backgroundAudio = new BackgroundAudio();
