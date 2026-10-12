// Manual DJ mode: two decks side by side, a crossfader, tempo + sync, cue,
// beat loops, per-deck EQ kills, a filter knob, echo, brake, an air horn and
// an automatic blend. The decks are the DeckPlayer's two mpv instances.

import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Player } from "../../player.ts";
import type { DeckPlayer } from "../../decks.ts";
import { equalPower } from "../../decks.ts";
import type { Track } from "../../playlist.ts";
import { cachedFile } from "../../offline.ts";
import { getBpm } from "../../bpm-cache.ts";
import { theme } from "../../theme.ts";
import { t } from "../../i18n.ts";
import { SmoothBar, CellRow, gradientAt, type Cell } from "./visuals.tsx";

const LOOP_BEATS = [1, 2, 4, 8];
const KNOB = 10; // filter knob range: -10 (low-pass) … 0 (off) … +10 (high-pass)

interface DeckFx {
  kill: [boolean, boolean, boolean]; // lows, mids, highs
  filter: number;
  echo: boolean;
  speed: number;
  cue: number | null;
  loop: number | null; // loop length in beats when looping
  loopBeats: number;
}
const freshFx = (): DeckFx => ({
  kill: [false, false, false],
  filter: 0,
  echo: false,
  speed: 1,
  cue: null,
  loop: null,
  loopBeats: 4,
});

