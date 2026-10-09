// The mascot. Two halves:
//
//  • catLook(input) — PURE: decides how the cat looks right now (eyes, mouth,
//    ears, hat, held item, paws, tail, pose, speech bubble) from what's going
//    on: playback state, the beat/tempo, sound detection (genre → accessory,
//    mood → face, instruments → props), user actions (reactions), volume,
//    idle time, sleep timer, time of day and the date.
//  • <BigCat>/<MiniCat> — draw that look, cell by cell, in the chosen skin
//    (fur colours, or another animal).

import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.ts";
import type { SoundTag } from "../../sounds.ts";
import { CellRow, gradientAt, hslToHex, type Cell } from "./visuals.tsx";

export const CAT_W = 29;
export const CAT_H = 8;

// Pacing cat used as a loading spinner; constant width so nothing jitters.
export const CAT_WALK = ["ᓚᘏᗢ   ", " ᓚᘏᗢ  ", "  ᓚᘏᗢ ", "   ᓚᘏᗢ", "  ᓚᘏᗢ ", " ᓚᘏᗢ  "];

/** One-line mascot for the title row; while playing the notes grow with the bass. */
export function catMascot(playing: boolean, paused: boolean, beat: number): string {
  if (paused) return "ᓚᘏᗢ  zZ";
  if (!playing) return "ᓚᘏᗢ";
  const notes = (beat > 0.66 ? "♫♪♫" : beat > 0.33 ? "♪♫" : "♪").padEnd(3, " ");
  return `ᓚᘏᗢ ${notes}`;
}

// --- the look (pure) ------------------------------------------------------------

export type Reaction =
  | "wink"
  | "scared"
  | "meow"
  | "heart"
  | "nod"
  | "dizzy"
  | "sniff"
  | "lookLeft"
  | "lookRight"
  | "sing";

export const SKINS = ["classic", "tabby", "black", "calico", "siamese", "gradient", "dog", "bunny"] as const;
export type Skin = (typeof SKINS)[number];

export interface CatInput {
  mode: "play" | "pause" | "stop";
  loading: boolean;
  beat: number; // bass level 0..1
  frame: number; // UI tick counter (~11/s)
  now: number; // epoch ms
  ratio: number; // track progress 0..1
  reaction: Reaction | null;
  muted: boolean;
  volume: number; // 0..100
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  tags: SoundTag[]; // sound detection (empty if off)
  bpm: number | null;
  pausedForMs: number; // how long it's been paused (0 if not)
  idleMs: number; // time since the last key press
  sinceStartMs: number; // time since catunes opened
  sleepTimer: "off" | "on" | "soon"; // soon = under 2 minutes left
  skin: Skin;
  lang: "en" | "es" | "fr";
}

export type EyeKind =
  | "open"
  | "wide"
  | "closed"
  | "happy"
  | "shut"
  | "drowsy"
  | "heart"
  | "dizzy"
  | "led"
  | "tiny";
export type Hat =
  | "cap"
  | "beret"
  | "beanie"
  | "cowboy"
  | "santa"
  | "nightcap"
  | "witch"
  | "party"
  | "bow";

export interface CatLook {
  pose: "sit" | "sleep";
  left: EyeKind;
  right: EyeKind;
  pupil: string; // for "open" eyes: ● ◖ ◗ ✦ @
  mouth: "rest" | "sing" | "smile" | "sad" | "tight" | "yawn" | "omega";
  brows: boolean;
  blush: boolean;
  tear: boolean;
  ears: "up" | "dance" | "cover" | "flat" | "spiky" | "horns";
  hat: Hat | null;
  eyewear: "shades" | "monocle" | null;
  held: "guitar" | "maracas" | "baton" | null;
  paws: "rest" | "up" | "tapL" | "tapR" | "lick";
  headX: number; // head bob: -1, 0, 1
  tail: number; // tail animation frame
  beatPhase: number; // 0..1 within the current beat (prop animations)
  bubble: string;
  bubbleShort?: string; // for the mini cat, when bubble is too long
}

