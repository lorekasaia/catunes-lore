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
} from "node:fs";
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

/**
 * Downloads a track's audio in the background (no-op if it's already cached,
 * downloading, not cacheable, or caching is off). Then trims the cache to
 * `keep` tracks.
 */
export function cacheInBackground(url: string, keep: number): void {
  if (keep <= 0 || !isCacheable(url) || inflight.has(url)) return;
  if (loadIndex()[url]) return;
  if (!existsSync(OFFLINE_DIR)) mkdirSync(OFFLINE_DIR, { recursive: true });
  inflight.add(url);
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
    const index = loadIndex();
    index[url] = { file, at: Date.now() };
    evict(index, keep);
    saveIndex(index);
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
