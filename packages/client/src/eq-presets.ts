// Equalizer presets for catunes' 10 bands (31 Hz … 16 kHz, octave spaced).
//
// Three sources:
//  • Winamp's built-in presets — the classic curves — taken from Webamp's
//    copy of Winamp's EQ library (github.com/captbaritone/webamp, MIT,
//    packages/webamp/presets/builtin.json). Winamp uses different bands and a
//    1..64 slider scale, so fromWinamp() converts them (see below).
//  • catunes' original presets (incl. the home-theater style modes).
//  • Curves designed for catunes from common mixing guidance for genres and
//    playback situations Winamp didn't cover. Starting points, not gospel.

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export type EqCategory = "genre" | "place" | "tone";

export interface EqPreset {
  name: string;
  category: EqCategory;
  gains: number[]; // dB per band, -12..12
  night?: boolean; // add the night-mode compressor
}

// Winamp's 10 bands and its slider scale: 1 = -12 dB, 33 = 0 dB, 64 = +12 dB.
const WINAMP_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

/**
 * Pure: converts a Winamp preset (10 sliders, 1..64) to catunes' bands by
 * interpolating its curve on a log-frequency axis (flat beyond the ends),
 * rounded to whole dB.
 */
export function fromWinamp(sliders: number[]): number[] {
  const db = sliders.map((v) => ((v - 33) * 12) / 31);
  return EQ_FREQS.map((f) => {
    if (f <= WINAMP_FREQS[0]!) return Math.round(db[0]!);
    if (f >= WINAMP_FREQS[WINAMP_FREQS.length - 1]!) return Math.round(db[db.length - 1]!);
    let i = 0;
    while (WINAMP_FREQS[i + 1]! < f) i++;
    const a = Math.log(WINAMP_FREQS[i]!);
    const b = Math.log(WINAMP_FREQS[i + 1]!);
    const t = (Math.log(f) - a) / (b - a);
    const v = db[i]! + (db[i + 1]! - db[i]!) * t;
    return Math.round(v) || 0; // no "-0"
  });
}

// [name, sliders 60 Hz … 16 kHz] from Winamp's library.
const WINAMP: [string, EqCategory, number[]][] = [
  ["Classical", "genre", [33, 33, 33, 33, 33, 33, 20, 20, 20, 16]],
  ["Club", "place", [33, 33, 38, 42, 42, 42, 38, 33, 33, 33]],
  ["Dance", "genre", [48, 44, 36, 32, 32, 22, 20, 20, 32, 32]],
  ["Laptop / headphones", "place", [40, 50, 41, 26, 28, 35, 40, 48, 53, 56]],
  ["Large hall", "place", [49, 49, 42, 42, 33, 24, 24, 24, 33, 33]],
  ["Party", "place", [44, 44, 33, 33, 33, 33, 33, 33, 44, 44]],
  ["Pop", "genre", [29, 40, 44, 45, 41, 30, 28, 28, 29, 29]],
  ["Reggae", "genre", [33, 33, 31, 22, 33, 43, 43, 33, 33, 33]],
  ["Rock", "genre", [45, 40, 23, 19, 26, 39, 47, 50, 50, 50]],
  ["Soft", "tone", [40, 35, 30, 28, 30, 39, 46, 48, 50, 52]],
  ["Ska", "genre", [28, 24, 25, 31, 39, 42, 47, 48, 50, 48]],
  ["Full bass", "tone", [48, 48, 48, 42, 35, 25, 18, 15, 14, 14]],
  ["Soft rock", "genre", [39, 39, 36, 31, 25, 23, 26, 31, 37, 47]],
  ["Full treble", "tone", [16, 16, 16, 25, 37, 50, 58, 58, 58, 60]],
  ["Full bass & treble", "tone", [44, 42, 33, 20, 24, 35, 46, 50, 52, 52]],
  ["Live", "place", [24, 33, 39, 41, 42, 42, 39, 37, 37, 36]],
  ["Techno", "genre", [45, 42, 33, 23, 24, 33, 45, 48, 48, 47]],
];

