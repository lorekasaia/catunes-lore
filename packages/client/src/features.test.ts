import { test, expect } from "bun:test";
import { pushEntry } from "./history.ts";
import { urlsToEvict } from "./offline.ts";
import { encodeTheme, decodeTheme } from "./theme.ts";
import { parseYtdlJson } from "./player.ts";

test("pushEntry puts the newest first and caps the list", () => {
  const list = [
    { url: "b", title: "B", at: 2 },
    { url: "a", title: "A", at: 1 },
  ];
  const out = pushEntry(list, { url: "c", title: "C", at: 3 }, 2);
  expect(out.map((e) => e.url)).toEqual(["c", "b"]);
});

test("pushEntry collapses a back-to-back repeat of the same track", () => {
  const list = [{ url: "a", title: "A", at: 1 }];
  const out = pushEntry(list, { url: "a", title: "A", at: 5 });
  expect(out).toEqual([{ url: "a", title: "A", at: 5 }]);
});

test("urlsToEvict keeps the most recently played", () => {
  const index = {
    old: { file: "o", at: 1 },
    mid: { file: "m", at: 2 },
    new: { file: "n", at: 3 },
  };
  expect(urlsToEvict(index, 2)).toEqual(["old"]);
  expect(urlsToEvict(index, 0).sort()).toEqual(["mid", "new", "old"]);
  expect(urlsToEvict(index, 10)).toEqual([]);
});

test("theme share codes round-trip (hex and named colors)", () => {
  const theme = { accent: "#ff79c6", spectrum: ["green", "#8be9fd", "red"] as [string, string, string] };
  const code = encodeTheme("My Theme", theme);
  expect(code).toBe("catunes-theme:My_Theme:ff79c6,green,8be9fd,red");
  expect(decodeTheme(code)).toEqual({ name: "My Theme", theme });
});

test("decodeTheme rejects garbage", () => {
  expect(decodeTheme("hello")).toBeNull();
  expect(decodeTheme("catunes-theme:X:red,green")).toBeNull();
  expect(decodeTheme("catunes-theme:X:red,green,blue,not a color")).toBeNull();
});

test("parseYtdlJson reuses mpv's yt-dlp result (stream + metadata)", () => {
  const json = JSON.stringify({
    title: "Song",
    uploader: "Artist",
    duration: 215,
    url: "https://rr1.googlevideo.com/videoplayback?x=1",
    ext: "webm",
    http_headers: { "User-Agent": "UA" },
  });
  const r = parseYtdlJson("https://www.youtube.com/watch?v=a", json, "edl://whatever");
  expect(r).toEqual({
    url: "https://www.youtube.com/watch?v=a",
    stream: "https://rr1.googlevideo.com/videoplayback?x=1",
    ext: "webm",
    headers: { "User-Agent": "UA" },
    title: "Song",
    duration: 215,
    artist: "Artist",
  });
});

test("parseYtdlJson falls back to mpv's stream URL, never to edl://", () => {
  expect(parseYtdlJson("u", "", "https://radio/stream").stream).toBe("https://radio/stream");
  expect(parseYtdlJson("u", "not json", "edl://x").stream).toBeNull();
});
