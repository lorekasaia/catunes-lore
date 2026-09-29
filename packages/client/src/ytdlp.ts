// yt-dlp resolver with cross-platform auto-download.
//
// Resolution order:
//   1. A system-wide yt-dlp on PATH (use it, download nothing).
//   2. A previously downloaded copy in ~/.config/catunes/bin/.
//   3. Otherwise, detect the OS + architecture and download the matching
//      standalone binary from the official yt-dlp GitHub release.
//
// Downloads happen ON DEMAND (first use), never in a postinstall step.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  statSync,
} from "node:fs";
import { join, delimiter } from "node:path";
import { CONFIG_DIR } from "./config.ts";

export const YTDLP_DIR = join(CONFIG_DIR, "bin");
const BIN_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const LOCAL_PATH = join(YTDLP_DIR, BIN_NAME);

const RELEASE_BASE =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";

let resolved: string | null = null;

/** Detects the OS + architecture and returns the matching release asset. */
export function assetForPlatform(
  os: string = process.platform,
  arch: string = process.arch,
): { asset: string; label: string } {
  if (os === "win32") {
    return { asset: "yt-dlp.exe", label: "Windows" };
  }
  if (os === "darwin") {
    // Universal binary: works on both Intel and Apple Silicon.
    return { asset: "yt-dlp_macos", label: "macOS" };
  }
  // Linux (and other unix). Node reports ARM64 as "arm64".
  if (arch === "arm64") {
    return { asset: "yt-dlp_linux_aarch64", label: "Linux (arm64)" };
  }
  return { asset: "yt-dlp_linux", label: "Linux (x64)" };
}

/**
 * Tries to actually run the command instead of asking `which`/`where` for it
 * — some minimal environments (e.g. Termux) don't ship that utility, which
 * would otherwise make a perfectly usable yt-dlp look "not found".
 */
function commandExists(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return !res.error;
}

/** Returns a usable yt-dlp path/command, or null if none is available yet. */
export function findYtDlp(): string | null {
  if (resolved) return resolved;
  if (process.env.YT_DLP_PATH && existsSync(process.env.YT_DLP_PATH)) return (resolved = process.env.YT_DLP_PATH);
  if (commandExists("yt-dlp")) return (resolved = "yt-dlp");
  // Only trust our own auto-downloaded copy if it actually runs — a earlier
  // download for the wrong platform/libc (e.g. glibc vs Android's Bionic)
  // can leave a file on disk that exists but can't execute.
  if (existsSync(LOCAL_PATH) && commandExists(LOCAL_PATH)) return (resolved = LOCAL_PATH);
  return null;
}

/** The command to invoke yt-dlp with (falls back to "yt-dlp"). */
export function ytDlpCommand(): string {
  return findYtDlp() ?? "yt-dlp";
}

async function downloadYtDlp(log: (m: string) => void): Promise<string> {
  const { asset, label } = assetForPlatform();
  log(`Downloading yt-dlp for ${label} (one time)…`);

  if (!existsSync(YTDLP_DIR)) mkdirSync(YTDLP_DIR, { recursive: true });

  const res = await fetch(RELEASE_BASE + asset); // follows GitHub redirects
  if (!res.ok) {
    throw new Error(`download failed (HTTP ${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // Basic sanity check: the real binary is several MB.
  if (buf.length < 1_000_000) {
    throw new Error("downloaded file looks too small");
  }
  writeFileSync(LOCAL_PATH, buf);
  if (process.platform !== "win32") chmodSync(LOCAL_PATH, 0o755);

  // Functional verification: it must report a version.
  const ver = spawnSync(LOCAL_PATH, ["--version"], { encoding: "utf8" });
  if (ver.status !== 0) {
    throw new Error("downloaded yt-dlp did not run");
  }
  log(`yt-dlp ready (${ver.stdout.trim()})`);
  return LOCAL_PATH;
}

/**
 * Ensures a yt-dlp is available, downloading it for the detected OS if needed.
 * Returns the path/command, or null if it could not be obtained.
 */
export async function ensureYtDlp(
  log: (m: string) => void = () => {},
): Promise<string | null> {
  const found = findYtDlp();
  if (found) return found;
  try {
    resolved = await downloadYtDlp(log);
    return resolved;
  } catch (e) {
    log(`Could not download yt-dlp: ${(e as Error).message}`);
    return null;
  }
}

/** True if the cached binary exists (used by `doctor`). */
export function hasDownloadedYtDlp(): boolean {
  return existsSync(LOCAL_PATH);
}

/** Size of the cached binary in MB (for diagnostics), or 0. */
export function downloadedSizeMB(): number {
  try {
    return Math.round((statSync(LOCAL_PATH).size / 1_000_000) * 10) / 10;
  } catch {
    return 0;
  }
}

export { delimiter };