const GENRE_STYLE: Record<string, { hat?: Hat; eyewear?: "shades" | "monocle"; held?: CatLook["held"]; led?: boolean; horns?: boolean; bang?: boolean }> = {};
for (const g of ["rock", "punk", "grunge", "progressive rock", "rock and roll", "psychedelic rock", "indie"]) GENRE_STYLE[g] = { eyewear: "shades", bang: true };
GENRE_STYLE.metal = { horns: true, eyewear: "shades", bang: true };
GENRE_STYLE["hip hop"] = { hat: "cap" };
for (const g of ["electronic", "house", "techno", "dubstep", "drum and bass", "electronica", "EDM", "trance", "disco"]) GENRE_STYLE[g] = { led: true };
for (const g of ["jazz", "swing", "blues", "soul", "R&B", "funk", "gospel"]) GENRE_STYLE[g] = { hat: "beret" };
for (const g of ["classical", "opera", "soundtrack"]) GENRE_STYLE[g] = { eyewear: "monocle", held: "baton" };
for (const g of ["reggae", "ska", "afrobeat", "African"]) GENRE_STYLE[g] = { hat: "beanie" };
for (const g of ["Latin", "salsa", "flamenco"]) GENRE_STYLE[g] = { held: "maracas" };
for (const g of ["country", "bluegrass", "folk"]) GENRE_STYLE[g] = { hat: "cowboy" };
GENRE_STYLE.pop = { hat: "bow" };
GENRE_STYLE.Christmas = { hat: "santa" };

const GUITARS = new Set(["guitar", "electric guitar", "acoustic guitar", "slide guitar", "guitar tapping", "strummed guitar", "plucked strings", "bass"]);
const DRUMS = new Set(["drums", "snare", "kick drum", "cymbals", "hi-hat", "drum roll", "percussion", "drum machine", "timpani", "tabla"]);

