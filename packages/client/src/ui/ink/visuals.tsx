// Presentational building blocks: colours/gradients, the visualizer (all
// modes, any width), smooth progress bars, sound "chips" and cover art.
//
// Rendering note: Ink builds one node per <Text>, so cells are run-length
// merged (consecutive cells with the same colours become one <Text>) and
// gradients are quantized — a full-width visualizer stays cheap, even on a
// phone.

import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.ts";
import type { SoundTag } from "../../sounds.ts";

export const SPECTRUM_H = 6;
export const VIZ_MODES = ["bars", "smooth", "mirror", "scope", "plasma", "waterfall", "vu", "fire"] as const;
const LEVELS = "▁▂▃▄▅▆▇█";

// --- colour helpers -------------------------------------------------------------

type RGB = [number, number, number];

// Approximate RGB for the terminal colour names themes may use.
const NAMED: Record<string, RGB> = {
  black: [0, 0, 0],
  red: [205, 49, 49],
  green: [13, 188, 121],
  yellow: [229, 229, 16],
  blue: [36, 114, 200],
  magenta: [188, 63, 188],
  cyan: [17, 168, 205],
  white: [229, 229, 229],
  gray: [118, 118, 118],
  grey: [118, 118, 118],
  redbright: [241, 76, 76],
  greenbright: [35, 209, 139],
  yellowbright: [245, 245, 67],
  bluebright: [59, 142, 234],
  magentabright: [214, 112, 214],
  cyanbright: [41, 184, 219],
  whitebright: [255, 255, 255],
};

export function toRgb(color: string): RGB {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return NAMED[color.toLowerCase()] ?? [200, 200, 200];
}

export function toHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return toHex([f(0), f(8), f(4)]);
}

const GRADIENT_STEPS = 16;
const gradientCache = new Map<string, string[]>();

/** The theme's low → mid → high colours as a smooth, quantized gradient. */
export function spectrumGradient(): string[] {
  const [low, mid, high] = theme().spectrum;
  const key = `${low}|${mid}|${high}`;
  let g = gradientCache.get(key);
  if (!g) {
    g = [];
    for (let i = 0; i < GRADIENT_STEPS; i++) {
      const t = i / (GRADIENT_STEPS - 1);
      g.push(t < 0.5 ? mix(low, mid, t * 2) : mix(mid, high, (t - 0.5) * 2));
    }
    gradientCache.set(key, g);
  }
  return g;
}

/** Colour at position t (0..1) of the gradient. */
export function gradientAt(t: number): string {
  const g = spectrumGradient();
  return g[Math.max(0, Math.min(g.length - 1, Math.round(t * (g.length - 1))))]!;
}

// --- run-length cell rendering ----------------------------------------------------

export interface Cell {
  ch: string;
  fg?: string;
  bg?: string;
  dim?: boolean;
}

/** One row of cells → as few <Text> nodes as possible. */
export function CellRow({ cells }: { cells: Cell[] }) {
  const out: React.ReactNode[] = [];
  let run = "";
  let cur: Cell | null = null;
  const flush = () => {
    if (!cur || !run) return;
    out.push(
      <Text key={out.length} color={cur.fg} backgroundColor={cur.bg} dimColor={cur.dim}>
        {run}
      </Text>,
    );
  };
  for (const c of cells) {
    if (cur && c.fg === cur.fg && c.bg === cur.bg && c.dim === cur.dim) {
      run += c.ch;
    } else {
      flush();
      cur = c;
      run = c.ch;
    }
  }
  flush();
  return <Text>{out}</Text>;
}

// --- visualizer ---------------------------------------------------------------------

/** Linear resample of the analyzer's bands to `n` columns. */
function resample(src: number[], n: number): number[] {
  if (src.length === n) return src;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const x = (i / Math.max(1, n - 1)) * (src.length - 1);
    const a = Math.floor(x);
    const f = x - a;
    out[i] = (src[a] ?? 0) * (1 - f) + (src[Math.min(src.length - 1, a + 1)] ?? 0) * f;
  }
  return out;
}

/** Brighter towards the top of a bar: row 0 = bottom. */
function rowShade(color: string, row: number): string {
  return mix(color, "#ffffff", (row / (SPECTRUM_H - 1)) * 0.3);
}

