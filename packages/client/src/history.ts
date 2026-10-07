// Playback history: what played recently (most recent first), persisted so
// it survives restarts. Capped so the file can't grow forever.

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { HISTORY_FILE, ensureConfig } from "./config.ts";

export interface HistoryEntry {
  url: string;
  title: string;
  at: number; // epoch ms
}

export const HISTORY_MAX = 200;

export function loadHistory(): HistoryEntry[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Pure helper: puts an entry on top, dropping a back-to-back repeat of the
 * same track (re-opening the app resumes the last song — that isn't a new play).
 */
export function pushEntry(
  list: HistoryEntry[],
  entry: HistoryEntry,
  max = HISTORY_MAX,
): HistoryEntry[] {
  const rest = list[0]?.url === entry.url ? list.slice(1) : list;
  return [entry, ...rest].slice(0, max);
}

export function addHistory(url: string, title: string): void {
  try {
    ensureConfig();
    const next = pushEntry(loadHistory(), { url, title, at: Date.now() });
    const temp = `${HISTORY_FILE}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, HISTORY_FILE);
  } catch {
    // history is a nicety; never break playback over it
  }
}

export function clearHistory(): void {
  try {
    writeFileSync(HISTORY_FILE, "[]");
  } catch {
    // ignore
  }
}
