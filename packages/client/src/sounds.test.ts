import { test, expect } from "bun:test";
import { tagsFromScores, estimateBpm, steadyBpm, onsetEnvelope, Resampler } from "./sounds.ts";

const scores = (set: Record<number, number>) => {
  const s = new Array(521).fill(0);
  for (const [i, v] of Object.entries(set)) s[Number(i)] = v;
  return s;
};

test("tagsFromScores: voice, instruments ranked among themselves, genre, mood", () => {
  // Like a real full-band rock mix: tiny absolute instrument scores.
  const tags = tagsFromScores(
    scores({ 132: 0.9, 24: 0.012, 136: 0.006, 157: 0.004, 148: 0.001, 214: 0.3, 274: 0.05 }),
    "es",
  );
  expect(tags.map((t) => t.label)).toEqual(["voz", "guitarra eléctrica", "batería", "rock", "emocionante"]);
});

test("tagsFromScores: a group is named by its strongest member", () => {
  const tags = tagsFromScores(scores({ 132: 0.9, 135: 0.02, 138: 0.05 }), "en");
  expect(tags.map((t) => t.label)).toEqual(["acoustic guitar"]);
});

test("tagsFromScores: nothing for silence/noise", () => {
  expect(tagsFromScores(scores({ 494: 0.9, 136: 0.05 }))).toEqual([]);
});

test("estimateBpm finds a steady 128 BPM kick", () => {
  const sr = 22050;
  const pcm = new Float32Array(sr * 8);
  const beat = 60 / 128;
  for (let i = 0; i < pcm.length; i++) {
    const t = (i / sr) % beat;
    pcm[i] = t < 0.12 ? Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 30) * 0.8 : 0;
  }
  expect(estimateBpm(onsetEnvelope(pcm), 256 / sr)).toBe(128);
});

test("estimateBpm says nothing for beatless noise", () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const pcm = Float32Array.from({ length: 22050 * 8 }, () => rnd() * 0.3);
  expect(estimateBpm(onsetEnvelope(pcm), 256 / 22050)).toBeNull();
});

test("steadyBpm folds octave flips and takes the median", () => {
  const h: number[] = [];
  expect(steadyBpm(h, 90)).toBe(90);
  expect(steadyBpm(h, 180)).toBe(90); // double-tempo read as 90
  expect(steadyBpm(h, 91)).toBe(90);
  expect(steadyBpm(h, null)).toBe(90); // no estimate: keep showing the last
});

test("Resampler 22050→16000 keeps length and phase across chunks", () => {
  const r = new Resampler();
  const sine = (n: number, rate: number) =>
    Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate));
  const input = sine(22050, 22050);
  const parts: number[] = [];
  for (let o = 0; o < input.length; o += 1024) parts.push(...r.push(input.subarray(o, o + 1024)));
  expect(Math.abs(parts.length - 16000)).toBeLessThanOrEqual(2);
  const ref = sine(parts.length, 16000);
  let err = 0;
  for (let i = 0; i < parts.length; i++) err = Math.max(err, Math.abs(parts[i]! - ref[i]!));
  expect(err).toBeLessThan(0.02);
});
