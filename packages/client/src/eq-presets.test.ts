import { test, expect } from "bun:test";
import { fromWinamp, EQ_PRESETS, findPreset } from "./eq-presets.ts";

test("fromWinamp: 33 is 0 dB, 64 is +12, 1 is -12", () => {
  expect(fromWinamp(new Array(10).fill(33))).toEqual(new Array(10).fill(0));
  expect(fromWinamp(new Array(10).fill(64))).toEqual(new Array(10).fill(12));
  expect(fromWinamp(new Array(10).fill(1))).toEqual(new Array(10).fill(-12));
});

test("fromWinamp keeps the shape of a curve (Winamp 'Full Bass')", () => {
  const g = fromWinamp([48, 48, 48, 42, 35, 25, 18, 15, 14, 14]);
  expect(g[0]).toBe(6); // 31 Hz: flat below Winamp's 60 Hz band
  expect(g[2]).toBe(6); // 125 Hz: between 60 and 170 (both +5.8)
  expect(g[9]).toBe(-7); // 16 kHz
  for (let i = 1; i < g.length; i++) expect(g[i]!).toBeLessThanOrEqual(g[i - 1]!); // falls steadily
});

test("presets are valid and uniquely named", () => {
  const names = new Set<string>();
  for (const p of EQ_PRESETS) {
    expect(p.gains.length).toBe(10);
    for (const g of p.gains) expect(Math.abs(g)).toBeLessThanOrEqual(12);
    expect(names.has(p.name)).toBe(false);
    names.add(p.name);
  }
  expect(EQ_PRESETS.length).toBeGreaterThanOrEqual(40);
  expect(EQ_PRESETS[0]!.name).toBe("Flat");
});

test("findPreset matches gains and night mode", () => {
  const night = EQ_PRESETS.find((p) => p.night)!;
  expect(findPreset(night.gains, true)?.name).toBe(night.name);
  expect(findPreset(night.gains, false)).toBeUndefined();
});
