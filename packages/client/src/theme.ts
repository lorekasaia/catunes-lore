// Color themes. Green is the default. Built-in themes plus user-defined ones
// from ~/.config/catunes/themes.json (name -> { accent, spectrum }).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { THEMES_FILE, loadSettings, saveSettings } from "./config.ts";

export interface Theme {
  accent: string; // main UI color (borders, markers, labels)
  spectrum: [string, string, string]; // visualizer: low, mid, high
}

const DEFAULT_THEME = "Green";

const BUILTIN: Record<string, Theme> = {
  Green: { accent: "green", spectrum: ["green", "yellow", "red"] },
  Amber: { accent: "yellow", spectrum: ["yellow", "red", "magenta"] },
  Cyan: { accent: "cyan", spectrum: ["cyan", "blue", "magenta"] },
  Magenta: { accent: "magenta", spectrum: ["magenta", "blue", "cyan"] },
  Mono: { accent: "white", spectrum: ["gray", "white", "white"] },
  // Hex-colored themes (need a truecolor terminal; most modern ones are).
  Dracula: { accent: "#bd93f9", spectrum: ["#50fa7b", "#ff79c6", "#8be9fd"] },
  Nord: { accent: "#88c0d0", spectrum: ["#5e81ac", "#81a1c1", "#eceff4"] },
  Gruvbox: { accent: "#fabd2f", spectrum: ["#b8bb26", "#fe8019", "#fb4934"] },
  Sunset: { accent: "#ff8c42", spectrum: ["#ffd166", "#ef476f", "#7b2cbf"] },
  Vaporwave: { accent: "#ff71ce", spectrum: ["#01cdfe", "#b967ff", "#fffb96"] },
  Forest: { accent: "#7fb069", spectrum: ["#386641", "#a7c957", "#f2e8cf"] },
  Lagoon: { accent: "#48cae4", spectrum: ["#0077b6", "#00b4d8", "#caf0f8"] },
  Sakura: { accent: "#ffb7c5", spectrum: ["#ffe5ec", "#ff8fab", "#fb6f92"] },
};

/** Colors offered by the in-app theme editor. */
export const PALETTE = [
  "green", "yellow", "red", "cyan", "blue", "magenta", "white", "gray",
  "#50fa7b", "#8be9fd", "#bd93f9", "#ff79c6", "#ff5555", "#ffb86c", "#f1fa8c",
  "#88c0d0", "#5e81ac", "#a3be8c", "#ebcb8b", "#fe8019", "#b8bb26", "#d3869b",
  "#ff71ce", "#01cdfe", "#b967ff", "#fffb96", "#ffb7c5", "#7fb069", "#48cae4",
  "#0077b6", "#ffd166", "#ef476f", "#7b2cbf", "#f2e8cf",
];

let cached: Theme | null = null;

function customThemes(): Record<string, Theme> {
  if (!existsSync(THEMES_FILE)) return {};
  try {
    return JSON.parse(readFileSync(THEMES_FILE, "utf8"));
  } catch {
    return {};
  }
}

/** Saves (or overwrites) a custom theme in themes.json. */
export function saveCustomTheme(name: string, t: Theme): void {
  const all = customThemes();
  all[name] = t;
  writeFileSync(THEMES_FILE, `${JSON.stringify(all, null, 2)}\n`);
  cached = null;
}

/** Looks up any theme (custom first, then built-in). */
export function getTheme(name: string): Theme | undefined {
  return customThemes()[name] ?? BUILTIN[name];
}

// --- share codes ---
// A theme fits in one line you can paste in a chat:
//   catunes-theme:<name>:<accent>,<low>,<mid>,<high>
// Hex colors drop the "#" so the code survives apps that mangle it.

const SHARE_PREFIX = "catunes-theme:";
const COLOR_RE = /^(#?[0-9a-f]{6}|[a-z]+)$/i;

export function encodeTheme(name: string, t: Theme): string {
  const clean = name.replace(/[:,\s]+/g, " ").trim().replace(/ /g, "_") || "Custom";
  const colors = [t.accent, ...t.spectrum].map((c) => c.replace(/^#/, ""));
  return `${SHARE_PREFIX}${clean}:${colors.join(",")}`;
}

/** Parses a share code; null if it isn't a valid one. */
export function decodeTheme(code: string): { name: string; theme: Theme } | null {
  const raw = code.trim();
  if (!raw.toLowerCase().startsWith(SHARE_PREFIX)) return null;
  const [name, list] = raw.slice(SHARE_PREFIX.length).split(":");
  const colors = (list ?? "").split(",").map((c) => c.trim());
  if (!name || colors.length !== 4 || !colors.every((c) => COLOR_RE.test(c))) return null;
  // Bare 6-char hex gets its "#" back; terminal color names stay as they are.
  const named = new Set(["green", "yellow", "red", "cyan", "blue", "magenta", "white", "gray", "grey", "black"]);
  const fixed = colors.map((c) => (/^[0-9a-f]{6}$/i.test(c) && !named.has(c.toLowerCase()) ? `#${c}` : c));
  return {
    name: name.replace(/_/g, " "),
    theme: { accent: fixed[0]!, spectrum: [fixed[1]!, fixed[2]!, fixed[3]!] },
  };
}

/** All theme names (built-in first, then custom). */
export function listThemes(): string[] {
  return [...new Set([...Object.keys(BUILTIN), ...Object.keys(customThemes())])];
}

export function activeThemeName(): string {
  return loadSettings().theme ?? DEFAULT_THEME;
}

export function setTheme(name: string): void {
  saveSettings({ theme: name });
  cached = null;
}

/** The resolved active theme (custom overrides built-in; falls back to Green). */
export function theme(): Theme {
  if (cached) return cached;
  const name = activeThemeName();
  cached = customThemes()[name] ?? BUILTIN[name] ?? BUILTIN[DEFAULT_THEME]!;
  return cached;
}

/** Replaces the {a} accent token with the theme color (for i18n strings). */
export function themed(str: string): string {
  return str.replaceAll("{a}", `{${theme().accent}-fg}`);
}
