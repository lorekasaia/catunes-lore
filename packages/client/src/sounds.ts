// "What's in this song?" — sound detection (opt-in).
//
// Uses Google's YAMNet (an AudioSet classifier: 521 classes incl. voices,
// instruments, genres and moods) run with ONNX Runtime's WebAssembly build,
// so it needs no native binaries and also works on Termux. Both the model and
// the runtime are downloaded on demand (~30 MB) the first time the feature is
// turned on, checked against pinned SHA-256 hashes, and kept in
// ~/.config/catunes/models/yamnet/.
//
// The audio comes from the visualizer's analyzer (no extra network request).
// Inference runs in a separate process (`catunes __sounds-worker`) so the UI
// never stalls. Alongside, a cheap tempo estimate (BPM) runs in-process; it's
// also the fallback when the model can't run.

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { setPriority } from "node:os";
import { join } from "node:path";
import { MODELS_DIR } from "./config.ts";
import { getLocale } from "./i18n.ts";
import { isCompiledBinary } from "./update.ts";

export const SOUNDS_DIR = join(MODELS_DIR, "yamnet");

const ORT_VERSION = "1.30.0";
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;

/** Files to download, with the hashes they must match (we execute the runtime). */
export const SOUND_ASSETS = [
  {
    file: "yamnet.onnx",
    url: "https://huggingface.co/audiomagic/yamnet-onnx/resolve/main/yamnet.onnx",
    sha256: "d3835ffbbd4a1bb3e777f0ca217b5007907f5171dd5d17c4236b95b2af8f908e",
    size: 16093355,
  },
  {
    file: "ort.wasm.bundle.min.mjs",
    url: `${ORT_CDN}/ort.wasm.bundle.min.mjs`,
    sha256: "11e64bd8ffe11bd1a2a2f0d6275fdfbbba7262f0b76b99b53d228a8a22ef3d90",
    size: 73054,
  },
  {
    file: "ort-wasm-simd-threaded.wasm",
    url: `${ORT_CDN}/ort-wasm-simd-threaded.wasm`,
    sha256: "3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2",
    size: 14239897,
  },
];

/** True once every model/runtime file is on disk. */
export function soundModelsReady(): boolean {
  return SOUND_ASSETS.every((a) => existsSync(join(SOUNDS_DIR, a.file)));
}

/**
 * Downloads the model + runtime (skipping files already present), verifying
 * each SHA-256 before it's put in place. onProgress gets 0..1.
 */
export async function downloadSoundModels(onProgress: (ratio: number) => void): Promise<void> {
  mkdirSync(SOUNDS_DIR, { recursive: true });
  const total = SOUND_ASSETS.reduce((n, a) => n + a.size, 0);
  let done = 0;
  for (const a of SOUND_ASSETS) {
    const dest = join(SOUNDS_DIR, a.file);
    if (existsSync(dest)) {
      done += a.size;
      onProgress(done / total);
      continue;
    }
    const res = await fetch(a.url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok || !res.body) throw new Error(`${a.file}: HTTP ${res.status}`);
    const chunks: Buffer[] = [];
    let got = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
      got += chunk.length;
      onProgress((done + Math.min(got, a.size)) / total);
    }
    const data = Buffer.concat(chunks);
    const hash = createHash("sha256").update(data).digest("hex");
    if (hash !== a.sha256) throw new Error(`${a.file}: checksum mismatch`);
    writeFileSync(`${dest}.part`, data);
    renameSync(`${dest}.part`, dest);
    done += a.size;
    onProgress(done / total);
  }
}

/** Frees the ~30 MB again. */
export function removeSoundModels(): void {
  rmSync(SOUNDS_DIR, { recursive: true, force: true });
}

// --- labels -----------------------------------------------------------------
// AudioSet class index (YAMNet's class map) → [English, Spanish]. Classes are
// grouped so related ones collapse into one tag (the strongest member names it,
// e.g. "Guitar" vs "Electric guitar"); a group's score is its best member's.

type Kind = "voice" | "instrument" | "genre" | "mood";
interface Group {
  kind: Kind;
  emoji: string;
  members: Record<number, [string, string]>;
}

