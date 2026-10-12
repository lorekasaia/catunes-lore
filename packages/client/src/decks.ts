// Two-deck player for DJ-style transitions.
//
// DeckPlayer looks like a single Player to the UI (same methods, same
// "state" / "ended" / "resolved" events, always about the ACTIVE deck), but
// owns two mpv instances. While a track plays on one deck, the next one can be
// loaded paused and silent on the other (prepare); when the transition starts
// (mixTo), the incoming deck becomes the active one immediately — the UI shows
// the new track — and the outgoing deck keeps playing as the "tail" through
// the chosen effect until it's stopped.
//
// Deck B is only started the first time it's needed.

import { EventEmitter } from "node:events";
import { Player, type PlayerState, type ResolvedTrack } from "./player.ts";

export const TRANSITIONS = ["off", "crossfade", "filter", "echo", "brake", "cut", "random"] as const;
export type Transition = (typeof TRANSITIONS)[number];
type Style = Exclude<Transition, "off" | "random">;
const STYLES: Style[] = ["crossfade", "filter", "echo", "brake", "cut"];

export interface MixOptions {
  style: Transition;
  seconds: number; // length of the blend
  volume: number; // the user's volume (0..100)
  bpmOut?: number | null; // tempo of the track that's ending
  bpmIn?: number | null; // tempo of the incoming track (if known)
  matchTempo: boolean;
}

type LoadOpts = { source?: string; title?: string };

/**
 * Pure: playback speed for the incoming track so its tempo matches the
 * outgoing one, folding half/double tempo; null when the gap is too big to
 * sound natural (more than ±8%) or a tempo is unknown.
 */
export function tempoRatio(bpmOut?: number | null, bpmIn?: number | null): number | null {
  if (!bpmOut || !bpmIn) return null;
  let r = bpmOut / bpmIn;
  while (r > 1.5) r /= 2;
  while (r < 0.67) r *= 2;
  if (Math.abs(r - 1) < 0.005 || Math.abs(r - 1) > 0.08) return null;
  return r;
}

/** Pure: equal-power fade curves for a blend at progress t (0..1). */
export function equalPower(t: number): { out: number; in: number } {
  const x = Math.max(0, Math.min(1, t));
  return { out: Math.cos((x * Math.PI) / 2), in: Math.sin((x * Math.PI) / 2) };
}

export class DeckPlayer extends EventEmitter {
  private decks: Player[] = [];
  private active!: Player;
  private tail: Player | null = null;
  private prepared: { url: string; deck: Player } | null = null;
  private resolvedBy = new Map<Player, ResolvedTrack>();
  private timer: NodeJS.Timeout | null = null;
  private eq: { gains: number[]; night: boolean } = { gains: [], night: false };
  /** True while a transition is running (the UI's own fades back off). */
  mixing = false;

  constructor(
    private mpvBin = "mpv",
    private initialVolume = 100,
  ) {
    super();
  }

  get state(): PlayerState {
    return this.active.state;
  }

  async start(): Promise<void> {
    this.active = await this.spawnDeck("a");
  }

  private async spawnDeck(name: string): Promise<Player> {
    const p = new Player(this.mpvBin, this.initialVolume, name);
    await p.start();
    if (this.eq.gains.length) p.setEqualizer(this.eq.gains, this.eq.night);
    p.on("state", (s: PlayerState) => {
      if (p === this.active) this.emit("state", s);
    });
    p.on("ended", (reason: string, err?: string) => {
      if (p === this.active) this.emit("ended", reason, err);
    });
    p.on("resolved", (r: ResolvedTrack) => {
      this.resolvedBy.set(p, r);
      if (p === this.active) this.emit("resolved", r);
    });
    p.on("exit", () => {
      if (p === this.active) this.emit("exit");
    });
    this.decks.push(p);
    return p;
  }

  /** The deck that isn't active (started on first use). */
  private async idleDeck(): Promise<Player> {
    const other = this.decks.find((d) => d !== this.active);
    if (other) return other;
    return this.spawnDeck("b");
  }

  /** Loads the next track paused + silent on the idle deck, ready to mix in. */
  async prepare(url: string, opts: LoadOpts = {}): Promise<void> {
    if (this.prepared?.url === url) return;
    this.finishMix(); // the idle deck must be free
    const deck = await this.idleDeck();
    this.resolvedBy.delete(deck);
    deck.loadPaused(url, opts);
    this.prepared = { url, deck };
  }

  isPrepared(url: string): boolean {
    return this.prepared?.url === url;
  }

  /**
   * Plain load (cancels any transition in progress). If that track is already
   * prepared on the other deck, switch to it: it starts instantly.
   */
  load(url: string, opts: LoadOpts = {}): void {
    this.finishMix();
    if (this.prepared?.url === url) {
      const inc = this.prepared.deck;
      const old = this.active;
      this.prepared = null;
      this.active = inc;
      inc.setFx(null);
      inc.setSpeed(1);
      inc.setVolume(old.state.volume);
      inc.setPause(false);
      old.stop();
      this.emit("state", inc.state);
      const known = this.resolvedBy.get(inc);
      if (known && known.url === url) this.emit("resolved", known);
      return;
    }
    this.prepared = null;
    this.active.setFx(null);
    this.active.setSpeed(1);
    this.active.load(url, opts);
  }