/** Tiny deterministic hash → 0..1 (so "random" idle moves don't flicker per frame). */
function rand(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const BUBBLES: Record<string, [string, string, string]> = {
  meow: ["meow!", "¡miau!", "miaou !"],
  woof: ["woof!", "¡guau!", "ouaf !"],
  squeak: ["squeak!", "¡iiip!", "couic !"],
  noted: ["noted!", "¡anotado!", "noté !"],
  huh: ["huh?", "¿eh?", "hein ?"],
  sniff: ["sniff?", "¿snif?", "snif ?"],
  lala: ["♪ la la ♪", "♪ la la ♪", "♪ la la ♪"],
  hi: ["hi!", "¡hola!", "salut !"],
  morning: ["good morning!", "¡buenos días!", "bonjour !"],
  afternoon: ["good afternoon!", "¡buenas tardes!", "bon après-midi !"],
  evening: ["good evening!", "¡buenas noches!", "bonsoir !"],
  boo: ["boo!", "¡bu!", "bouh !"],
  pounce: ["!!", "¡¡!!", "!!"],
  lick: ["lick lick", "lamer…", "léchouille"],
  yawn: ["*yawn*", "*bostezo*", "*bâille*"],
  mute: ["🙀 mute", "🙀 mudo", "🙀 muet"],
};

export function catLook(i: CatInput): CatLook {
  const li = i.lang === "es" ? 1 : i.lang === "fr" ? 2 : 0;
  const b = (k: string) => BUBBLES[k]![li];
  const date = new Date(i.now);
  const hour = date.getHours();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const night = hour >= 22 || hour < 6;
  const cyc = (a: string[], every = 5) => a[Math.floor(i.frame / every) % a.length]!;

  const genre = i.tags.find((t) => t.kind === "genre")?.key;
  const mood = i.tags.find((t) => t.kind === "mood")?.key;
  const sources = i.tags.filter((t) => t.kind === "voice" || t.kind === "instrument").map((t) => t.key);
  const style = (genre && GENRE_STYLE[genre]) || {};

  const look: CatLook = {
    pose: "sit",
    left: "open",
    right: "open",
    pupil: "●",
    mouth: "rest",
    brows: false,
    blush: false,
    tear: false,
    ears: "up",
    hat: null,
    eyewear: null,
    held: null,
    paws: "rest",
    headX: 0,
    tail: Math.floor(i.frame / 6) % 4,
    beatPhase: 0,
    bubble: " ",
  };

  // Hats: genre first, then the date, then night-time.
  if (style.hat) look.hat = style.hat;
  else if (month === 12) look.hat = "santa";
  else if (month === 10 && day >= 25) look.hat = "witch";
  else if (month === 1 && day === 1) look.hat = "party";
  else if (night) look.hat = "nightcap";

  // --- asleep: long pause, or stopped and left alone -------------------------
  const asleep = (i.mode === "pause" && i.pausedForMs > 60_000) || (i.mode === "stop" && i.idleMs > 60_000);
  if (asleep) {
    look.pose = "sleep";
    look.left = look.right = "shut";
    look.tail = Math.floor(i.frame / 14) % 4;
    look.bubble = cyc(["  z  ", " z Z ", "z Z z"], 7);
    if (!style.hat && !look.hat) look.hat = "nightcap";
    return look;
  }

  // --- awake baseline -----------------------------------------------------------------
  const playing = i.mode === "play" && !i.loading;
  const strong = playing && i.beat > 0.45;
  // Tempo: with a detected BPM the cat dances on the real beat, else on bass hits.
  let onBeat = strong;
  let beatIdx = Math.floor(i.frame / 6);
  if (playing && i.bpm) {
    const phase = (i.now / 1000) * (i.bpm / 60);
    beatIdx = Math.floor(phase);
    look.beatPhase = phase - beatIdx;
    onBeat = look.beatPhase < 0.3;
    look.tail = Math.floor(phase * 2) % 4;
    look.headX = style.bang ? (onBeat ? 1 : 0) : [0, 1, 0, -1][Math.floor(phase) % 4]!;
  }
  const blink = i.frame % 28 < 2 || (night && i.frame % 28 < 4);
  const lookAround = Math.floor(i.frame / 7) % 4;
  look.pupil = i.beat > 0.5 ? "●" : lookAround === 1 ? "◗" : lookAround === 3 ? "◖" : "●";
  if (i.shuffle) look.pupil = "✦";
  if (i.repeat === "one") look.pupil = "@";

  if (i.mode === "pause") {
    look.left = look.right = "drowsy";
    look.bubble = cyc(["  z  ", " z Z ", "z Z z"]);
  } else if (blink) {
    look.left = look.right = "closed";
  } else if (onBeat && playing) {
    look.left = look.right = "wide";
  }
  if (playing) look.bubble = cyc(["  ♪  ", " ♪ ♫ ", " ♫ ♪ "]);
  if (i.loading) {
    look.pupil = cyc(["◖", "●", "◗", "●"], 3);
    look.bubble = cyc([" .  ", " .. ", " ..."], 3);
  }
  if (onBeat && playing) {
    look.ears = "dance";
    look.mouth = "sing";
  }

  // --- what's playing (sound detection) -------------------------------------
  if (style.eyewear) look.eyewear = style.eyewear;
  if (style.horns) look.ears = "horns";
  if (style.held) look.held = style.held;
  if (style.led && playing) look.left = look.right = "led";
  if (!look.held && sources.some((s) => GUITARS.has(s))) look.held = "guitar";
  if (playing && sources.some((s) => DRUMS.has(s))) look.paws = beatIdx % 2 ? "tapL" : "tapR";
  const singing = sources.some((s) => s !== "speech" && (s.includes("vocal") || s === "choir" || s === "rap"));
  if (playing && singing && i.frame % 8 < 4) look.mouth = "sing";
  if (playing && sources.includes("speech")) look.mouth = i.frame % 4 < 2 ? "omega" : "rest";

  if (mood === "happy") {
    look.mouth = onBeat ? "sing" : "smile";
    if (!onBeat && look.left === "open") look.left = look.right = "happy";
  } else if (mood === "sad") {
    look.mouth = "sad";
    look.tear = true;
  } else if (mood === "tender") {
    look.blush = true;
    look.mouth = "smile";
  } else if (mood === "angry") {
    look.brows = true;
    look.mouth = onBeat ? "sing" : "tight";
  } else if (mood === "scary") {
    look.ears = "spiky";
    if (look.left === "open") look.left = look.right = "tiny";
  } else if (mood === "exciting" && playing && i.frame % 6 < 3) {
    look.left = look.right = "wide";
  }
  if (genre === "metal" && playing && i.frame % 40 < 8) look.bubble = "\\m/";

  // --- volume ----------------------------------------------------------------------
  if (i.muted) {
    look.ears = "cover";
    look.bubble = b("mute");
  } else if (i.volume >= 90) {
    look.ears = "spiky";
  } else if (i.volume > 0 && i.volume <= 15) {
    look.ears = "flat";
    if (i.frame % 50 < 10) look.bubble = b("huh");
  }

  // --- sleep timer: drowsy, then yawning near the end ------------------------
  if (i.sleepTimer !== "off" && look.left === "open") look.left = look.right = i.frame % 20 < 6 ? "drowsy" : "open";
  if (i.sleepTimer === "soon" && i.frame % 60 < 12) {
    look.mouth = "yawn";
    look.left = look.right = "closed";
    look.bubble = b("yawn");
  }

  // --- end of the track: pounce on the aura's last dot ----------------------
  if (playing && i.ratio > 0.975) {
    look.paws = "up";
    look.left = look.right = "wide";
    look.bubble = b("pounce");
  }

  // --- idle: little things a cat does when nobody's pressing keys -----------
  if (i.idleMs > 15_000 && !i.reaction && i.mode !== "pause") {
    const slot = Math.floor(i.now / 8000);
    const intoSlot = i.now % 8000;
    const act = Math.floor(rand(slot) * 5);
    if (intoSlot < 2200) {
      if (act === 0) {
        look.paws = "lick";
        look.mouth = "omega";
        look.left = "closed";
        look.bubble = b("lick");
      } else if (act === 1) {
        look.mouth = "yawn";
        look.left = look.right = "closed";
        look.bubble = b("yawn");
      } else if (act === 2) {
        look.pupil = i.frame % 6 < 3 ? "◖" : "◗";
      } else if (act === 3) {
        look.tail = Math.floor(i.frame / 2) % 4;
      }
    }
  }

  // --- greeting when catunes opens ----------------------------------------------
  if (i.sinceStartMs < 4000) {
    look.bubble = b(hour < 12 && hour >= 6 ? "morning" : hour < 20 && hour >= 6 ? "afternoon" : "evening");
    look.bubbleShort = b("hi");
    if (i.sinceStartMs < 1600) {
      look.paws = "up"; // a big stretch
      look.left = look.right = "happy";
    }
  } else if (look.hat === "witch" && i.frame % 70 < 10) {
    look.bubble = b("boo");
  }

  // --- reactions to what you just did (short, win over everything) ----------
  const call = i.skin === "dog" ? "woof" : i.skin === "bunny" ? "squeak" : "meow";
  switch (i.reaction) {
    case "wink":
      look.right = "closed";
      break;
    case "scared":
      look.left = look.right = "wide";
      look.ears = "spiky";
      break;
    case "meow":
      look.bubble = b(call);
      break;
    case "heart":
      look.left = look.right = "heart";
      look.bubble = "♥";
      look.blush = true;
      break;
    case "nod":
      look.left = look.right = "happy";
      look.bubble = b("noted");
      break;
    case "dizzy":
      look.left = look.right = "dizzy";
      look.bubble = "?!";
      break;
    case "sniff":
      look.mouth = "omega";
      look.pupil = i.frame % 4 < 2 ? "◖" : "◗";
      look.left = look.right = "open";
      look.bubble = b("sniff");
      break;
    case "lookLeft":
      look.left = look.right = "open";
      look.pupil = "◖";
      break;
    case "lookRight":
      look.left = look.right = "open";
      look.pupil = "◗";
      break;
    case "sing":
      look.mouth = "sing";
      look.bubble = b("lala");
      break;
  }
  return look;
}

// --- skins -----------------------------------------------------------------------------

type Part = "fur" | "point" | "whisker" | "ground";

interface Palette {
  color: (part: Part, row: number, col: number) => string;
  eyeBg: string;
  pupil: string;
}

function palette(skin: Skin): Palette {
  const accent = theme().accent;
  switch (skin) {
    case "tabby":
      return {
        color: (p, r, c) => (p === "whisker" ? "#d8c8b0" : (r <= 1 || r >= 5) && c % 2 === 0 ? "#a8641e" : "#e39d4f"),
        eyeBg: "#c8e86a",
        pupil: "#1b1b1b",
      };
    case "black":
      return { color: (p) => (p === "whisker" ? "#b8b8c8" : "#6b6b7a"), eyeBg: "#ffd23c", pupil: "#1b1b1b" };
    case "calico":
      return {
        color: (p, _r, c) => (p === "whisker" ? "#d8d0c8" : c < 11 ? "#e8912d" : c > 17 ? "#8a7262" : "#f2efe8"),
        eyeBg: "#9be08a",
        pupil: "#1b1b1b",
      };
    case "siamese":
      return {
        color: (p) => (p === "point" ? "#7a5238" : p === "whisker" ? "#e8dcc8" : "#efe2c8"),
        eyeBg: "#7ec8ff",
        pupil: "#1b1b1b",
      };
    case "gradient":
      return { color: (_p, _r, c) => gradientAt(c / (CAT_W - 1)), eyeBg: "white", pupil: "#1b1b1b" };
    case "dog":
      return { color: (p) => (p === "point" ? "#7a5030" : p === "whisker" ? "#c8945a" : "#c8945a"), eyeBg: "white", pupil: "#3a2010" };
    case "bunny":
      return { color: (p) => (p === "point" ? "#ffb7c5" : "#e8e8f0"), eyeBg: "#ff6f8f", pupil: "#1b1b1b" };
    default:
      return { color: () => accent, eyeBg: "white", pupil: "#1b1b1b" };
  }
}

// --- drawing the big cat ------------------------------------------------------------

type Grid = Cell[][];

function blankRow(w = CAT_W): Cell[] {
  return Array.from({ length: w }, () => ({ ch: " " }));
}

/** Writes `str` at column `col`, styled by `style` (skipping spaces unless `solid`). */
function put(row: Cell[], col: number, str: string, style: Omit<Cell, "ch">, solid = false): void {
  const chars = [...str];
  for (let k = 0; k < chars.length; k++) {
    const c = col + k;
    if (c < 0 || c >= row.length) continue;
    if (chars[k] === " " && !solid) continue;
    row[c] = { ch: chars[k]!, ...style };
  }
}

const HATS: Record<Hat, { col: number; art: string; color: (k: number) => string }> = {
  cap: { col: 7, art: "▄█████████████▄▄▄▄▄▄", color: (k) => (k > 13 ? "#2b4fd8" : "#3a6ff7") },
  beret: { col: 8, art: "▄▄██████████▄▄▖", color: () => "#c0303a" },
  beanie: { col: 7, art: "▄▄███████████▄▄", color: (k) => (k < 5 ? "#e03030" : k < 10 ? "#f2d13c" : "#2fae4a") },
  cowboy: { col: 3, art: "▄▄▄▄▄▄█████████▄▄▄▄▄▄", color: () => "#a0682e" },
  santa: { col: 7, art: "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▀▀▀▀●", color: (k) => (k === 18 ? "#ffffff" : "#e02a2a") },
  nightcap: { col: 7, art: "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▀▀▀▀●", color: (k) => (k === 18 ? "#f2d13c" : "#4a5fd0") },
  witch: { col: 4, art: "▄▄▄▄▄▄▄▄▄█▲█▄▄▄▄▄▄▄▄▄", color: () => "#8a3fd0" },
  party: { col: 11, art: "▄▄▄▲▄▄▄", color: (k) => hslToHex((k * 50) % 360, 85, 60) },
  bow: { col: 13, art: "◀●▶", color: () => "#ff6fb5" },
};

const EARS: Record<CatLook["ears"], string> = {
  up: "▄▀▄",
  dance: "▀▄▀",
  cover: "╲█╱",
  flat: "▄▄▄",
  spiky: "╱▀╲",
  horns: "◢▀◣",
};
const MOUTHS: Record<CatLook["mouth"], string> = {
  rest: "▀▀▀▀▀",
  sing: "▄███▄",
  smile: "╰───╯",
  sad: "╭───╮",
  tight: "▄▄▄▄▄",
  yawn: "▐███▌",
  omega: " ‿ω‿ ",
};
const TAILS = ["╰─╮", "╰╮ ", "╰─╯", "╰╯ "];

function eyeCell(k: EyeKind, pupil: string, pal: Palette, fur: string, frame: number): Cell {
  switch (k) {
    case "closed":
      return { ch: "‿", fg: fur };
    case "happy":
      return { ch: "^", fg: fur };
    case "shut":
      return { ch: "─", fg: fur };
    case "drowsy":
      return { ch: "▀", fg: fur, bg: pal.eyeBg };
    case "heart":
      return { ch: "♥", fg: "#ff2d55", bg: pal.eyeBg };
    case "dizzy":
      return { ch: "×", fg: pal.pupil, bg: pal.eyeBg };
    case "led":
      return { ch: "■", fg: hslToHex((frame * 25) % 360, 100, 60), bg: "#101010" };
    case "tiny":
      return { ch: "·", fg: pal.pupil, bg: pal.eyeBg };
    case "wide":
      return { ch: "◉", fg: pal.pupil, bg: pal.eyeBg };
    default:
      return { ch: pupil, fg: pal.pupil, bg: pal.eyeBg };
  }
}

/** Builds the 29×8 grid for a look. */
export function catGrid(look: CatLook, skin: Skin, frame: number): Grid {
  const pal = palette(skin);
  const fur = (part: Part, r: number, c: number) => ({ fg: pal.color(part, r, c) });
  const grid: Grid = Array.from({ length: CAT_H }, () => blankRow());
  const sleep = look.pose === "sleep";
  const top = sleep ? 1 : 0; // the head sits one row lower when lying down
  const dog = skin === "dog";
  const bunny = skin === "bunny";

  const head: Cell[][] = Array.from({ length: 6 }, () => blankRow());
  // Row 0: ears (or a hat, or another animal's ears).
  if (dog) put(head[0]!, 9, "▄▄▄▄▄▄▄▄▄▄▄", fur("fur", 0, 14));
  else if (bunny) {
    put(head[0]!, 9, "▐█▌", fur("fur", 0, 9));
    put(head[0]!, 10, "█", fur("point", 0, 10));
    put(head[0]!, 17, "▐█▌", fur("fur", 0, 17));
    put(head[0]!, 18, "█", fur("point", 0, 18));
  } else {
    const ears = EARS[look.ears];
    put(head[0]!, 8, ears, fur("point", 0, 8));
    put(head[0]!, 18, ears, fur("point", 0, 18));
    if (look.ears === "spiky") put(head[0]!, 13, "▲▲▲", fur("point", 0, 13));
  }
  if (look.hat) {
    const h = HATS[look.hat];
    if (look.hat !== "bow") head[0] = blankRow(); // the hat covers the ears
    [...h.art].forEach((ch, k) => put(head[0]!, h.col + k, ch, { fg: h.color(k) }));
  }
  // Row 1: top of the head (+ floppy dog ears, angry brows).
  for (const [c, ch] of [...("       █   ▀▄▄▄▄▄▀   █")].entries()) if (ch !== " ") head[1]![c] = { ch, ...fur("fur", 1, c) };
  if (dog) {
    put(head[1]!, 4, "▄██", fur("point", 1, 4));
    put(head[1]!, 22, "██▄", fur("point", 1, 22));
  }
  if (look.brows) {
    put(head[1]!, 9, "╲", { fg: pal.color("point", 1, 9) });
    put(head[1]!, 19, "╱", { fg: pal.color("point", 1, 19) });
  }
  // Row 2: eyes (+ shades / monocle).
  put(head[2]!, 6, "█", fur("fur", 2, 6));
  put(head[2]!, 22, "█", fur("fur", 2, 22));
  const furEye = pal.color("fur", 2, 9);
  head[2]![9] = eyeCell(look.left, look.pupil, pal, furEye, frame);
  head[2]![19] = eyeCell(look.right, look.pupil, pal, furEye, frame + 3);
  if (dog) {
    put(head[2]!, 4, "██", fur("point", 2, 4));
    put(head[2]!, 23, "██", fur("point", 2, 23));
  }
  if (look.eyewear === "shades" && look.left !== "heart" && look.left !== "dizzy") {
    put(head[2]!, 8, "▄█▄", { fg: "#5a5a6e" });
    put(head[2]!, 11, "▀▀▀▀▀▀▀", { fg: "#9a9aae" });
    put(head[2]!, 18, "▄█▄", { fg: "#5a5a6e" });
    head[2]![9] = { ch: "█", fg: "#8a8aa8" }; // a glint on the left lens
  } else if (look.eyewear === "monocle") {
    put(head[2]!, 18, "(", { fg: "#e0b040" });
    put(head[2]!, 20, ")", { fg: "#e0b040" });
  }
  // Row 3: whiskers + nose (+ blush, tear, monocle chain).
  if (!dog) {
    put(head[3]!, 1, "───", fur("whisker", 3, 1));
    put(head[3]!, 25, "───", fur("whisker", 3, 25));
  }
  put(head[3]!, 6, "█", fur("fur", 3, 6));
  put(head[3]!, 22, "█", fur("fur", 3, 22));
  put(head[3]!, 14, dog ? "▼" : "▄", fur("point", 3, 14));
  if (look.blush) {
    put(head[3]!, 8, "░░", { fg: "#ff8fab" });
    put(head[3]!, 19, "░░", { fg: "#ff8fab" });
  }
  if (look.tear) put(head[3]!, 9, "╿", { fg: "#5ab0ff" });
  if (look.eyewear === "monocle") put(head[3]!, 21, "╯", { fg: "#e0b040" });
  // Row 4: mouth.
  if (!dog) {
    put(head[4]!, 1, "──", fur("whisker", 4, 1));
    put(head[4]!, 25, "──", fur("whisker", 4, 25));
  }
  put(head[4]!, 7, "█", fur("fur", 4, 7));
  put(head[4]!, 21, "█", fur("fur", 4, 21));
  let mouth = MOUTHS[look.mouth];
  if (bunny && look.mouth === "rest") mouth = " ▀█▀ ";
  put(head[4]!, 12, mouth, fur("point", 4, 12));
  if (dog && look.mouth === "sing") put(head[4]!, 14, "█", { fg: "#ff7a9a" }); // tongue
  // Row 5: chin.
  for (const [c, ch] of [...("        ▀▄▄▄▄▄▄▄▄▄▄▄▀")].entries()) if (ch !== " ") head[5]![c] = { ch, ...fur("fur", 5, c) };

  // Place the head (bobbing) into the grid.
  const shift = Math.max(-1, Math.min(1, look.headX));
  for (let r = 0; r < 6; r++) {
    const target = grid[r + top]!;
    for (let c = 0; c < CAT_W; c++) {
      const src = c - shift;
      if (src >= 0 && src < CAT_W) target[c] = head[r]![src]!;
    }
  }

  if (sleep) {
    // Chin resting on the table, paws tucked in front.
    const table = "▄▄▄▄▄▄▄▄▀▄▄▄▄▄▄▄▄▄▄▄▀▄▄▄▄▄▄▄▄";
    grid[6] = [...table].map((ch, c) => ({ ch, ...fur("ground", 6, c) }));
    grid[7] = blankRow();
    put(grid[7]!, 7, "▀▀▀▀", fur("point", 7, 7));
    put(grid[7]!, 18, "▀▀▀▀", fur("point", 7, 18));
    put(grid[7]!, 23, TAILS[look.tail % 4]!, fur("point", 7, 23));
    return grid;
  }

  // Row 6: arms + table, and whatever the cat is holding.
  const arms = "▄▄▄▄▄▄▄▄█   █   █   █▄▄▄▄▄▄▄▄";
  grid[6] = [...arms].map((ch, c) => ({ ch, ...fur(c >= 8 && c <= 20 ? "fur" : "ground", 6, c) }));
  if (look.held === "guitar") {
    put(grid[6]!, 9, "━━━━┿━━", { fg: "#c88a3a" });
    put(grid[6]!, 16, "(█)", { fg: "#e0a050" }); // the guitar's body
  } else if (look.held === "maracas") {
    const up = look.beatPhase < 0.5;
    put(grid[up ? 5 : 6]!, 6, "●", { fg: "#ff8a2a" });
    put(grid[up ? 6 : 5]!, 22, "●", { fg: "#2fd06a" });
  } else if (look.held === "baton") {
    put(grid[5]!, 22, ["╱", "─", "╲", "│"][Math.floor(look.beatPhase * 4) % 4]!, { fg: "#ffffff" });
  }
  // Row 7: paws + tail.
  const down = "▀▄▄▄▀";
  const up = "▄▀▀▀▄";
  const [pl, pr] =
    look.paws === "up" ? [up, up] : look.paws === "tapL" ? [up, down] : look.paws === "tapR" ? [down, up] : look.paws === "lick" ? [up, down] : [frame % 55 < 3 ? up : down, down];
  put(grid[7]!, 8, pl, fur("point", 7, 8));
  put(grid[7]!, 16, pr, fur("point", 7, 16));
  if (!bunny) put(grid[7]!, 23, TAILS[look.tail % 4]!, fur("point", 7, 23));
  else put(grid[7]!, 23, "●", fur("fur", 7, 23)); // a cotton tail
  return grid;
}

/** The big cat: bubble + 29×8 drawing inside a clockwise progress "aura". */
export function BigCat({ look, skin, frame, ratio }: { look: CatLook; skin: Skin; frame: number; ratio: number }) {
  const accent = theme().accent;
  const grid = catGrid(look, skin, frame);
  // Progress aura: perimeter cells lit clockwise from the top-left corner, in a
  // low→mid→high sweep (the theme's gradient).
  const total = 2 * CAT_W + 2 * CAT_H + 4;
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * total);
  const aura = (seq: number, on: string, off: string): Cell =>
    seq < filled ? { ch: on, fg: gradientAt(seq / total) } : { ch: off, fg: accent, dim: true };
  const rightSeq = (r: number) => CAT_W + 2 + r;
  const leftSeq = (r: number) => 2 * CAT_W + 4 + CAT_H + (CAT_H - 1 - r);
  const bottomSeq = (c: number) => CAT_W + 3 + CAT_H + (CAT_W - 1 - c);
  const topRow: Cell[] = [aura(0, "╭", "╭"), ...Array.from({ length: CAT_W }, (_, c) => aura(1 + c, "━", "─")), aura(CAT_W + 1, "╮", "╮")];
  const botRow: Cell[] = [
    aura(2 * CAT_W + 3 + CAT_H, "╰", "╰"),
    ...Array.from({ length: CAT_W }, (_, c) => aura(bottomSeq(c), "━", "─")),
    aura(CAT_W + 2 + CAT_H, "╯", "╯"),
  ];
  return (
    <Box flexDirection="column">
      <Box justifyContent="center">
        <Text color={accent} bold>
          {look.bubble}
        </Text>
      </Box>
      <CellRow cells={topRow} />
      {grid.map((row, r) => (
        <CellRow key={r} cells={[aura(leftSeq(r), "┃", "│"), ...row, aura(rightSeq(r), "┃", "│")]} />
      ))}
      <CellRow cells={botRow} />
    </Box>
  );
}