const GROUPS: Group[] = [
  {
    kind: "voice",
    emoji: "🎤",
    members: {
      24: ["vocals", "voz"],
      25: ["choir", "coro"],
      29: ["child vocals", "voz infantil"],
      30: ["auto-tuned vocals", "voz sintética"],
      31: ["rap", "rap"],
      26: ["yodeling", "yodel"],
      27: ["chant", "cántico"],
      32: ["humming", "tarareo"],
      249: ["vocals", "voz"],
      250: ["a cappella", "a capela"],
      213: ["beatboxing", "beatbox"],
    },
  },
  { kind: "voice", emoji: "🗣", members: { 0: ["speech", "voz hablada"], 3: ["narration", "narración"] } },
  { kind: "voice", emoji: "😗", members: { 35: ["whistling", "silbido"] } },
  {
    kind: "instrument",
    emoji: "🥁",
    members: {
      157: ["drums", "batería"],
      159: ["drums", "batería"],
      160: ["snare", "caja"],
      163: ["kick drum", "bombo"],
      166: ["cymbals", "platillos"],
      167: ["hi-hat", "charles"],
      162: ["drum roll", "redoble"],
      156: ["percussion", "percusión"],
      164: ["timpani", "timbales"],
      165: ["tabla", "tabla"],
      169: ["tambourine", "pandereta"],
      171: ["maracas", "maracas"],
    },
  },
  { kind: "instrument", emoji: "🤖", members: { 158: ["drum machine", "caja de ritmos"] } },
  {
    kind: "instrument",
    emoji: "🎸",
    members: {
      135: ["guitar", "guitarra"],
      136: ["electric guitar", "guitarra eléctrica"],
      138: ["acoustic guitar", "guitarra acústica"],
      139: ["slide guitar", "guitarra slide"],
      140: ["guitar tapping", "tapping de guitarra"],
      141: ["strummed guitar", "rasgueo"],
      134: ["plucked strings", "cuerda pulsada"],
    },
  },
  { kind: "instrument", emoji: "🎸", members: { 137: ["bass", "bajo"], 189: ["double bass", "contrabajo"] } },
  {
    kind: "instrument",
    emoji: "🪕",
    members: {
      142: ["banjo", "banjo"],
      143: ["sitar", "sitar"],
      144: ["mandolin", "mandolina"],
      145: ["zither", "cítara"],
      146: ["ukulele", "ukulele"],
    },
  },
  {
    kind: "instrument",
    emoji: "🎹",
    members: {
      148: ["piano", "piano"],
      149: ["electric piano", "piano eléctrico"],
      155: ["harpsichord", "clavecín"],
    },
  },
  {
    kind: "instrument",
    emoji: "🎹",
    members: { 150: ["organ", "órgano"], 151: ["electronic organ", "órgano electrónico"], 152: ["Hammond organ", "órgano Hammond"] },
  },
  // (154 "Sampler" left out on purpose: it fires on almost any modern mix.)
  { kind: "instrument", emoji: "🎛", members: { 153: ["synth", "sintetizador"] } },
  {
    kind: "instrument",
    emoji: "🎻",
    members: {
      184: ["strings", "cuerdas"],
      185: ["string section", "sección de cuerdas"],
      186: ["violin", "violín"],
      188: ["cello", "violonchelo"],
      187: ["pizzicato", "pizzicato"],
      179: ["orchestra", "orquesta"],
    },
  },
  { kind: "instrument", emoji: "🪉", members: { 194: ["harp", "arpa"] } },
  {
    kind: "instrument",
    emoji: "🎺",
    members: {
      180: ["brass", "metales"],
      182: ["trumpet", "trompeta"],
      183: ["trombone", "trombón"],
      181: ["French horn", "trompa"],
    },
  },
  { kind: "instrument", emoji: "🎷", members: { 192: ["saxophone", "saxofón"] } },
  {
    kind: "instrument",
    emoji: "🪈",
    members: {
      190: ["woodwinds", "vientos"],
      191: ["flute", "flauta"],
      193: ["clarinet", "clarinete"],
      205: ["bagpipes", "gaita"],
      206: ["didgeridoo", "didgeridoo"],
    },
  },
  { kind: "instrument", emoji: "🪗", members: { 204: ["accordion", "acordeón"], 203: ["harmonica", "armónica"] } },
  {
    kind: "instrument",
    emoji: "🔔",
    members: {
      174: ["mallets", "láminas"],
      175: ["marimba", "marimba"],
      176: ["glockenspiel", "glockenspiel"],
      177: ["vibraphone", "vibráfono"],
      178: ["steelpan", "steelpan"],
      173: ["tubular bells", "campanas tubulares"],
      195: ["bells", "campanas"],
      200: ["chimes", "carillón"],
    },
  },
  { kind: "instrument", emoji: "💿", members: { 210: ["DJ scratching", "scratch de DJ"] } },
  { kind: "instrument", emoji: "〰", members: { 208: ["theremin", "theremín"] } },
  { kind: "instrument", emoji: "👏", members: { 63: ["clapping", "palmas"], 64: ["applause", "aplausos"] } },
  {
    kind: "genre",
    emoji: "🏷",
    members: {
      211: ["pop", "pop"],
      212: ["hip hop", "hip hop"],
      214: ["rock", "rock"],
      215: ["metal", "metal"],
      216: ["punk", "punk"],
      217: ["grunge", "grunge"],
      218: ["progressive rock", "rock progresivo"],
      219: ["rock and roll", "rock and roll"],
      220: ["psychedelic rock", "rock psicodélico"],
      221: ["R&B", "R&B"],
      222: ["soul", "soul"],
      223: ["reggae", "reggae"],
      224: ["country", "country"],
      225: ["swing", "swing"],
      226: ["bluegrass", "bluegrass"],
      227: ["funk", "funk"],
      228: ["folk", "folk"],
      229: ["Middle Eastern", "árabe"],
      230: ["jazz", "jazz"],
      231: ["disco", "disco"],
      232: ["classical", "clásica"],
      233: ["opera", "ópera"],
      234: ["electronic", "electrónica"],
      235: ["house", "house"],
      236: ["techno", "techno"],
      237: ["dubstep", "dubstep"],
      238: ["drum and bass", "drum and bass"],
      239: ["electronica", "electrónica"],
      240: ["EDM", "EDM"],
      241: ["ambient", "ambient"],
      242: ["trance", "trance"],
      243: ["Latin", "latina"],
      244: ["salsa", "salsa"],
      245: ["flamenco", "flamenco"],
      246: ["blues", "blues"],
      247: ["children's", "infantil"],
      248: ["new age", "new age"],
      251: ["African", "africana"],
      252: ["afrobeat", "afrobeat"],
      253: ["Christian", "cristiana"],
      254: ["gospel", "gospel"],
      255: ["Asian", "asiática"],
      256: ["Carnatic", "carnática"],
      257: ["Bollywood", "Bollywood"],
      258: ["ska", "ska"],
      259: ["traditional", "tradicional"],
      260: ["indie", "indie"],
      265: ["soundtrack", "banda sonora"],
      267: ["video game music", "música de videojuego"],
      268: ["Christmas", "navideña"],
      266: ["lullaby", "canción de cuna"],
    },
  },
  {
    kind: "mood",
    emoji: "✨",
    members: {
      271: ["happy", "alegre"],
      272: ["sad", "triste"],
      273: ["tender", "tierna"],
      274: ["exciting", "emocionante"],
      275: ["angry", "intensa"],
      276: ["scary", "inquietante"],
    },
  },
];