/** Pure: the lavfi graph for a deck's effects ("" = none). */
export function deckGraph(fx: DeckFx): string {
  const parts: string[] = [];
  if (fx.kill[0]) parts.push("bass@lk=g=-30:f=180");
  if (fx.kill[1]) parts.push("equalizer@mk=f=1000:width_type=o:width=2:g=-30");
  if (fx.kill[2]) parts.push("treble@hk=g=-30:f=5000");
  if (fx.filter < 0) {
    const f = Math.round(20000 * Math.pow(200 / 20000, -fx.filter / KNOB));
    parts.push(`lowpass@lp=f=${f}`);
  } else if (fx.filter > 0) {
    const f = Math.round(20 * Math.pow(2000 / 20, fx.filter / KNOB));
    parts.push(`highpass@hp=f=${f}`);
  }
  if (fx.echo) parts.push("aecho@echo=0.8:0.6:300|600:0.4|0.25");
  return parts.join(",");
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export function DjView({
  deck,
  decks,
  tracks,
  volume,
  blendSeconds,
  cols,
  rows,
  onExit,
}: {
  deck: DeckPlayer;
  decks: [Player, Player];
  tracks: Track[];
  volume: number;
  blendSeconds: number;
  frame: number; // re-render tick from the app
  cols: number;
  rows: number;
  onExit: (keep: Player) => void;
}) {
  const accent = theme().accent;
  const [focus, setFocus] = useState<0 | 1>(1); // B: the deck you load into
  const [x, setX] = useState(0); // crossfader: 0 = A, 1 = B
  const [fx, setFx] = useState<[DeckFx, DeckFx]>([freshFx(), freshFx()]);
  const [listIdx, setListIdx] = useState(0);
  const [note, setNote] = useState<{ text: string; until: number }>({ text: "", until: 0 });
  const autoRef = useRef<NodeJS.Timeout | null>(null);
  const say = (text: string) => setNote({ text, until: Date.now() + 2500 });

  // Volumes follow the crossfader (equal power).
  const applyMix = (pos: number) => {
    const g = equalPower(pos);
    decks[0].setVolume(volume * g.out);
    decks[1].setVolume(volume * g.in);
  };
  useEffect(() => {
    applyMix(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, volume]);
  useEffect(
    () => () => {
      if (autoRef.current) clearInterval(autoRef.current);
    },
    [],
  );

  const bpmOf = (i: 0 | 1) => {
    const url = decks[i].state.url;
    return url ? getBpm(url) : null;
  };
  const beatSec = (i: 0 | 1) => 60 / (bpmOf(i) ?? 120); // media seconds per beat

  const updateFx = (i: 0 | 1, change: (f: DeckFx) => DeckFx) => {
    setFx((prev) => {
      const next: [DeckFx, DeckFx] = [prev[0], prev[1]];
      next[i] = change(prev[i]);
      const g = deckGraph(next[i]);
      decks[i].setFx(g || null);
      if (next[i].speed !== prev[i].speed) decks[i].setSpeed(next[i].speed);
      return next;
    });
  };

  const loadInto = (i: 0 | 1, tr: Track) => {
    const local = cachedFile(tr.url);
    decks[i].loadPaused(tr.url, local ? { source: local, title: tr.title } : { title: tr.resolved ? tr.title : undefined });
    decks[i].setLoop(null);
    updateFx(i, () => ({ ...freshFx() }));
    decks[i].setSpeed(1);
    setTimeout(() => applyMix(x), 50); // loadPaused muted it; restore its fader level
    say(t("djv.loaded", { deck: i === 0 ? "A" : "B", title: tr.title }));
  };

  const autoMix = () => {
    if (autoRef.current) clearInterval(autoRef.current);
    const from = x;
    // Towards the deck you're working on — or the other one if the fader is
    // already all the way over there.
    let to = focus === 1 ? 1 : 0;
    if (x === to) to = 1 - to;
    const target = decks[to === 1 ? 1 : 0];
    if (!target.state.url) return say(t("djv.emptyDeck"));
    if (target.state.paused) target.setPause(false);
    const t0 = Date.now();
    const total = blendSeconds * 1000;
    autoRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / total);
      setX(from + (to - from) * p);
      if (p >= 1 && autoRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
        const old = decks[to === 1 ? 0 : 1];
        if (old.state.url && !old.state.paused) old.setPause(true);
      }
    }, 50);
    say(t("djv.automix"));
  };

  const brake = (i: 0 | 1) => {
    const d = decks[i];
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 1200);
      d.setSpeed(Math.max(0.05, fx[i].speed * (1 - p)), false);
      if (p >= 1) {
        clearInterval(id);
        d.setPause(true);
        d.setSpeed(fx[i].speed);
      }
    }, 40);
  };

  useInput((ch, key) => {
    const f = focus;
    const d = decks[f];
    if (key.escape || ch === "j" || ch === "q") {
      if (autoRef.current) clearInterval(autoRef.current);
      return onExit(x < 0.5 ? decks[0] : decks[1]);
    }
    if (key.tab) return setFocus(f === 0 ? 1 : 0);
    if (key.leftArrow) return setX((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10));
    if (key.rightArrow) return setX((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10));
    if (key.upArrow) return setListIdx((i) => Math.max(0, i - 1));
    if (key.downArrow) return setListIdx((i) => Math.min(tracks.length - 1, i + 1));
    if (key.return) {
      const tr = tracks[listIdx];
      if (tr) loadInto(f, tr);
      return;
    }
    if (ch === " ") return d.togglePause();
    if (ch === "+" || ch === "=") return updateFx(f, (o) => ({ ...o, speed: Math.min(1.16, Math.round((o.speed + 0.01) * 100) / 100) }));
    if (ch === "-") return updateFx(f, (o) => ({ ...o, speed: Math.max(0.84, Math.round((o.speed - 0.01) * 100) / 100) }));
    if (ch === "s") {
      const other: 0 | 1 = f === 0 ? 1 : 0;
      const mine = bpmOf(f);
      const theirs = bpmOf(other);
      if (!mine || !theirs) return say(t("djv.noBpm"));
      let r = (theirs * fx[other].speed) / mine;
      while (r > 1.5) r /= 2;
      while (r < 0.67) r *= 2;
      updateFx(f, (o) => ({ ...o, speed: Math.round(r * 1000) / 1000 }));
      return say(t("djv.synced", { bpm: Math.round(theirs * fx[other].speed) }));
    }
    if (ch === "1" || ch === "2" || ch === "3") {
      const band = Number(ch) - 1;
      return updateFx(f, (o) => {
        const kill = [...o.kill] as DeckFx["kill"];
        kill[band] = !kill[band];
        return { ...o, kill };
      });
    }
    if (ch === "[") return updateFx(f, (o) => ({ ...o, filter: Math.max(-KNOB, o.filter - 1) }));
    if (ch === "]") return updateFx(f, (o) => ({ ...o, filter: Math.min(KNOB, o.filter + 1) }));
    if (ch === "0") return updateFx(f, (o) => ({ ...o, filter: 0, kill: [false, false, false], echo: false }));
    if (ch === "e") return updateFx(f, (o) => ({ ...o, echo: !o.echo }));
    if (ch === "b") return brake(f);
    if (ch === "c") {
      const pos = d.state.position;
      updateFx(f, (o) => ({ ...o, cue: pos }));
      return say(t("djv.cueSet", { at: fmt(pos) }));
    }
    if (ch === "v") {
      const cue = fx[f].cue;
      if (cue === null) return say(t("djv.noCue"));
      d.seekTo(cue);
      return d.setPause(false);
    }
    if (ch === "g") {
      if (fx[f].loop !== null) {
        d.setLoop(null);
        return updateFx(f, (o) => ({ ...o, loop: null }));
      }
      const a = d.state.position;
      d.setLoop(a, a + fx[f].loopBeats * beatSec(f));
      return updateFx(f, (o) => ({ ...o, loop: o.loopBeats }));
    }
    if (ch === "G") {
      const beats = LOOP_BEATS[(LOOP_BEATS.indexOf(fx[f].loopBeats) + 1) % LOOP_BEATS.length]!;
      if (fx[f].loop !== null) {
        const a = d.state.position;
        d.setLoop(a, a + beats * beatSec(f));
      }
      return updateFx(f, (o) => ({ ...o, loopBeats: beats, loop: o.loop !== null ? beats : null }));
    }
    if (ch === "h") return deck.airHorn(volume);
    if (ch === "a") return autoMix();
  });

  // --- drawing --------------------------------------------------------------------
  const deckW = Math.max(24, Math.floor((cols - 1) / 2));
  const inner = deckW - 4;
  const knob = (v: number) => {
    const w = 21;
    const pos = Math.round(((v + KNOB) / (2 * KNOB)) * (w - 1));
    const cells: Cell[] = Array.from({ length: w }, (_, i) =>
      i === pos ? { ch: "●", fg: v === 0 ? accent : gradientAt(i / (w - 1)) } : { ch: i === (w - 1) / 2 ? "┼" : "─", dim: true },
    );
    return <CellRow cells={cells} />;
  };

  const deckPanel = (i: 0 | 1) => {
    const d = decks[i];
    const s = d.state;
    const f = fx[i];
    const focused = focus === i;
    const bpm = bpmOf(i);
    const ratio = s.duration > 0 ? s.position / s.duration : 0;
    const time = `${fmt(s.position)} / ${fmt(s.duration)}`;
    const name = s.url ? (s.title ?? s.url).slice(0, inner - 3) : t("djv.emptyDeck");
    const level = i === 0 ? equalPower(x).out : equalPower(x).in;
    return (
      <Box
        key={i}
        width={deckW}
        flexDirection="column"
        borderStyle={focused ? "double" : "round"}
        borderColor={accent}
        borderDimColor={!focused}
        paddingX={1}
      >
        <Text bold color={accent}>
          {i === 0 ? "◀ A" : "B ▶"} {focused ? `· ${t("djv.focused")}` : ""}
        </Text>
        <Text wrap="truncate" color={s.url ? undefined : "gray"}>
          {s.url ? (s.paused ? "⏸ " : "▶ ") : "  "}
          {name}
        </Text>
        <Text>
          <Text color={accent}>{bpm ? `${Math.round(bpm * f.speed)} BPM` : "— BPM"}</Text>
          <Text dimColor>{`  ×${f.speed.toFixed(2)}`}</Text>
          {f.loop !== null ? <Text color="yellow">{`  ⟳ ${f.loop}`}</Text> : <Text dimColor>{`  ⟳ ${f.loopBeats}`}</Text>}
          {f.cue !== null ? <Text color="cyan">{`  ◆ ${fmt(f.cue)}`}</Text> : null}
        </Text>
        <Box>
          <SmoothBar ratio={ratio} width={Math.max(6, inner - time.length - 1)} />
          <Text dimColor> {time}</Text>
        </Box>
        <Text>
          {(["LOW", "MID", "HI"] as const).map((lbl, k) => (
            <Text key={lbl} color={f.kill[k] ? "red" : accent} dimColor={!f.kill[k]}>
              {`${k + 1}:${lbl}${f.kill[k] ? "✕" : "■"}  `}
            </Text>
          ))}
          <Text color={f.echo ? "magenta" : undefined} dimColor={!f.echo}>
            {`e:ECHO${f.echo ? "✓" : ""}`}
          </Text>
        </Text>
        <Box>
          <Text dimColor>{"LPF "}</Text>
          {knob(f.filter)}
          <Text dimColor>{" HPF"}</Text>
        </Box>
        <Box>
          <Text dimColor>{t("djv.level")} </Text>
          <SmoothBar ratio={level} width={Math.max(6, inner - 8)} gradient={false} />
        </Box>
      </Box>
    );
  };

  const faderW = Math.max(10, Math.min(cols - 12, 41));
  const fpos = Math.round(x * (faderW - 1));
  const fader: Cell[] = Array.from({ length: faderW }, (_, i) =>
    i === fpos ? { ch: "█", fg: accent } : { ch: i === Math.floor(faderW / 2) ? "┼" : "━", fg: gradientAt(i / (faderW - 1)), dim: true },
  );
  const listRows = Math.max(3, rows - 18);
  const start = Math.max(0, Math.min(listIdx - Math.floor(listRows / 2), tracks.length - listRows));
  const loadedA = decks[0].state.url;
  const loadedB = decks[1].state.url;
  const noteText = Date.now() < note.until ? note.text : "";

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color={accent}>
          ᓚᘏᗢ catunes · {t("djv.title")}
        </Text>
        <Text dimColor>{t("djv.exitHint")}</Text>
      </Box>
      <Box>
        {deckPanel(0)}
        {deckPanel(1)}
      </Box>
      <Box justifyContent="center">
        <Text bold color={accent}>
          {"A "}
        </Text>
        <CellRow cells={fader} />
        <Text bold color={accent}>
          {" B"}
        </Text>
      </Box>
      <Box borderStyle="round" borderColor={accent} borderDimColor flexDirection="column" paddingX={1} flexGrow={1}>
        <Text bold color={accent} dimColor>
          {t("djv.tracks", { deck: focus === 0 ? "A" : "B" })}
        </Text>
        {tracks.slice(Math.max(0, start), Math.max(0, start) + listRows).map((tr, k) => {
          const idx = Math.max(0, start) + k;
          const hl = idx === listIdx;
          const tag = tr.url === loadedA ? "A " : tr.url === loadedB ? "B " : "  ";
          return (
            <Text key={idx} color={hl ? "black" : accent} backgroundColor={hl ? accent : undefined} wrap="truncate">
              {`${hl ? "›" : " "} ${tag}${tr.title}`}
            </Text>
          );
        })}
      </Box>
      <Box paddingX={1}>
        <Text color={accent} bold={!!noteText} dimColor={!noteText} wrap="truncate">
          {noteText || t("djv.hint")}
        </Text>
      </Box>
    </Box>
  );
}
