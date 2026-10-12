// Remembers each track's tempo (BPM) once sound detection has measured it
// steadily, so a DJ transition into that track can match tempos next time —
// without analysing (or re-requesting) the track ahead of playing it.

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.ts";

const FILE = join(CONFIG_DIR, "bpm.json");
const MAX = 5000;
let cache: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (cache) return cache;
  try {
    cache = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export function getBpm(url: string): number | null {
  return load()[url] ?? null;
}

export function saveBpm(url: string, bpm: number): void {
  const c = load();
  if (c[url] === bpm) return;
  delete c[url]; // re-insert: newest last, so trimming drops the oldest
  c[url] = bpm;
  const keys = Object.keys(c);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete c[k];
  try {
    writeFileSync(`${FILE}.tmp`, JSON.stringify(c));
    renameSync(`${FILE}.tmp`, FILE);
  } catch {
    // a nicety: never break playback over it
  }
}
