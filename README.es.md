# catunes 🎵

> 🌍 [English](README.md) · **Español**

[![CI](https://github.com/R0MADEV/catunes/actions/workflows/ci.yml/badge.svg)](https://github.com/R0MADEV/catunes/actions/workflows/ci.yml)

Reproductor de música en terminal **retro**, con **salas sincronizadas**
y **rotación de DJ por turnos** — escuchad juntos, desde la terminal.

- 🎧 **Modo solo:** reproduce YouTube, radios, streams o archivos locales. Funciona sin servidor, incluso offline (archivos locales).
- 👥 **Modo sala (opcional):** entra a una sala con un código y escuchad lo mismo, sincronizado. Cada persona pincha **por turnos** (rotación en bucle).
- 🚫 **Sin descargar nada:** streaming puro. Sin Spotify Premium.
- 📊 **Visualizador reactivo real:** FFT en vivo (ffmpeg auto-instalado) con a todo el ancho y con degradados suaves, en varios modos — barras, suave, espejo, osciloscopio, plasma, cascada (espectrograma), vúmetros y fuego (cambia con `v`).
- 🖥️ **Multiplataforma:** macOS, Linux y Windows.

> El núcleo es agnóstico de la fuente: YouTube es solo una opción más.

## Requisitos

- [mpv](https://mpv.io) — motor de audio (obligatorio).
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — solo para YouTube y similares.

Comprueba tu sistema con: `catunes doctor`

---

## 👤 Para usuarios — instala y escucha

```bash
npm install -g catunes
catunes play "https://www.youtube.com/watch?v=..."
```

Controles: `espacio` pausa · `← →` seek · `+ -` volumen · `q` salir.

---

### Ver y controlar desde cualquier pestaña 🎛️

No necesitas tmux ni zellij. Con un reproductor en marcha, desde cualquier panel:

```bash
catunes status     # qué suena ahora
catunes pause      # pausa / reanuda
catunes next       # siguiente
catunes vol +5     # volumen
```

Además, el **título del terminal** muestra el tema actual en cualquier terminal
(Warp lo enseña en la barra de pestañas). Guía: **[docs/now-playing.md](docs/now-playing.md)**

### Temas 🎨

Temas integrados (Green por defecto): elígelos en **Ajustes (`o`) → Tema**.
Crea el tuyo editando `~/.config/catunes/themes.json`:

```json
{
  "Ocean": { "accent": "cyan", "spectrum": ["blue", "cyan", "white"] }
}
```

`accent` es el color principal; `spectrum` son los colores grave/medio/agudo del
visualizador (nombres de color del terminal: green, yellow, red, cyan, blue…, o
hex como `#ff79c6`).

También puedes crear uno dentro de la app — **Ajustes → Tema → Crear un tema…** —
y compartirlo como un código de una línea:

```bash
catunes theme export Dracula     # → catunes-theme:Dracula:bd93f9,50fa7b,ff79c6,8be9fd
catunes theme import "catunes-theme:Dracula:bd93f9,50fa7b,ff79c6,8be9fd"
```

### Extras para escuchar 🌙

| Tecla | Qué hace |
| --- | --- |
| `t` | **Temporizador de apagado** — detiene la música en 15/30/45/60/90 min o al terminar la canción (baja el volumen en los últimos 30s). También `catunes sleep 30` desde otra pestaña. |
| `l` / `*` | **Favorito** la canción seleccionada; se juntan en la lista `★ Favorites`. |
| `u` / `U` | **Cola**: reproducir después de esta (también en resultados de búsqueda) / ver la cola. |
| `h` | **Historial** de lo que sonó; Enter la vuelve a poner. |
| `c` | Panel derecho: el **gato** (por defecto) → la **portada** de la canción (medios bloques de colores) → **los dos** juntos (ventanas anchas). |
| `b` | **Mini reproductor** — 3 líneas, para paneles pequeños (también automático si la terminal es baja). |

En pantallas estrechas (celular en vertical) el diseño pasa a **compacto** solo:
una lista a la vez (Tab cambia), sin panel lateral. **Ajustes → Colores de la
portada** tiñe toda la interfaz con la portada de cada canción.

En **Ajustes (`o`)**:

- **Transición suave** — baja el final de cada canción y sube el inicio de la siguiente (2–10s).
- **Caché offline** — guarda el audio de las últimas N canciones de YouTube que
  escuchaste en `~/.config/catunes/offline/` para oírlas sin internet. Apagada por defecto.
- **Detectar sonidos** — muestra junto al artista qué lleva la canción: voces,
  instrumentos, género, ánimo y ritmo, p. ej.
  `🎤 voz · 🎸 guitarra eléctrica · 🥁 batería · 🏷 rock · ♩ 133 BPM`. Funciona en
  tu equipo con [YAMNet](https://huggingface.co/audiomagic/yamnet-onnx) de Google
  (AudioSet, 521 clases) usando ONNX Runtime en WebAssembly, así que también va
  en Termux; el modelo y el motor (~30 MB) se descargan una vez y se verifican.
  Es una estimación: en mezclas muy cargadas puede no detectar o confundir algún
  instrumento.
- **Actualizar catunes** — para instalaciones con git (como el bootstrap de
  Termux): `git pull` + recompilar, sin escribir nada. También `catunes update`.

---

## 🛠️ Para desarrolladores — clona y corre

```bash
git clone https://github.com/<tu-usuario>/catunes
cd catunes
bun install

# Terminal 1 — relay de salas (Docker o nativo)
docker compose up            # ó: bun run dev:server

# Terminal 2 — el reproductor desde el código (nativo, con audio)
bun run dev:client doctor
bun run dev:client play "https://www.youtube.com/watch?v=..."
```

> El **cliente va nativo** (necesita los altavoces); el **relay va en Docker**
> (es headless, solo texto). El audio NO funciona dentro de Docker.

---

## 🏠 Para self-host — tu propio servidor de salas

```bash
docker compose up -d                       # levanta el relay
catunes play ... --relay ws://tu-servidor:3000
```

## Estructura

```
catunes/
├── packages/
│   ├── client/   # reproductor (TUI retro + mpv)  → nativo, npm/binario
│   └── server/   # relay de salas (WebSocket)     → Docker
└── docker-compose.yml
```

## Estado / Roadmap

- [x] Fase 0 — esqueleto + reproducir una URL en streaming
- [x] Fase 1 — TUI moderna en Ink (playlist, búsqueda, visualizador, temas, i18n, ahora-suena + control)
- [ ] Fase 2 — salas sincronizadas (WebSocket)
- [ ] Fase 3 — rotación de DJ por turnos
- [ ] Fase 4 — pulido, skins, binarios, publicación en npm

## Aviso legal

Por defecto catunes **no** descarga, almacena ni convierte música — solo
reproduce streams. La caché offline opcional (apagada por defecto) guarda una
copia local de lo que escuchaste recientemente para tu uso personal; actívala
solo donde los términos de la plataforma lo permitan.
Úsalo únicamente con contenido que tengas derecho a reproducir y respetando
los términos de cada plataforma. El uso es responsabilidad de cada usuario.

Usa mpv y yt-dlp para leer el contenido; respeta el copyright y los términos de
cada sitio (como advierte el propio yt-dlp). Este proyecto no está diseñado para
descargar música ni para saltarse ninguna protección.

## Licencia

MIT