// Display rules, calibrated on real songs. In a full-band mix YAMNet gives
// every individual voice/instrument a LOW absolute score (often 0.002–0.02:
// the probability mass goes to "Music" and the genre), but their ORDER is
// right — so sources are shown relative to the strongest one, while genre and
// mood (which score much higher) use absolute minimums.
// Voices and instruments are ranked separately (vocals usually outscore every
// instrument and would hide them all).
const SOURCE_FLOOR = 0.002;
const INSTRUMENT_RELATIVE = 0.5; // instruments ≥ 50% of the strongest instrument
const MAX_INSTRUMENTS = 3;
const MIN_GENRE = 0.03;
const MIN_MOOD = 0.02;
const MUSIC = 132;
const SPEECH = 0;

export interface SoundTag {
  kind: Kind;
  emoji: string;
  label: string;
  score: number;
}

/** Pure: turns YAMNet's 521 scores into the tags worth showing. */
export function tagsFromScores(scores: ArrayLike<number>, lang = getLocale()): SoundTag[] {
  const li = lang === "es" ? 1 : 0;
  const tags: SoundTag[] = [];
  for (const g of GROUPS) {
    let best = -1;
    let bestScore = 0;
    for (const k of Object.keys(g.members)) {
      const i = Number(k);
      const s = scores[i] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best < 0) continue;
    tags.push({ kind: g.kind, emoji: g.emoji, label: g.members[best]![li], score: bestScore });
  }
  // Nothing musical or spoken going on (silence, noise): show nothing.
  if ((scores[MUSIC] ?? 0) + (scores[SPEECH] ?? 0) < 0.2) return [];
  const byScore = (a: SoundTag, b: SoundTag) => b.score - a.score;
  const voice = tags.filter((t) => t.kind === "voice" && t.score >= SOURCE_FLOOR).sort(byScore).slice(0, 1);
  const inst = tags.filter((t) => t.kind === "instrument").sort(byScore);
  const top = inst[0]?.score ?? 0;
  const instruments = inst
    .filter((t) => t.score >= SOURCE_FLOOR && t.score >= top * INSTRUMENT_RELATIVE)
    .slice(0, MAX_INSTRUMENTS);
  const sources = [...voice, ...instruments];
  const genre = tags.filter((t) => t.kind === "genre" && t.score >= MIN_GENRE).sort(byScore).slice(0, 1);
  const mood = tags.filter((t) => t.kind === "mood" && t.score >= MIN_MOOD).sort(byScore).slice(0, 1);
  return [...sources, ...genre, ...mood];
}