//                       31  62 125 250 500  1k  2k  4k  8k 16k
const OWN: EqPreset[] = [
  // catunes' originals
  { name: "Bass boost", category: "tone", gains: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0] },
  { name: "Treble boost", category: "tone", gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] },
  { name: "Vocal", category: "tone", gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  { name: "Jazz", category: "genre", gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { name: "Loudness", category: "tone", gains: [6, 4, 0, 0, -2, 0, 0, 2, 5, 6] },
  { name: "Movie", category: "place", gains: [5, 4, 1, -1, 0, 2, 3, 2, 1, 2] },
  { name: "News", category: "place", gains: [-5, -4, -2, 2, 6, 6, 4, 1, -2, -3] },
  { name: "Stadium", category: "place", gains: [6, 5, 3, 0, -3, -3, -1, 2, 5, 6] },
  { name: "Night", category: "place", gains: [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2], night: true },
  // designed for catunes
  { name: "Hip hop", category: "genre", gains: [6, 5, 3, 1, -1, -1, 1, 1, 2, 3] },
  { name: "Reggaeton", category: "genre", gains: [6, 5, 2, 0, -1, 0, 1, 2, 3, 3] },
  { name: "Electronic", category: "genre", gains: [5, 4, 1, 0, -2, 1, 1, 2, 4, 5] },
  { name: "Metal", category: "genre", gains: [5, 4, 1, -1, -3, -1, 2, 4, 5, 5] },
  { name: "R&B", category: "genre", gains: [3, 6, 5, 1, -2, -1, 2, 3, 3, 4] },
  { name: "Latin", category: "genre", gains: [3, 2, 0, 0, -1, -1, -1, 2, 4, 5] },
  { name: "K-pop", category: "genre", gains: [3, 3, 1, 0, 1, 2, 3, 3, 4, 4] },
  { name: "Blues", category: "genre", gains: [2, 3, 2, 1, 0, 1, 2, 2, 1, 0] },
  { name: "Country", category: "genre", gains: [1, 2, 1, 0, 1, 2, 3, 3, 2, 1] },
  { name: "Acoustic", category: "genre", gains: [4, 4, 3, 1, 2, 2, 3, 4, 3, 2] },
  { name: "Piano", category: "genre", gains: [2, 1, 0, 2, 3, 1, 3, 4, 3, 3] },
  { name: "Lounge", category: "genre", gains: [-3, -1, 0, 1, 4, 3, 0, -1, 2, 1] },
  { name: "Lo-fi", category: "genre", gains: [3, 3, 2, 1, 0, -1, -2, -4, -6, -8] },
  { name: "Deep", category: "tone", gains: [5, 4, 2, 1, 3, 2, 1, -2, -4, -5] },
  { name: "Bass reducer", category: "tone", gains: [-6, -5, -4, -3, -1, 0, 0, 0, 0, 0] },
  { name: "Treble reducer", category: "tone", gains: [0, 0, 0, 0, 0, 0, -2, -4, -5, -6] },
  { name: "Podcast / spoken word", category: "place", gains: [-4, -2, 0, 1, 4, 5, 5, 4, 2, 0] },
  { name: "Small speakers", category: "place", gains: [6, 5, 4, 3, 1, 0, -1, -2, -3, -4] },
  { name: "Phone speaker", category: "place", gains: [-6, -4, 0, 3, 4, 4, 3, 2, 0, -2] },
  { name: "Car", category: "place", gains: [4, 3, 1, 0, -1, 0, 1, 2, 3, 3] },
  { name: "Headphones (V)", category: "place", gains: [4, 3, 1, 0, -1, -1, 0, 2, 3, 4] },
];

const ORDER: EqCategory[] = ["genre", "place", "tone"];

/** All presets: Flat first, then by category (genres, places, tone), A→Z. */
export const EQ_PRESETS: EqPreset[] = [
  { name: "Flat", category: "tone", gains: new Array(10).fill(0) },
  ...[...WINAMP.map(([name, category, s]) => ({ name, category, gains: fromWinamp(s) })), ...OWN].sort(
    (a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
  ),
];

/** The preset matching these gains (+ night mode), if any. */
export function findPreset(gains: number[], night: boolean): EqPreset | undefined {
  const key = JSON.stringify(gains);
  return EQ_PRESETS.find((p) => JSON.stringify(p.gains) === key && !!p.night === night);
}

/** A tiny curve preview for pickers, e.g. "▆▅▃▂▂▃▄▅▅▅". */
export function curve(gains: number[]): string {
  const bars = "▁▂▃▄▅▆▇█";
  return gains.map((g) => bars[Math.max(0, Math.min(7, Math.round(((g + 12) / 24) * 7)))]!).join("");
}