function vizBars(spec: number[], peaks: number[], w: number, smooth: boolean): Cell[][] {
  const s = resample(spec, w);
  const p = resample(peaks, w);
  const rows: Cell[][] = [];
  for (let level = SPECTRUM_H - 1; level >= 0; level--) {
    const row: Cell[] = [];
    for (let i = 0; i < w; i++) {
      const h = s[i]!;
      const fg = rowShade(gradientAt(i / Math.max(1, w - 1)), level);
      const cap = h <= level && Math.floor(p[i]!) === level && p[i]! > 0.3;
      let ch = " ";
      if (h >= level + 1) ch = "█";
      else if (h > level) ch = smooth ? LEVELS[Math.min(7, Math.floor((h - level) * 8))]! : "█";
      else if (cap) ch = "▀";
      row.push(ch === " " ? { ch } : { ch, fg, dim: cap && ch === "▀" });
    }
    rows.push(row);
  }
  return rows;
}

function vizMirror(spec: number[], w: number): Cell[][] {
  const s = resample(spec, w);
  const cy = (SPECTRUM_H - 1) / 2;
  const rows: Cell[][] = [];
  for (let r = 0; r < SPECTRUM_H; r++) {
    const dist = Math.abs(r - cy);
    const row: Cell[] = [];
    for (let i = 0; i < w; i++) {
      const half = (s[i]! / SPECTRUM_H) * (SPECTRUM_H / 2) + 0.3;
      row.push(dist <= half ? { ch: "█", fg: gradientAt(dist / (SPECTRUM_H / 2)) } : { ch: " " });
    }
    rows.push(row);
  }
  return rows;
}

function vizScope(wave: number[], w: number): Cell[][] {
  // Two vertical "pixels" per cell (▀/▄) for a smoother trace.
  const H = SPECTRUM_H * 2;
  const grid: Cell[][] = Array.from({ length: SPECTRUM_H }, () => Array.from({ length: w }, () => ({ ch: " " })));
  for (let x = 0; x < w; x++) {
    const v = wave[Math.floor((x / w) * wave.length)] ?? 0;
    const py = Math.max(0, Math.min(H - 1, Math.round((1 - (v + 1) / 2) * (H - 1))));
    const cell = grid[py >> 1]![x]!;
    cell.ch = py % 2 ? "▄" : "▀";
    cell.fg = gradientAt(Math.abs(v));
  }
  return grid;
}

function vizPlasma(frame: number, energy: number, w: number): Cell[][] {
  const rows: Cell[][] = [];
  for (let r = 0; r < SPECTRUM_H; r++) {
    const row: Cell[] = [];
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x * 0.3 + frame * 0.15) + Math.sin(r * 0.6 + frame * 0.1) + Math.sin((x + r) * 0.2 + frame * 0.2);
      // Quantized hue so neighbouring cells merge into runs.
      const hue = Math.round(((((v + 3) / 6) * 360 + frame * 3) % 360) / 15) * 15;
      row.push({ ch: "█", fg: hslToHex(hue, 85, Math.round((30 + energy * 45) / 5) * 5) });
    }
    rows.push(row);
  }
  return rows;
}

/** Spectrogram "waterfall": newest spectrum at the top, two time steps per row. */
function vizWaterfall(history: number[][], w: number): Cell[][] {
  const rows: Cell[][] = [];
  const at = (k: number) => history[history.length - 1 - k];
  const heat = (v: number) => {
    const t = Math.max(0, Math.min(1, v / SPECTRUM_H));
    return t < 0.08 ? undefined : gradientAt(t);
  };
  for (let r = 0; r < SPECTRUM_H; r++) {
    const top = at(r * 2);
    const bot = at(r * 2 + 1);
    const ts = top ? resample(top, w) : null;
    const bs = bot ? resample(bot, w) : null;
    const row: Cell[] = [];
    for (let i = 0; i < w; i++) {
      const fg = ts ? heat(ts[i]!) : undefined;
      const bg = bs ? heat(bs[i]!) : undefined;
      if (!fg && !bg) row.push({ ch: " " });
      else if (fg && !bg) row.push({ ch: "▀", fg });
      else if (!fg && bg) row.push({ ch: "▄", fg: bg });
      else row.push({ ch: "▀", fg, bg });
    }
    rows.push(row);
  }
  return rows;
}