// --- tempo (BPM) ---------------------------------------------------------------

const IN_RATE = 22050; // analyzer PCM rate
const MODEL_RATE = 16000;
const WINDOW = 53760; // 3.36 s at 16 kHz = 6 YAMNet frames
const HOP = 256; // onset hop at 22050 Hz ≈ 11.6 ms
const HOP_SEC = HOP / IN_RATE;
const ENV_LEN = Math.round(8 / HOP_SEC); // keep 8 s of onset envelope


/**
 * Pure: estimates the tempo from an onset-strength envelope (one value per
 * hop of `hopSec` seconds) by autocorrelation, with a mild preference for the
 * 90–150 BPM range so half/double-tempo errors are less likely. Returns null
 * when there's no clear beat (speech, ambient, silence).
 */
export function estimateBpm(env: ArrayLike<number>, hopSec: number): number | null {
  const r = tempoOf(env, hopSec);
  return r && r.confidence >= MIN_BEAT_CONFIDENCE ? r.bpm : null;
}

// How periodic the onsets must be (normalized autocorrelation, 0..1) to call
// it a beat. Calibrated on real songs: rock with drums ≈ 0.15–0.5 per 8 s
// window, a steady kick 0.7+, speech ≤ 0.11.
const MIN_BEAT_CONFIDENCE = 0.15;

/** Pure: best tempo candidate plus how periodic the signal is at it (0..1). */
export function tempoOf(env: ArrayLike<number>, hopSec: number): { bpm: number; confidence: number } | null {
  const n = env.length;
  const minLag = Math.max(2, Math.floor(60 / 200 / hopSec));
  const maxLag = Math.ceil(60 / 60 / hopSec);
  if (n < maxLag * 3) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i]!;
  mean /= n;
  const acf = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= Math.min(maxLag + 1, n - 1); lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += (env[i]! - mean) * (env[i - lag]! - mean);
    acf[lag] = s / (n - lag);
  }
  let var0 = 0;
  for (let i = 0; i < n; i++) var0 += (env[i]! - mean) ** 2;
  var0 /= n;
  if (var0 <= 0) return null;
  let best = -1;
  let bestW = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSec);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2);
    // A real beat period also correlates at twice the period: rewarding that
    // ("comb") is what keeps 90 vs 180 BPM from flip-flopping.
    const twice = 2 * lag <= maxLag + 1 ? acf[2 * lag]! : 0;
    const w = (acf[lag]! + 0.5 * Math.max(0, twice)) * prior;
    if (w > bestW) {
      bestW = w;
      best = lag;
    }
  }
  if (best < 0 || acf[best]! <= 0) return null;
  // Periodicity at the chosen lag, as a correlation coefficient. Using the
  // best neighbour too: a beat whose period falls between two hops splits its
  // peak across them.
  const confidence = Math.max(acf[best]!, (acf[best]! + Math.max(acf[best - 1]!, acf[best + 1]!)) / 1.5) / var0;
  // Parabolic interpolation around the peak for sub-hop precision.
  const a = acf[best - 1]!;
  const b = acf[best]!;
  const c = acf[best + 1]!;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return { bpm: Math.round(60 / ((best + shift) * hopSec)), confidence };
}

