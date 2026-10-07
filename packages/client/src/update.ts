// Self-update for git installs (e.g. the Termux bootstrap): `git pull`, then
// reinstall deps + rebuild only if something actually changed. npm installs
// (`npm i -g catunes`) have no .git, so we just tell the user what to run.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type UpdateResult =
  | { status: "updated"; log: string }
  | { status: "upToDate" }
  | { status: "notGit" }
  | { status: "failed"; step: string; log: string };

/** Walks up from this file to the repo root (the folder holding .git). */
export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Same trick as scripts/bootstrap-termux.sh: ffmpeg-static has no Android
// binary, so on Termux point it at the system ffmpeg or `npm install` fails.
function buildEnv(): NodeJS.ProcessEnv {
  const prefix = process.env.PREFIX ?? "";
  if (!process.env.FFMPEG_BIN && prefix.includes("com.termux")) {
    return { ...process.env, FFMPEG_BIN: join(prefix, "bin", "ffmpeg") };
  }
  return process.env;
}

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    // shell: needed on Windows to find npm.cmd; harmless elsewhere.
    const p = spawn(cmd, args, { cwd, shell: process.platform === "win32", env: buildEnv() });
    let out = "";
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (out += d.toString()));
    p.on("error", (e) => resolve({ code: 1, out: out + String(e) }));
    p.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** Last few non-empty lines (enough to show in the UI without flooding it). */
function tail(s: string, n = 6): string {
  return s.split(/\r?\n/).filter((l) => l.trim()).slice(-n).join("\n");
}

export async function selfUpdate(onStep: (step: string) => void = () => {}): Promise<UpdateResult> {
  const root = findRepoRoot();
  if (!root) return { status: "notGit" };
  const client = join(root, "packages", "client");

  onStep("git pull");
  const before = await run("git", ["rev-parse", "HEAD"], root);
  const pull = await run("git", ["pull", "--ff-only"], root);
  if (pull.code !== 0) return { status: "failed", step: "git pull", log: tail(pull.out) };
  const after = await run("git", ["rev-parse", "HEAD"], root);
  if (before.out.trim() === after.out.trim()) return { status: "upToDate" };

  onStep("npm install");
  const install = await run("npm", ["install"], client);
  if (install.code !== 0) return { status: "failed", step: "npm install", log: tail(install.out) };

  onStep("npm run build");
  const build = await run("npm", ["run", "build"], client);
  if (build.code !== 0) return { status: "failed", step: "npm run build", log: tail(build.out) };

  const log = await run("git", ["log", "--oneline", `${before.out.trim()}..${after.out.trim()}`], root);
  return { status: "updated", log: tail(log.out, 8) };
}