/** VU-style meters: overall level + lows/mids/highs, with peak-hold ticks. */
function vizVu(spec: number[], peaks: number[], w: number, labels: [string, string, string, string]): Cell[][] {
  const n = spec.length || 1;
  const avg = (a: number[], from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += a[i] ?? 0;
    return s / Math.max(1, to - from) / SPECTRUM_H;
  };
  const third = Math.floor(n / 3);
  const meters: [string, number, number][] = [
    [labels[0], avg(spec, 0, n), avg(peaks, 0, n)],
    [labels[1], avg(spec, 0, third), avg(peaks, 0, third)],
    [labels[2], avg(spec, third, 2 * third), avg(peaks, third, 2 * third)],
    [labels[3], avg(spec, 2 * third, n), avg(peaks, 2 * third, n)],
  ];
  const lw = Math.max(...labels.map((l) => l.length)) + 1;
  const mw = Math.max(4, w - lw);
  const rows: Cell[][] = [];
  for (const [label, v, pk] of meters) {
    const row: Cell[] = [...label.padEnd(lw)].map((ch) => ({ ch, dim: true }));
    const fill = Math.round(Math.min(1, v * 1.4) * mw);
    const peakAt = Math.min(mw - 1, Math.round(Math.min(1, pk * 1.4) * mw));
    for (let i = 0; i < mw; i++) {
      const fg = gradientAt(i / Math.max(1, mw - 1));
      if (i < fill) row.push({ ch: "■", fg });
      else if (i === peakAt && pk > 0.02) row.push({ ch: "▌", fg });
      else row.push({ ch: "·", dim: true });
    }
    rows.push(row);
  }
  // Scale (-dB-ish ticks) and a spacer, to fill the 6 rows.
  const scale: Cell[] = [..." ".repeat(lw)].map((ch) => ({ ch }));
  for (let i = 0; i < mw; i++) scale.push({ ch: i % Math.max(1, Math.floor(mw / 8)) === 0 ? "┴" : "─", dim: true });
  rows.push(scale, []);
  return rows;
}

// Doom-style fire: heat rises from a bottom row fed by the bass energy.
let fireBuf: Float32Array = new Float32Array(0);
let fireW = 0;
function vizFire(spec: number[], w: number, playing: boolean): Cell[][] {
  const H = SPECTRUM_H * 2; // half-block pixels
  if (fireW !== w) {
    fireW = w;
    fireBuf = new Float32Array(w * H);
  }
  const s = resample(spec, w);
  // Feed the bottom row: each column burns with its band (plus a little flicker).
  for (let x = 0; x < w; x++) {
    const e = playing ? Math.min(1, s[x]! / SPECTRUM_H + 0.15) : 0;
    fireBuf[(H - 1) * w + x] = e * (0.75 + Math.random() * 0.25);
  }
  // Propagate upwards with decay and a sideways wobble.
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y + 1) * w + Math.max(0, Math.min(w - 1, x + Math.round(Math.random() * 2 - 1)));
      fireBuf[y * w + x] = Math.max(0, fireBuf[src]! - Math.random() * 0.085);
    }
  }
  const color = (v: number) => {
    if (v < 0.06) return undefined;
    const t = Math.round(Math.min(1, v) * 10) / 10;
    // black-red → orange → yellow → white, tinted towards the theme accent.
    const base = t < 0.4 ? mix("#300000", "#d02000", t / 0.4) : t < 0.75 ? mix("#d02000", "#ffa000", (t - 0.4) / 0.35) : mix("#ffa000", "#fff0b0", (t - 0.75) / 0.25);
    return mix(base, theme().accent, 0.15);
  };
  const rows: Cell[][] = [];
  for (let r = 0; r < SPECTRUM_H; r++) {
    const row: Cell[] = [];
    for (let x = 0; x < w; x++) {
      const fg = color(fireBuf[r * 2 * w + x]!);
      const bg = color(fireBuf[(r * 2 + 1) * w + x]!);
      if (!fg && !bg) row.push({ ch: " " });
      else if (fg && !bg) row.push({ ch: "▀", fg });
      else if (!fg && bg) row.push({ ch: "▄", fg: bg });
      else row.push({ ch: "▀", fg, bg });
    }
    rows.push(row);
  }
  return rows;
}