/**
 * Onset ("hit") strength, one value per ~11.6 ms hop of 22050 Hz audio. Looks
 * at the lows (kick, < ~150 Hz) and highs (snare/hats, > ~4 kHz) separately:
 * in a loud, compressed mix the overall energy barely moves between beats,
 * but those bands still jump on every hit.
 */
export class OnsetTracker {
  private lp = 0; // low band (one-pole low-pass)
  private lpHi = 0; // for the high band: x minus a 4 kHz low-pass
  private eLow = 0;
  private eHigh = 0;
  private count = 0;
  private prevLow = 0;
  private prevHigh = 0;
  private static aLow = 1 - Math.exp((-2 * Math.PI * 150) / IN_RATE);
  private static aHigh = 1 - Math.exp((-2 * Math.PI * 4000) / IN_RATE);

  /** Feeds one sample; returns the onset value when a hop completes, else null. */
  push(x: number): number | null {
    this.lp += OnsetTracker.aLow * (x - this.lp);
    this.lpHi += OnsetTracker.aHigh * (x - this.lpHi);
    const hi = x - this.lpHi;
    this.eLow += this.lp * this.lp;
    this.eHigh += hi * hi;
    if (++this.count < HOP) return null;
    const low = Math.log10(this.eLow / HOP + 1e-10);
    const high = Math.log10(this.eHigh / HOP + 1e-10);
    const onset = Math.max(0, low - this.prevLow) + Math.max(0, high - this.prevHigh);
    this.prevLow = low;
    this.prevHigh = high;
    this.count = 0;
    this.eLow = 0;
    this.eHigh = 0;
    return onset;
  }
}

/** Pure: onset envelope of mono PCM at 22050 Hz (see OnsetTracker). */
export function onsetEnvelope(pcm: Float32Array): Float32Array {
  const t = new OnsetTracker();
  const out: number[] = [];
  for (let i = 0; i < pcm.length; i++) {
    const v = t.push(pcm[i]!);
    if (v !== null) out.push(v);
  }
  return Float32Array.from(out);
}

/**
 * Pure: steadies a stream of BPM estimates. A new estimate at ~2x or ~0.5x
 * the current one is read in the current octave (tempo detectors love to
 * flip octaves), then the median of the last few is shown.
 */
