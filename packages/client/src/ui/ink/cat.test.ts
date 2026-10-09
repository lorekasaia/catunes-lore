import { test, expect } from "bun:test";
import { catLook, catGrid, type CatInput } from "./cat.tsx";
import type { SoundTag } from "../../sounds.ts";

// A Tuesday afternoon in March: no holiday hat, no night cap.
const AFTERNOON = new Date(2026, 2, 10, 15, 0, 0).getTime();

const base = (over: Partial<CatInput> = {}): CatInput => ({
  mode: "play",
  loading: false,
  beat: 0.1,
  frame: 10,
  now: AFTERNOON,
  ratio: 0.4,
  reaction: null,
  muted: false,
  volume: 60,
  shuffle: false,
  repeat: "all",
  tags: [],
  bpm: null,
  pausedForMs: 0,
  idleMs: 1000,
  sinceStartMs: 60_000,
  sleepTimer: "off",
  skin: "classic",
  lang: "es",
  ...over,
});
const tag = (kind: SoundTag["kind"], key: string): SoundTag => ({ kind, key, emoji: "", label: key, score: 0.1 });

test("genre → accessory", () => {
  expect(catLook(base({ tags: [tag("genre", "rock")] })).eyewear).toBe("shades");
  expect(catLook(base({ tags: [tag("genre", "metal")] })).ears).toBe("horns");
  expect(catLook(base({ tags: [tag("genre", "hip hop")] })).hat).toBe("cap");
  expect(catLook(base({ tags: [tag("genre", "jazz")] })).hat).toBe("beret");
  expect(catLook(base({ tags: [tag("genre", "reggae")] })).hat).toBe("beanie");
  expect(catLook(base({ tags: [tag("genre", "country")] })).hat).toBe("cowboy");
  const classical = catLook(base({ tags: [tag("genre", "classical")] }));
  expect([classical.eyewear, classical.held]).toEqual(["monocle", "baton"]);
  expect(catLook(base({ tags: [tag("genre", "salsa")] })).held).toBe("maracas");
  expect(catLook(base({ tags: [tag("genre", "techno")] })).left).toBe("led");
});

test("mood → face", () => {
  expect(catLook(base({ tags: [tag("mood", "sad")] }))).toMatchObject({ mouth: "sad", tear: true });
  expect(catLook(base({ tags: [tag("mood", "tender")] }))).toMatchObject({ blush: true, mouth: "smile" });
  expect(catLook(base({ tags: [tag("mood", "angry")] })).brows).toBe(true);
});

test("instruments → props", () => {
  expect(catLook(base({ tags: [tag("instrument", "electric guitar")] })).held).toBe("guitar");
  expect(["tapL", "tapR"]).toContain(catLook(base({ tags: [tag("instrument", "drums")] })).paws);
});

test("dances on the detected BPM: the head bobs over time", () => {
  const xs = new Set([0, 250, 500, 750, 1000, 1250].map((dt) => catLook(base({ bpm: 120, now: AFTERNOON + dt })).headX));
  expect(xs.size).toBeGreaterThan(1);
});

test("falls asleep after a long pause, wakes up when playing", () => {
  expect(catLook(base({ mode: "pause", pausedForMs: 90_000 })).pose).toBe("sleep");
  expect(catLook(base({ mode: "pause", pausedForMs: 5_000 })).pose).toBe("sit");
});

test("the date and the hour pick a hat (a genre hat wins)", () => {
  const xmas = new Date(2026, 11, 20, 15).getTime();
  expect(catLook(base({ now: xmas })).hat).toBe("santa");
  expect(catLook(base({ now: xmas, tags: [tag("genre", "hip hop")] })).hat).toBe("cap");
  expect(catLook(base({ now: new Date(2026, 9, 31, 15).getTime() })).hat).toBe("witch");
  expect(catLook(base({ now: new Date(2026, 2, 10, 23).getTime() })).hat).toBe("nightcap");
  expect(catLook(base()).hat).toBeNull();
});

test("reactions and volume", () => {
  expect(catLook(base({ reaction: "heart" })).left).toBe("heart");
  expect(catLook(base({ reaction: "dizzy" })).bubble).toBe("?!");
  expect(catLook(base({ reaction: "meow", skin: "dog" })).bubble).toBe("¡guau!");
  expect(catLook(base({ muted: true, volume: 0 })).ears).toBe("cover");
  expect(catLook(base({ volume: 95 })).ears).toBe("spiky");
  expect(catLook(base({ ratio: 0.99 })).paws).toBe("up"); // pounce on the last dot
});

test("greets when catunes opens", () => {
  expect(catLook(base({ sinceStartMs: 1000 })).bubble).toBe("¡buenas tardes!");
});

test("every skin draws a full 29×8 grid", () => {
  for (const skin of ["classic", "tabby", "black", "calico", "siamese", "gradient", "dog", "bunny"] as const) {
    const g = catGrid(catLook(base({ skin })), skin, 0);
    expect(g.length).toBe(8);
    for (const row of g) expect(row.length).toBe(29);
  }
});