export function Visualizer({
  mode,
  spec,
  peaks,
  wave,
  history,
  frame,
  playing,
  width,
  vuLabels,
}: {
  mode: string;
  spec: number[];
  peaks: number[];
  wave: number[];
  history: number[][];
  frame: number;
  playing: boolean;
  width: number;
  vuLabels: [string, string, string, string];
}) {
  const w = Math.max(8, width);
  let rows: Cell[][];
  if (mode === "mirror") rows = vizMirror(spec, w);
  else if (mode === "smooth") rows = vizBars(spec, peaks, w, true);
  else if (mode === "scope") rows = vizScope(wave, w);
  else if (mode === "plasma") {
    const energy = spec.reduce((a, b) => a + b, 0) / (spec.length * SPECTRUM_H);
    rows = vizPlasma(frame, playing ? Math.max(0.15, energy) : 0.1, w);
  } else if (mode === "waterfall") rows = vizWaterfall(history, w);
  else if (mode === "vu") rows = vizVu(spec, peaks, w, vuLabels);
  else if (mode === "fire") rows = vizFire(spec, w, playing);
  else rows = vizBars(spec, peaks, w, false);
  return (
    <Box flexDirection="column">
      {rows.map((cells, i) => (
        <CellRow key={i} cells={cells.length ? cells : [{ ch: " " }]} />
      ))}
    </Box>
  );
}

/** A one-row mini spectrum (mini player). */
export function MiniSpectrum({ spec, width }: { spec: number[]; width: number }) {
  const s = resample(spec, Math.max(4, width));
  return (
    <CellRow
      cells={s.map((v, i) => ({
        ch: LEVELS[Math.max(0, Math.min(7, Math.floor((v / SPECTRUM_H) * 8)))]!,
        fg: gradientAt(i / Math.max(1, s.length - 1)),
      }))}
    />
  );
}

// --- smooth bars -----------------------------------------------------------------------

const PARTIAL = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** A progress/volume bar with 1/8-cell resolution, filled with the gradient. */
export function SmoothBar({ ratio, width, gradient = true }: { ratio: number; width: number; gradient?: boolean }) {
  const r = Math.max(0, Math.min(1, ratio));
  const eighths = Math.round(r * width * 8);
  const full = Math.floor(eighths / 8);
  const part = eighths % 8;
  const accent = theme().accent;
  const cells: Cell[] = [];
  for (let i = 0; i < width; i++) {
    const fg = gradient ? gradientAt(i / Math.max(1, width - 1)) : accent;
    if (i < full) cells.push({ ch: "█", fg });
    else if (i === full && part) cells.push({ ch: PARTIAL[part]!, fg });
    else cells.push({ ch: "─", dim: true });
  }
  return <CellRow cells={cells} />;
}

// --- sound chips -----------------------------------------------------------------------

/** Sound-detection tags as coloured pills, plus the tempo. */
export function SoundChips({ tags, bpm, listening }: { tags: SoundTag[]; bpm: number | null; listening: string }) {
  const [low, mid, high] = theme().spectrum;
  const accent = theme().accent;
  const bgFor: Record<SoundTag["kind"], string> = {
    voice: accent,
    instrument: mid!,
    genre: high!,
    mood: low!,
  };
  if (!tags.length && !bpm) return <Text dimColor>{listening}</Text>;
  const nodes: React.ReactNode[] = [];
  for (const tg of tags) {
    nodes.push(
      <Text key={nodes.length} color="#101010" backgroundColor={bgFor[tg.kind]}>
        {` ${tg.emoji} ${tg.label} `}
      </Text>,
      <Text key={nodes.length + 0.5}> </Text>,
    );
  }
  if (bpm) {
    nodes.push(
      <Text key="bpm" color={accent} bold>
        ♩{bpm}
      </Text>,
    );
  }
  return <Text wrap="truncate">{nodes}</Text>;
}

// --- cover art -------------------------------------------------------------------------

export interface CoverPixels {
  w: number; // columns
  h: number; // pixel rows (2 per text row)
  rgb: Uint8Array; // w*h*3
}

/** Cover image drawn with half blocks (top pixel = fg, bottom pixel = bg). */
export const CoverArt = React.memo(function CoverArt({ cover }: { cover: CoverPixels }) {
  const rows: Cell[][] = [];
  const px = (x: number, y: number) => {
    const i = (y * cover.w + x) * 3;
    return toHex([cover.rgb[i]!, cover.rgb[i + 1]!, cover.rgb[i + 2]!]);
  };
  for (let y = 0; y + 1 < cover.h; y += 2) {
    const row: Cell[] = [];
    for (let x = 0; x < cover.w; x++) row.push({ ch: "▀", fg: px(x, y), bg: px(x, y + 1) });
    rows.push(row);
  }
  return (
    <Box flexDirection="column">
      {rows.map((cells, i) => (
        <CellRow key={i} cells={cells} />
      ))}
    </Box>
  );
});
