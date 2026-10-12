import { test, expect } from "bun:test";
import { tempoRatio, equalPower } from "./decks.ts";

test("tempoRatio speeds the incoming track up/down to match", () => {
  expect(tempoRatio(128, 124)).toBeCloseTo(128 / 124, 5);
  expect(tempoRatio(120, 126)).toBeCloseTo(120 / 126, 5);
});

test("tempoRatio folds half/double tempo", () => {
  expect(tempoRatio(128, 64)).toBeNull(); // 128 vs 64 is the same beat
  expect(tempoRatio(124, 64)).toBeCloseTo(124 / 128, 5);
});

test("tempoRatio refuses unknown tempos or gaps over 8%", () => {
  expect(tempoRatio(null, 120)).toBeNull();
  expect(tempoRatio(120, undefined)).toBeNull();
  expect(tempoRatio(140, 120)).toBeNull();
});

test("equalPower keeps loudness steady through the blend", () => {
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const g = equalPower(t);
    expect(g.out ** 2 + g.in ** 2).toBeCloseTo(1, 5);
  }
  expect(equalPower(0)).toEqual({ out: 1, in: 0 });
});
