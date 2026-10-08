// Self-update for git installs (e.g. the Termux bootstrap): `git pull`, then
// reinstall deps + rebuild only if something actually changed. npm installs
// (`npm i -g catunes`) have no .git, so we just tell the user what to run.
//
// A standalone binary made with `bun build --compile` (e.g. a catunes.exe
// pinned to the Windows taskbar) is a frozen snapshot, so after rebuilding
// we also recompile that binary in place.

import { spawn } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type UpdateResult =
  | { status: "updated"; log: string }
  | { status: "upToDate" }
  | { status: "notGit" }
  | { status: "failed"; step: string; log: string };

/** True when running as a `bun build --compile` binary (not node/bun + script). */
export function isCompiledBinary(): boolean {
  return !/^(node|bun)(\.exe)?$/i.test(basename(process.execPath));
}

function walkUpToGit(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * The repo root (the folder holding .git): found from this source file, or —
 * inside a compiled binary, whose sources live in a virtual filesystem — from
 * the binary's own location.
 */
export function findRepoRoot(): string | null {
  if (isCompiledBinary()) return walkUpToGit(dirname(process.execPath));
  try {
    return walkUpToGit(dirname(fileURLToPath(import.meta.url)));
  } catch {
    return null;
  }
}

/** Deletes the previous binary left behind by a self-update (see selfUpdate). */
export function cleanupOldBinary(): void {
  if (!isCompiledBinary()) return;
  try {
    rmSync(`${process.execPath}.old`, { force: true });
  } catch {
    // still locked or not there: try again next launch
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
    // shell: needed on Windows to find npm.cmd. The shell joins args with
    // spaces, so quote any that contain one (e.g. "cursos lore").
    const shell = process.platform === "win32";
    const argv = shell ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
    const p = spawn(cmd, argv, { cwd, shell, env: buildEnv() });
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

  // Use bun where the checkout is managed by bun (bun.lock + bun available —
  // npm chokes on bun's node_modules layout); npm otherwise (e.g. Termux).
  const useBun = existsSync(join(root, "bun.lock")) && (await run("bun", ["--version"], root)).code === 0;
  const pm = useBun ? "bun" : "npm";

  onStep(`${pm} install`);
  // --include=dev: the build needs TypeScript (a devDependency), even where
  // npm is configured to skip devDependencies.
  const install = await run(pm, useBun ? ["install"] : ["install", "--include=dev"], useBun ? root : client);
  if (install.code !== 0) return { status: "failed", step: `${pm} install`, log: tail(install.out) };

  onStep(`${pm} run build`);
  const build = await run(pm, ["run", "build"], client);
  if (build.code !== 0) return { status: "failed", step: `${pm} run build`, log: tail(build.out) };

  if (isCompiledBinary()) {
    // Windows can't overwrite a running .exe, but it can rename it: move the
    // running one aside, compile the new one in its place, roll back on failure.
    onStep("bun build --compile");
    const exe = process.execPath;
    const old = `${exe}.old`;
    try {
      rmSync(old, { force: true });
      renameSync(exe, old);
    } catch (e) {
      return { status: "failed", step: "bun build --compile", log: String(e) };
    }
    const compile = await run(
      "bun",
      ["build", "--compile", join(client, "src", "cli.ts"), "--outfile", exe],
      root,
    );
    if (compile.code !== 0 || !existsSync(exe)) {
      try {
        renameSync(old, exe);
      } catch {
        // ignore
      }
      return { status: "failed", step: "bun build --compile", log: tail(compile.out) };
    }
  }

  const log = await run("git", ["log", "--oneline", `${before.out.trim()}..${after.out.trim()}`], root);
  return { status: "updated", log: tail(log.out, 8) };
}
