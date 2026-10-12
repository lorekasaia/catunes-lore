import { test, expect } from "bun:test";
import { deckGraph } from "./dj.tsx";

const base = { kill: [false, false, false] as [boolean, boolean, boolean], filter: 0, echo: false, speed: 1, cue: null, loop: null, loopBeats: 4 };

test("deckGraph: no effects → empty", () => {
  expect(deckGraph(base)).toBe("");
});

test("deckGraph: EQ kills, filter knob and echo", () => {
  expect(deckGraph({ ...base, kill: [true, false, true] })).toBe("bass@lk=g=-30:f=180,treble@hk=g=-30:f=5000");
  expect(deckGraph({ ...base, filter: -10 })).toBe("lowpass@lp=f=200");
  expect(deckGraph({ ...base, filter: 10 })).toBe("highpass@hp=f=2000");
  expect(deckGraph({ ...base, filter: 5 })).toBe("highpass@hp=f=200");
  expect(deckGraph({ ...base, echo: true })).toContain("aecho@echo=");
});