  /**
   * Starts a DJ transition into `url`: it becomes the active track right away
   * and the previous one fades out through the chosen effect.
   */
  async mixTo(url: string, opts: LoadOpts, mix: MixOptions): Promise<void> {
    this.finishMix();
    const style: Style =
      mix.style === "random" ? STYLES[Math.floor(Math.random() * STYLES.length)]! : (mix.style as Style);
    const out = this.active;
    let inc: Player;
    if (this.prepared?.url === url) {
      inc = this.prepared.deck;
    } else {
      inc = await this.idleDeck();
      this.resolvedBy.delete(inc);
      inc.loadPaused(url, opts);
    }
    this.prepared = null;
    this.active = inc;
    this.tail = out;
    this.mixing = true;
    inc.setFx(null);
    const ratio = mix.matchTempo ? tempoRatio(mix.bpmOut, mix.bpmIn) : null;
    inc.setSpeed(ratio ?? 1);
    // The UI now follows the incoming deck: hand it what we already know.
    this.emit("state", inc.state);
    const known = this.resolvedBy.get(inc);
    if (known && known.url === url) this.emit("resolved", known);

    const vol = mix.volume;
    const total = Math.max(0.5, mix.seconds) * 1000;
    const brakeMs = Math.min(1600, total);
    const t0 = Date.now();
    let incStarted = style !== "brake"; // brake: the new track drops in after the stop
    if (style === "cut") {
      inc.setVolume(vol);
      inc.setPause(false);
      out.stop();
    } else if (style === "brake") {
      out.setSpeed(1, false); // let the pitch fall with the speed
    } else {
      inc.setVolume(0);
      inc.setPause(false);
      if (style === "filter") {
        out.setFx("highpass@hp=f=20");
        inc.setFx("highpass@hp=f=400");
      } else if (style === "echo") {
        out.setFx("aecho@echo=0.8:0.75:375|750:0.45|0.3");
      }
    }

    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / total);
      if (style === "crossfade") {
        const g = equalPower(t);
        out.setVolume(vol * g.out);
        inc.setVolume(vol * g.in);
      } else if (style === "filter") {
        // Bass swap: the outgoing track loses its lows (sweeping up), the
        // incoming one gets them back (sweeping down), then volumes cross.
        out.fxCommand("highpass@hp", "f", Math.round(20 * Math.pow(60, t)));
        inc.fxCommand("highpass@hp", "f", Math.round(400 * Math.pow(20 / 400, t)));
        const g = equalPower(Math.max(0, (t - 0.3) / 0.7));
        out.setVolume(vol * g.out);
        inc.setVolume(vol * Math.min(1, t / 0.4));
      } else if (style === "echo") {
        // The outgoing track drops out fast and rings on in echoes.
        out.setVolume(vol * Math.max(0, 1 - t / 0.25));
        inc.setVolume(vol * equalPower(t).in);
      } else if (style === "brake") {
        const b = Math.min(1, (Date.now() - t0) / brakeMs);
        out.setSpeed(Math.max(0.05, 1 - b), false);
        if (b >= 1 && !incStarted) {
          incStarted = true;
          out.stop();
          inc.setVolume(vol);
          inc.setPause(false);
        }
      }
      if (t >= 1 && incStarted) this.finishMix(ratio);
    };
    if (style === "cut") this.finishMix(ratio);
    else this.timer = setInterval(step, 50);
  }

  /** Ends a transition now: stops the tail, clears effects, eases tempo back. */
  private finishMix(ratio: number | null = null): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const tail = this.tail;
    if (tail) {
      tail.stop();
      tail.setFx(null);
      tail.setSpeed(1);
    }
    this.tail = null;
    const active = this.active;
    if (active) active.setFx(null);
    if (this.mixing && ratio && active) {
      // Ease the matched tempo back to the track's own over ~8 s.
      const t0 = Date.now();
      const ease = setInterval(() => {
        const t = Math.min(1, (Date.now() - t0) / 8000);
        if (this.active !== active) return clearInterval(ease);
        active.setSpeed(ratio + (1 - ratio) * t);
        if (t >= 1) clearInterval(ease);
      }, 200);
    }
    this.mixing = false;
  }

  // --- the single-player interface, routed to the active deck ---------------
  togglePause(): void {
    this.setPause(!this.active.state.paused);
  }
  setPause(paused: boolean): void {
    this.active.setPause(paused);
    this.tail?.setPause(paused);
  }
  seek(seconds: number): void {
    this.active.seek(seconds);
  }
  seekTo(seconds: number): void {
    this.active.seekTo(seconds);
  }
  setVolume(volume: number): void {
    this.active.setVolume(volume);
  }
  setEqualizer(gains: number[], night = false): void {
    this.eq = { gains, night };
    for (const d of this.decks) d.setEqualizer(gains, night);
  }
  stop(): void {
    this.finishMix();
    this.prepared = null;
    for (const d of this.decks) if (d !== this.active && d.state.url) d.stop();
    this.active.stop();
  }
  quit(): void {
    if (this.timer) clearInterval(this.timer);
    for (const d of this.decks) d.quit();
  }
}
