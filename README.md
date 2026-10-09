# catunes 🎵

> 🌍 **English** · [Español](README.es.md)

[![CI](https://github.com/R0MADEV/catunes/actions/workflows/ci.yml/badge.svg)](https://github.com/R0MADEV/catunes/actions/workflows/ci.yml)

A **retro** terminal music player with **synced rooms** and
**turn-based DJ rotation** — listen together, right from your terminal.

- 🎧 **Solo mode:** play YouTube, radios, streams or local files. Works without a server, even offline (local files).
- 👥 **Room mode (optional):** join a room with a code and listen together, in sync. Everyone takes **turns** as DJ (round-robin).
- 🚫 **No downloads:** pure streaming. No Spotify Premium needed.
- 📊 **Real audio-reactive visualizer:** live FFT (auto-installed ffmpeg) with full-width with smooth gradients, in several modes — bars, smooth, mirror, oscilloscope, plasma, waterfall (spectrogram), VU meters and fire (cycle with `v`).
- 🖥️ **Cross-platform:** macOS, Linux and Windows.

> The core is source-agnostic: YouTube is just one option.

## Requirements

- [mpv](https://mpv.io) — audio engine (required).
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — only for YouTube and similar.

Check your system with: `catunes doctor`

---

## 👤 For users — install and listen

```bash
npm install -g catunes
catunes play "https://www.youtube.com/watch?v=..."
```

Controls: `space` pause · `← →` seek · `+ -` volume · `q` quit.

---

### See and control from any pane 🎛️

No tmux or zellij needed. With a player running, from any pane (tab):

```bash
catunes status     # what's playing now
catunes pause      # pause / resume
catunes next       # next
catunes vol +5     # volume
```

Also, the **terminal title** shows the current track in any terminal
(Warp shows it in the tab bar). Guide: **[docs/now-playing.md](docs/now-playing.md)**

### Themes 🎨

Built-in themes (Green by default): pick one in **Settings (`o`) → Theme**.
Create your own by editing `~/.config/catunes/themes.json`:

```json
{
  "Ocean": { "accent": "cyan", "spectrum": ["blue", "cyan", "white"] }
}
```

`accent` is the main color; `spectrum` is the visualizer's low/mid/high colors
(terminal color names: green, yellow, red, cyan, blue, magenta, white…, or hex
like `#ff79c6`).

You can also build one inside the app — **Settings → Theme → Create a theme…** —
and share it as a one-line code:

```bash
catunes theme export Dracula     # → catunes-theme:Dracula:bd93f9,50fa7b,ff79c6,8be9fd
catunes theme import "catunes-theme:Dracula:bd93f9,50fa7b,ff79c6,8be9fd"
```

### Listening extras 🌙

| Key | What it does |
| --- | --- |
| `t` | **Sleep timer** — stop in 15/30/45/60/90 min or at the end of the track (fades out over the last 30s). Also `catunes sleep 30` from another tab. |
| `l` / `*` | **Favorite** the selected track; they collect in the `★ Favorites` list. |
| `u` / `U` | **Queue** a track to play next (also works on search results) / view the queue. |
| `h` | **History** of what played recently; Enter plays it again. |
| `c` | Right panel: the track's **cover art** (drawn with coloured half-blocks) or the cat. |
| `b` | **Mini player** — 3 lines, for small panes (also automatic when the terminal is short). |

On narrow screens (phones in portrait) the layout goes **compact** automatically:
one list at a time (Tab switches), no side panel. **Settings → Colours from the
cover** tints the whole UI with each track's cover.

In **Settings (`o`)**:

- **Crossfade** — fades each track out and the next one in (2–10s).
- **Offline cache** — keeps the audio of the last N YouTube tracks you played in
  `~/.config/catunes/offline/` so they play without internet. Off by default.
- **Sound detection** — shows what the song contains next to the artist:
  vocals, instruments, genre, mood and tempo, e.g.
  `🎤 vocals · 🎸 electric guitar · 🥁 drums · 🏷 rock · ♩ 133 BPM`. Runs on your
  device with Google's [YAMNet](https://huggingface.co/audiomagic/yamnet-onnx)
  (AudioSet, 521 classes) via ONNX Runtime's WebAssembly build, so it also
  works on Termux; the model + runtime (~30 MB) download once, checksum-verified.
  It's an estimate — dense full-band mixes can hide or confuse instruments.
- **Update catunes** — for git installs (like the Termux bootstrap): `git pull`
  + rebuild, no typing needed. Also `catunes update`.

---

## 🛠️ For developers — clone and run

```bash
git clone https://github.com/<your-user>/catunes
cd catunes
bun install

# Terminal 1 — rooms relay (Docker or native)
docker compose up            # or: bun run dev:server

# Terminal 2 — the player from source (native, with audio)
bun run dev:client doctor
bun run dev:client play "https://www.youtube.com/watch?v=..."
```

> The **client runs natively** (needs the speakers); the **relay runs in Docker**
> (headless, text only). Audio does NOT work inside Docker.

---

## 🏠 For self-hosting — your own rooms server

```bash
docker compose up -d                       # start the relay
catunes play ... --relay ws://your-server:3000
```

## Structure

```
catunes/
├── packages/
│   ├── client/   # player (retro TUI + mpv)  → native, npm/binary
│   └── server/   # rooms relay (WebSocket)    → Docker
└── docker-compose.yml
```

## Status / Roadmap

- [x] Phase 0 — skeleton + stream a URL
- [x] Phase 1 — modern TUI in Ink (playlist, search, visualizer, themes, i18n, now-playing + control)
- [ ] Phase 2 — synced rooms (WebSocket)
- [ ] Phase 3 — turn-based DJ rotation
- [ ] Phase 4 — polish, skins, binaries, npm release

## Disclaimer

By default catunes does **not** download, store or convert music — it only plays
streams. The optional offline cache (off by default) keeps a local copy of
recently played tracks for your personal use; only enable it where the
platform's terms allow it.
Use it only with content you have the right to play, and respect each
platform's terms of service. How you use it is your responsibility.

It relies on mpv and yt-dlp to read media; respect copyright and the terms of
each site (as yt-dlp itself advises). This project is not designed to download
music or to circumvent any protection.

## License

MIT