export function steadyBpm(history: number[], next: number | null): number | null {
  if (next === null) return history.length ? Math.round(median(history)) : null;
  const cur = history.length ? median(history) : null;
  let v = next;
  if (cur) {
    if (Math.abs(v / 2 - cur) / cur < 0.08) v = v / 2;
    else if (Math.abs(v * 2 - cur) / cur < 0.08) v = v * 2;
  }
  history.push(v);
  if (history.length > 5) history.shift();
  return Math.round(median(history));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// --- the tagger ---------------------------------------------------------------

/** Linear resampler that keeps its phase across chunks. */
export class Resampler {
  private pos = 0; // fractional read position into the stream (input samples)
  private last = 0;
  constructor(private ratio = IN_RATE / MODEL_RATE) {}
  push(input: Float32Array): Float32Array {
    const out: number[] = [];
    // Positions are relative to the start of `input`; -1 means the previous chunk's last sample.
    while (this.pos < input.length - 1) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const a = i < 0 ? this.last : input[i]!;
      const b = input[i + 1]!;
      out.push(a + (b - a) * f);
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    this.last = input[input.length - 1] ?? 0;
    return Float32Array.from(out);
  }
}

/**
 * Collects the analyzer's PCM, periodically asks the worker for YAMNet scores
 * and estimates BPM, and emits "tags" (SoundTag[]) and "bpm" (number | null).
 * Emits "error" once if the model can't run (BPM keeps working).
 */
export class SoundTagger extends EventEmitter {
  private wave = new Float32Array(WINDOW); // ring of the last 3.36 s at 16 kHz
  private waveFill = 0;
  private resampler = new Resampler();
  private envBuf = new Float32Array(ENV_LEN);
  private envFill = 0;
  private onsets = new OnsetTracker();
  private fresh = 0; // 16 kHz samples received since the last inference
  private smoothed: Float32Array | null = null;
  private worker: ChildProcess | null = null;
  private workerBuf = "";
  private busy = false;
  private timer: NodeJS.Timeout | null = null;
  private failed = false;
  private mlEnabled = true;
  private bpmHistory: number[] = [];

  constructor(
    private isPlaying: () => boolean,
    private intervalMs = process.env.PREFIX?.includes("com.termux") ? 8000 : 4000,
  ) {
    super();
  }

  /** Starts periodic analysis. `withModel` false = BPM only. */
  start(withModel: boolean): void {
    this.mlEnabled = withModel && soundModelsReady();
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.worker?.kill();
    this.worker = null;
    this.busy = false;
    this.reset();
  }

  /** New track: forget everything about the previous one. */
  reset(): void {
    this.waveFill = 0;
    this.fresh = 0;
    this.envFill = 0;
    this.onsets = new OnsetTracker();
    this.smoothed = null;
    this.bpmHistory = [];
    this.resampler = new Resampler();
    this.emit("tags", []);
    this.emit("bpm", null);
  }

  /** Feed one analyzer frame (int16 mono at 22050 Hz). */
  push(frame: Buffer): void {
    if (!this.timer) return;
    const n = frame.length >> 1;
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = frame.readInt16LE(i * 2) / 32768;
      f[i] = v;
      const onset = this.onsets.push(v);
      if (onset !== null) {
        this.envBuf.copyWithin(0, 1);
        this.envBuf[ENV_LEN - 1] = onset;
        if (this.envFill < ENV_LEN) this.envFill++;
      }
    }
    if (!this.mlEnabled) return;
    const r = this.resampler.push(f);
    if (r.length >= WINDOW) {
      this.wave.set(r.subarray(r.length - WINDOW));
    } else {
      this.wave.copyWithin(0, r.length);
      this.wave.set(r, WINDOW - r.length);
    }
    this.waveFill = Math.min(WINDOW, this.waveFill + r.length);
    this.fresh += r.length;
  }

  private tick(): void {
    if (!this.isPlaying()) return;
    if (this.envFill >= ENV_LEN / 2) {
      const raw = estimateBpm(this.envBuf.subarray(ENV_LEN - this.envFill), HOP_SEC);
      this.emit("bpm", steadyBpm(this.bpmHistory, raw));
    }
    if (this.mlEnabled && !this.failed && !this.busy && this.waveFill >= WINDOW && this.fresh >= MODEL_RATE) {
      this.fresh = 0;
      this.infer(this.wave.slice());
    }
  }

  private ensureWorker(): ChildProcess | null {
    if (this.worker) return this.worker;
    // Same program, hidden command: works for node + dist/cli.js, bun + src,
    // and a `bun build --compile` binary alike.
    const args = isCompiledBinary()
      ? ["__sounds-worker", SOUNDS_DIR]
      : [...process.execArgv, process.argv[1]!, "__sounds-worker", SOUNDS_DIR];
    const w = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "ignore"] });
    try {
      setPriority(w.pid!, 10); // nicer: playback and UI come first
    } catch {
      // not allowed / not supported: fine
    }
    w.on("error", () => this.fail());
    w.on("exit", () => {
      if (this.worker === w) {
        this.worker = null;
        if (this.busy) this.fail();
      }
    });
    w.stdin?.on("error", () => {});
    w.stdout?.on("data", (d: Buffer) => this.onWorkerData(d.toString("utf8")));
    this.worker = w;
    return w;
  }

  private infer(wave: Float32Array): void {
    const w = this.ensureWorker();
    if (!w?.stdin) return;
    this.busy = true;
    const header = Buffer.alloc(4);
    header.writeUInt32LE(wave.byteLength, 0);
    w.stdin.write(Buffer.concat([header, Buffer.from(wave.buffer, wave.byteOffset, wave.byteLength)]));
  }

  private onWorkerData(chunk: string): void {
    this.workerBuf += chunk;
    let nl: number;
    while ((nl = this.workerBuf.indexOf("\n")) >= 0) {
      const line = this.workerBuf.slice(0, nl).trim();
      this.workerBuf = this.workerBuf.slice(nl + 1);
      if (!line) continue;
      let msg: { scores?: number[]; error?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      this.busy = false;
      if (msg.error || !msg.scores) {
        this.fail();
        continue;
      }
      // Smooth across runs so tags don't flicker every few seconds.
      const s = Float32Array.from(msg.scores);
      if (!this.smoothed) this.smoothed = s;
      else for (let i = 0; i < s.length; i++) this.smoothed[i] = this.smoothed[i]! * 0.5 + s[i]! * 0.5;
      this.emit("tags", tagsFromScores(this.smoothed));
    }
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.busy = false;
    this.worker?.kill();
    this.worker = null;
    this.emit("error");
  }
}
