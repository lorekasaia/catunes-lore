// Offline cache (opt-in).
//
// When enabled (settings.offlineCache = N), the audio of each YouTube track
// that plays is saved in the background to ~/.config/catunes/offline/, and
// only the N most recently played are kept. Next time that track plays, the
// local copy is used — so it works without internet (and saves data).
//
// Radio/live streams are never cached (they're endless), and local files
// don't need it.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { OFFLINE_DIR, OFFLINE_INDEX } from "./config.ts";
import { ytDlpCommand } from "./ytdlp.ts";
import { youtubeId } from "./playlist.ts";

interface Entry {
  file: string;
  at: number; // last played (epoch ms) — eviction is least-recently-played
}
type Index = Record<string, Entry>;

const inflight = new Set<string>();

function loadIndex(): Index {
  if (!existsSync(OFFLINE_INDEX)) return {};
  try {
    return JSON.parse(readFileSync(OFFLINE_INDEX, "utf8"));
  } catch {
    return {};
  }
}

function saveIndex(index: Index): void {
  if (!existsSync(OFFLINE_DIR)) mkdirSync(OFFLINE_DIR, { recursive: true });
  const temp = `${OFFLINE_INDEX}.tmp`;
  writeFileSync(temp, JSON.stringify(index, null, 2));
  renameSync(temp, OFFLINE_INDEX);
}

/**
 * Pure helper: which URLs to drop so only the `keep` most recently played
 * remain (keep = 0 drops everything).
 */
export function urlsToEvict(index: Index, keep: number): string[] {
  return Object.entries(index)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(Math.max(0, keep))
    .map(([url]) => url);
}

function evict(index: Index, keep: number): void {
  for (const url of urlsToEvict(index, keep)) {
    try {
      rmSync(index[url]!.file, { force: true });
    } catch {
      // ignore
    }
    delete index[url];
  }
}

/**
 * Local copy of a track, if one was cached. Also marks it as just played so
 * it's the last to be evicted.
 */
export function cachedFile(url: string): string | null {
  const index = loadIndex();
  const e = index[url];
  if (!e) return null;
  if (!existsSync(e.file)) {
    delete index[url];
    saveIndex(index);
    return null;
  }
  e.at = Date.now();
  saveIndex(index);
  return e.file;
}

/** True if the track can be cached at all (YouTube videos only). */
export function isCacheable(url: string): boolean {
  return youtubeId(url) !== null;
}

function register(url: string, file: string, keep: number): void {
  const index = loadIndex();
  index[url] = { file, at: Date.now() };
  evict(index, keep);
  saveIndex(index);
}

// YouTube throttles single long requests, so fetch in ranged chunks (like yt-dlp).
const CHUNK = 10 * 1024 * 1024;

/** Downloads a direct media URL to `file` (via a .part file) in ranged chunks. */
async function downloadDirect(
  stream: string,
  file: string,
  headers: Record<string, string> = {},
): Promise<boolean> {
  const part = `${file}.part`;
  try {
    rmSync(part, { force: true });
    for (let from = 0; ; from += CHUNK) {
      const res = await fetch(stream, {
        headers: { ...headers, Range: `bytes=${from}-${from + CHUNK - 1}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 416) break; // asked past the end: done
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      appendFileSync(part, body);
      // Total size from "Content-Range: bytes a-b/total"; stop once we have it all.
      const total = Number(res.headers.get("content-range")?.split("/")[1]);
      if (res.status === 200 || body.length < CHUNK || (total && from + body.length >= total)) break;
    }
    renameSync(part, file);
    return true;
  } catch {
    rmSync(part, { force: true });
    return false;
  }
}

/**
 * Downloads a track's audio in the background (no-op if it's already cached,
 * downloading, not cacheable, or caching is off). Then trims the cache to
 * `keep` tracks.
 *
 * Pass `resolved` (the direct stream mpv already got) to download it with no
 * extra YouTube extraction; without it we fall back to running yt-dlp.
 */
export function cacheInBackground(
  url: string,
  keep: number,
  resolved?: { stream: string | null; ext?: string; headers?: Record<string, string> },
): void {
  if (keep <= 0 || !isCacheable(url) || inflight.has(url)) return;
  if (loadIndex()[url]) return;
  if (!existsSync(OFFLINE_DIR)) mkdirSync(OFFLINE_DIR, { recursive: true });
  inflight.add(url);
  if (resolved?.stream) {
    const file = join(OFFLINE_DIR, `${youtubeId(url)}.${resolved.ext ?? "webm"}`);
    void downloadDirect(resolved.stream, file, resolved.headers).then((ok) => {
      inflight.delete(url);
      if (ok) register(url, file, keep);
    });
    return;
  }
  const proc = spawn(
    ytDlpCommand(),
    [
      "--no-warnings",
      "--no-playlist",
      "--quiet",
      "-f",
      "bestaudio/best",
      "-o",
      `${OFFLINE_DIR}/%(id)s.%(ext)s`,
      // Print the final path once the file is complete (not the .part).
      "--print",
      "after_move:filepath",
      url,
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  let out = "";
  proc.stdout?.on("data", (d) => (out += d.toString()));
  proc.on("error", () => inflight.delete(url));
  proc.on("close", (code) => {
    inflight.delete(url);
    const file = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
    if (code !== 0 || !file || !existsSync(file)) return;
    register(url, file, keep);
  });
}

/** Applies a new size limit right away (e.g. 0 deletes every cached file). */
export function trimCache(keep: number): void {
  const index = loadIndex();
  if (Object.keys(index).length === 0) return;
  evict(index, keep);
  saveIndex(index);
}

/** How many tracks are cached right now. */
export function cachedCount(): number {
  return Object.keys(loadIndex()).length;
}
