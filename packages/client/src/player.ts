// mpv wrapper over IPC.
//
// We launch mpv in "idle" mode with a control socket and send it
// JSON commands (load, pause, seek, volume...). mpv plays the audio
// LOCALLY through the user's speakers; we just drive it.
//
// IMPORTANT (layered design): this module knows NOTHING about rooms or
// WebSocket. It only exposes play/pause/seek/etc. Whoever issues the commands
// can be the keyboard (solo mode) or the room (synced mode): the
// player doesn't care.

import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { YTDLP_DIR } from "./ytdlp.ts";

/** 10-band graphic-equalizer center frequencies (Hz). */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Builds the mpv audio-filter value for a set of EQ gains (dB), optionally
 * with a "night mode" dynamic-range compressor tacked on — like a home
 * theater's dialogue/night mode, it makes quiet parts louder and loud parts
 * quieter so playback stays comfortable at low volume. "" = no filter at all.
 */
export function eqFilterChain(gains: number[], night = false): string {
  const hasGains = gains.some((g) => Math.abs(g) > 0.01);
  if (!hasGains && !night) return "";
  const parts: string[] = [];
  if (hasGains) {
    parts.push(
      ...EQ_BANDS.map(
        (f, i) =>
          `equalizer=f=${f}:width_type=o:width=1:g=${(gains[i] ?? 0).toFixed(1)}`,
      ),
    );
  }
  if (night) {
    parts.push("acompressor=threshold=-18dB:ratio=4:attack=200:release=1000:makeup=6");
  }
  return `lavfi=[${parts.join(",")}]`;
}

export interface PlayerState {
  url: string | null;
  title: string | null;
  paused: boolean;
  position: number; // seconds
  duration: number; // seconds
  volume: number; // 0-100
}

type MpvCommand = { command: unknown[]; request_id?: number };

/**
 * What mpv's ytdl_hook already resolved for the current track: the direct
 * media URL plus metadata. Reusing it (instead of running yt-dlp again for
 * the visualizer, the title cache or the offline cache) means ONE YouTube
 * extraction per track — fewer requests, so fewer "429 / not a bot" blocks.
 */
export interface ResolvedTrack {
  url: string; // the track's identity (what was passed to load())
  stream: string | null; // direct media URL (null if unknown or not a single URL)
  ext?: string; // container of the stream, e.g. "webm" / "m4a"
  headers?: Record<string, string>; // HTTP headers yt-dlp says the stream needs
  title?: string;
  duration?: number;
  artist?: string;
}

/** Pure helper: turns ytdl_hook's yt-dlp JSON into a ResolvedTrack. */
export function parseYtdlJson(url: string, stdout: string, fallbackStream: string | null): ResolvedTrack {
  let info: Record<string, unknown> = {};
  try {
    info = JSON.parse(stdout);
  } catch {
    // no JSON: keep only what mpv told us directly
  }
  const str = (v: unknown) => (typeof v === "string" && v && v !== "NA" ? v : undefined);
  const direct = str(info.url);
  const fallback = fallbackStream && /^https?:\/\//i.test(fallbackStream) ? fallbackStream : null;
  const headers =
    info.http_headers && typeof info.http_headers === "object"
      ? (info.http_headers as Record<string, string>)
      : undefined;
  return {
    url,
    stream: direct ?? fallback,
    ext: str(info.ext),
    headers,
    title: str(info.title),
    duration: typeof info.duration === "number" && info.duration > 0 ? info.duration : undefined,
    artist: str(info.uploader) ?? str(info.channel),
  };
}

export class Player extends EventEmitter {
  private proc: ChildProcess | null = null;
  private socket: Socket | null = null;
  private socketPath: string;
  private reqId = 1;
  private buffer = "";
  private pending = new Map<number, (data: unknown) => void>();

  state: PlayerState = {
    url: null,
    title: null,
    paused: false,
    position: 0,
    duration: 0,
    volume: 80,
  };

  constructor(
    private mpvBin = "mpv",
    initialVolume = 100,
  ) {
    super();
    this.state.volume = Math.max(0, Math.min(100, initialVolume));
    // Control socket: named pipe on Windows, unix socket everywhere else.
    this.socketPath =
      process.platform === "win32"
        ? "\\\\.\\pipe\\catunes-mpv"
        : join(tmpdir(), `catunes-mpv-${process.pid}.sock`);
  }

  /** Starts the mpv process and opens the control channel. */
  async start(): Promise<void> {
    // Make sure mpv's ytdl_hook can find our (possibly auto-downloaded)
    // yt-dlp by prepending catunes's bin dir to the child's PATH.
    const env = {
      ...process.env,
      PATH: `${YTDLP_DIR}${delimiter}${process.env.PATH ?? ""}`,
    };

    this.proc = spawn(
      this.mpvBin,
      [
        "--idle=yes",
        "--no-video",
        "--no-terminal",
        "--really-quiet",
        `--volume=${this.state.volume}`,
        // Audio only: less data, and a single direct URL we can reuse.
        "--ytdl-format=bestaudio/best",
        `--input-ipc-server=${this.socketPath}`,
      ],
      { stdio: "ignore", env },
    );

    this.proc.on("exit", () => this.emit("exit"));

    await this.connectSocket();
    // We subscribe to changes on the properties we care about.
    this.observe("time-pos", 1);
    this.observe("duration", 2);
    this.observe("pause", 3);
    this.observe("volume", 4);
    this.observe("media-title", 5);
  }

