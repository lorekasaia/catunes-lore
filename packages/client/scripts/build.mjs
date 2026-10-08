// Builds dist/ without ever leaving catunes broken: compiles into dist.new
// and only swaps it in when tsc succeeds (the old `rm -rf dist && tsc` left
// no dist/cli.js at all whenever tsc failed). TypeScript is found through
// Node's module resolution — which also sees a workspace root's hoisted
// node_modules — instead of relying on `tsc` being on PATH.

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

let tsc;
try {
  tsc = require.resolve("typescript/bin/tsc");
} catch {
  console.error("✖ TypeScript isn't installed (it's a devDependency). Run:  npm install --include=dev");
  process.exit(1);
}

const next = join(root, "dist.new");
const dist = join(root, "dist");
rmSync(next, { recursive: true, force: true });
const res = spawnSync(
  process.execPath,
  [tsc, "-p", join(root, "tsconfig.build.json"), "--outDir", next],
  { stdio: "inherit", cwd: root },
);
if (res.status !== 0 || !existsSync(join(next, "cli.js"))) {
  rmSync(next, { recursive: true, force: true });
  console.error("✖ Build failed — the previous dist/ was left untouched.");
  process.exit(res.status || 1);
}
rmSync(dist, { recursive: true, force: true });
renameSync(next, dist);
console.log("✔ Built dist/");