// --- the mini cat (compact layout) --------------------------------------------------

export const MINI_W = 13;

const MINI_HATS: Partial<Record<Hat, [number, string, string]>> = {
  cap: [2, "▄██████▄▄▄", "#3a6ff7"],
  beret: [3, "▄█████▖", "#c0303a"],
  beanie: [2, "▄▄▄▄▄▄▄▄▄", "#e03030"],
  cowboy: [1, "▄▄█████▄▄▄", "#a0682e"],
  santa: [2, "▄▄▄▄▄▄▄▀●", "#e02a2a"],
  nightcap: [2, "▄▄▄▄▄▄▄▀●", "#4a5fd0"],
  witch: [1, "▄▄▄▄▲▄▄▄▄▄", "#8a3fd0"],
  party: [5, "▲", "#ff6fb5"],
  bow: [5, "◀●▶", "#ff6fb5"],
};
const MINI_MOUTH: Record<CatLook["mouth"], string> = {
  rest: "▀▀▀",
  sing: "▄█▄",
  smile: "╰─╯",
  sad: "╭─╮",
  tight: "▄▄▄",
  yawn: "▐█▌",
  omega: "‿ω‿",
};

/** 13×4 cat (+ bubble) for narrow screens: same expressions, fewer cells. */
export function MiniCat({ look, skin, frame }: { look: CatLook; skin: Skin; frame: number }) {
  const pal = palette(skin);
  const fur = (p: Part, r: number, c: number) => ({ fg: pal.color(p, r, c * 2) });
  const rows = Array.from({ length: 4 }, () => blankRow(MINI_W));
  const x = 1 + Math.max(-1, Math.min(1, look.headX));
  if (look.pose === "sleep") {
    put(rows[1]!, x, " ▄▀▄   ▄▀▄ ", fur("point", 1, 1));
    put(rows[2]!, x, "█  ─   ─  █", fur("fur", 2, 1));
    put(rows[3]!, 0, "▄▄▀▄▄▄▄▄▄▄▀▄▄", fur("ground", 3, 1));
    return <MiniFrame rows={rows} bubble={look.bubbleShort ?? look.bubble} />;
  }
  if (skin === "bunny") put(rows[0]!, x, "  ▐▌     ▐▌ ", fur("fur", 0, 2));
  else if (skin === "dog") put(rows[0]!, x, " ▄▄▄▄▄▄▄▄▄ ", fur("fur", 0, 2));
  else put(rows[0]!, x, ` ${EARS[look.ears]}   ${EARS[look.ears]} `, fur("point", 0, 1));
  const hat = look.hat && MINI_HATS[look.hat];
  if (hat) {
    if (look.hat !== "bow") rows[0] = blankRow(MINI_W);
    put(rows[0]!, x + hat[0] - 1, hat[1], { fg: hat[2] });
  }
  put(rows[1]!, x, "█         █", fur("fur", 1, 1));
  rows[1]![x + 3] = eyeCell(look.left, look.pupil, pal, pal.color("fur", 1, 4), frame);
  rows[1]![x + 7] = eyeCell(look.right, look.pupil, pal, pal.color("fur", 1, 9), frame + 3);
  if (look.eyewear === "shades" && look.left !== "heart") put(rows[1]!, x + 2, "▄█▀▀▀▀▄█▄", { fg: "#6a6a7e" });
  put(rows[2]!, x, "█         █", fur("fur", 2, 1));
  put(rows[2]!, x + 4, MINI_MOUTH[look.mouth], fur("point", 2, 5));
  if (look.blush) {
    put(rows[2]!, x + 2, "░", { fg: "#ff8fab" });
    put(rows[2]!, x + 8, "░", { fg: "#ff8fab" });
  }
  if (look.tear) put(rows[2]!, x + 3, "╿", { fg: "#5ab0ff" });
  put(rows[3]!, x, " ▀▄▄▄▄▄▄▄▀ ", fur("fur", 3, 1));
  if (look.paws === "up" || look.paws === "tapL") put(rows[3]!, x, "▀", fur("point", 3, 0));
  if (look.paws === "up" || look.paws === "tapR") put(rows[3]!, x + 10, "▀", fur("point", 3, 10));
  return <MiniFrame rows={rows} bubble={look.bubbleShort ?? look.bubble} />;
}

function MiniFrame({ rows, bubble }: { rows: Cell[][]; bubble: string }) {
  const accent = theme().accent;
  return (
    <Box flexDirection="column" width={MINI_W}>
      <Box justifyContent="center">
        <Text color={accent} bold wrap="truncate">
          {bubble}
        </Text>
      </Box>
      {rows.map((r, i) => (
        <CellRow key={i} cells={r} />
      ))}
    </Box>
  );
}

/** Skin names for the picker. */
export const SKIN_NAMES: Record<Skin, [string, string, string]> = {
  classic: ["Classic (theme colour)", "Clásico (color del tema)", "Classique (couleur du thème)"],
  tabby: ["Tabby", "Atigrado", "Tigré"],
  black: ["Black cat", "Gato negro", "Chat noir"],
  calico: ["Calico", "Calicó", "Calico"],
  siamese: ["Siamese", "Siamés", "Siamois"],
  gradient: ["Rainbow (theme gradient)", "Arcoíris (degradado del tema)", "Arc-en-ciel (dégradé du thème)"],
  dog: ["Dog", "Perro", "Chien"],
  bunny: ["Bunny", "Conejo", "Lapin"],
};