  /** Connects to the mpv socket, retrying until mpv creates it. */
  private connectSocket(retries = 50): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (left: number) => {
        const sock = createConnection(this.socketPath);
        sock.on("connect", () => {
          this.socket = sock;
          sock.on("data", (chunk) => this.onData(chunk));
          resolve();
        });
        sock.on("error", () => {
          if (left <= 0) return reject(new Error("No se pudo conectar a mpv"));
          setTimeout(() => attempt(left - 1), 100);
        });
      };
      attempt(retries);
    });
  }

  /** Processes the JSON lines emitted by mpv (events and responses). */
  private onData(chunk: Buffer | string) {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.request_id && this.pending.has(msg.request_id)) {
          const done = this.pending.get(msg.request_id)!;
          this.pending.delete(msg.request_id);
          done(msg.error === "success" ? msg.data : undefined);
        } else if (msg.event === "property-change") {
          this.onProperty(msg.name, msg.data);
        } else if (msg.event === "file-loaded") {
          void this.emitResolved();
        } else if (msg.event === "end-file") {
          // reason: "eof" (finished), "stop"/"quit" (we triggered it), "error"
          this.emit("ended", msg.reason as string, msg.file_error as
            | string
            | undefined);
        }
      } catch {
        // non-JSON line: ignore it
      }
    }
  }

  private onProperty(name: string, data: unknown) {
    switch (name) {
      case "time-pos":
        this.state.position = typeof data === "number" ? data : 0;
        break;
      case "duration":
        this.state.duration = typeof data === "number" ? data : 0;
        break;
      case "pause":
        this.state.paused = Boolean(data);
        break;
      case "volume":
        this.state.volume = typeof data === "number" ? data : this.state.volume;
        break;
      case "media-title":
        this.state.title = typeof data === "string" ? data : this.state.title;
        break;
    }
    this.emit("state", this.state);
  }

  private send(cmd: MpvCommand) {
    if (!this.socket) return;
    this.socket.write(JSON.stringify(cmd) + "\n");
  }

  /** Reads a property; resolves undefined if it's unavailable (or mpv is slow). */
  private getProperty(name: string, timeoutMs = 2000): Promise<unknown> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(undefined);
      // Ids from 1000 up so they never collide with observe_property ids.
      const id = 1000 + this.reqId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(undefined);
      }, timeoutMs);
      this.pending.set(id, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      this.send({ command: ["get_property", name], request_id: id });
    });
  }

  /** On file-loaded: tells listeners what mpv's ytdl_hook resolved ("resolved"). */
  private async emitResolved() {
    const url = this.state.url;
    if (!url) return;
    const [stream, ytdl] = await Promise.all([
      this.getProperty("stream-open-filename"),
      // Set by mpv's ytdl_hook (mpv >= 0.36): the raw yt-dlp result.
      this.getProperty("user-data/mpv/ytdl/json-subprocess-result"),
    ]);
    if (this.state.url !== url) return; // the track changed meanwhile
    const stdout =
      ytdl && typeof ytdl === "object" && typeof (ytdl as { stdout?: unknown }).stdout === "string"
        ? (ytdl as { stdout: string }).stdout
        : "";
    const resolved = parseYtdlJson(url, stdout, typeof stream === "string" ? stream : null);
    this.emit("resolved", resolved);
  }

  private observe(property: string, id: number) {
    this.send({ command: ["observe_property", id, property] });
  }

  // --- Public API (used by the keyboard or the room) ---

  /**
   * Loads and plays a URL or file path. `source` is what mpv actually opens
   * (e.g. an offline-cached copy) while `url` stays the track's identity;
   * `title` overrides mpv's media title (a cached file would show its id).
   */
  load(url: string, opts: { source?: string; title?: string } = {}) {
    this.state.url = url;
    this.state.title = opts.title ?? url;
    // force-media-title persists across files, so always (re)set it ("" = unset).
    this.send({ command: ["set_property", "force-media-title", opts.title ?? ""] });
    this.send({ command: ["loadfile", opts.source ?? url, "replace"] });
    this.setPause(false);
    this.emit("state", this.state);
  }

  togglePause() {
    this.setPause(!this.state.paused);
  }

  setPause(paused: boolean) {
    this.send({ command: ["set_property", "pause", paused] });
  }

  /** Relative seek in seconds (negative = backward). */
  seek(seconds: number) {
    this.send({ command: ["seek", seconds, "relative"] });
  }

  /** Absolute seek to a specific second (key for syncing rooms). */
  seekTo(seconds: number) {
    this.send({ command: ["seek", seconds, "absolute"] });
  }

  setVolume(volume: number) {
    const v = Math.max(0, Math.min(100, volume));
    this.state.volume = v;
    this.send({ command: ["set_property", "volume", v] });
  }

  /**
   * Applies a 10-band graphic equalizer (gains in dB) via mpv's audio-filter
   * chain, plus an optional night-mode compressor. All-zero gains with no
   * night mode clears the filter so there's no extra processing.
   */
  setEqualizer(gains: number[], night = false) {
    this.send({ command: ["set_property", "af", eqFilterChain(gains, night)] });
  }

  stop() {
    this.send({ command: ["stop"] });
    this.state.url = null;
    this.state.position = 0;
    this.state.duration = 0;
    this.emit("state", this.state);
  }

  quit() {
    this.send({ command: ["quit"] });
    this.socket?.end();
    this.proc?.kill();
  }
}
