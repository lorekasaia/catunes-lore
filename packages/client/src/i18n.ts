// Lightweight i18n for catunes.
//
// English is the default. Add a new language by adding its dictionary to
// MESSAGES. The active locale resolves from CATUNES_LANG, then the system
// LANG/LC_ALL, then falls back to English.
//
// Usage:  t("doctor.header")   ·   t("add.ok", { url })

export type Locale = "en" | "es";
export const SUPPORTED_LOCALES: Locale[] = ["en", "es"];

/** Human-readable names shown in the in-app language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

type Dict = Record<string, string>;

const MESSAGES: Record<Locale, Dict> = {
  en: {
    "help.body": `
catunes v{version} — terminal music player

USAGE:
  catunes                Open the player interface with your playlist
  catunes add <url>      Add a URL to your playlist
  catunes play <url>     Play a single URL (line mode)
  catunes status         Print the "now playing"
  catunes setup          Download yt-dlp for your system (if needed)
  catunes config [k] [v] Show or change settings (lang, searchLimit)
  catunes doctor         Check dependencies (mpv, yt-dlp)
  catunes update         Update catunes (git installs: pull + rebuild)
  catunes theme ...      list | export <name> | import "<code>"

CONTROL FROM ANY TAB (with a player running):
  catunes pause          Pause / resume
  catunes next           Next track
  catunes prev           Previous track
  catunes vol +5         Raise/lower volume (+5 / -5)
  catunes sleep 30       Stop playback in 30 minutes (0 cancels)
  catunes off            Stop all playback (panic button)

NOW PLAYING IN ANY TERMINAL:
  While catunes plays, it updates the terminal TITLE (Warp shows it in the tab
  bar; iTerm/kitty/Windows Terminal in the title).
  catunes --help         Show this help

PLAYLIST:
  Edit your songs (one URL per line) at:
  {playlist}

CONTROLS (interface):
  ↑↓ navigate · ↵ play · space pause · ←→ seek · n/p next/prev · +/- vol · q quit
`,
    "err.mpvMissing": "\n❌ mpv is not installed.\n   {hint}\n",
    "err.alreadyRunning":
      "\n⚠️  catunes is already running in another window.\n   Close it first, or run `catunes off` to stop it.\n",
    "err.ytdlpYoutube":
      "\n⚠️  This looks like a YouTube URL and yt-dlp is not installed.\n   {hint}\n",
    "err.missingUrlPlay": "Missing URL. Usage: catunes play <url>",
    "err.missingUrlAdd": "Missing URL. Usage: catunes add <url>",
    "err.unknownCmd": "Unknown command: {cmd}",
    "playlist.empty": "\nYour playlist is empty. Add URLs at:\n  {file}\n",
    "doctor.header": "\ncatunes doctor — dependency status:\n",
    "doctor.mpvOk": "  ✅ mpv      {version}",
    "doctor.mpvMissing": "  ❌ mpv      NOT found  →  {hint}",
    "doctor.ytOk": "  ✅ yt-dlp   {version}",
    "doctor.ytMissing":
      "  ⚠️  yt-dlp   not found  →  {hint}  (only needed for YouTube)",
    "doctor.ytDownloaded": "  ✅ yt-dlp   downloaded by catunes ({size} MB)",
    "doctor.ytAuto":
      "  ⚙️  yt-dlp   not installed — will auto-download on first use ({asset})",
    "doctor.ready": "\n  Ready to play. 🎵\n",
    "doctor.needMpv": "\n  Install mpv to be able to play.\n",
    "add.ok": "✅ Added to the playlist:\n   {url}",
    "add.skip": "⚠️  Not added ({reason}).",
    "reason.empty": "empty URL",
    "reason.duplicate": "already in the list",
    "ctl.noPlayer": "No active catunes player.",
    "vol.usage": "Usage: catunes vol +5  (or -5)",
    "off.done": "Stopped {n} catunes player(s). 🔇",
    "off.none": "No catunes playback was running.",
    "play.goodbye": "\n👋 see you\n",
    "deps.installFallback": "Install {dep} from its official site.",
    "ui.noSong": "— no song —",
    "ui.loading": "⏳ Loading…",
    "ui.importing": "⏳ Importing playlist…",
    "ui.importedTo": "Imported {n} tracks → {name}",
    "ui.emptyHint": "Press / to search or a to add a track",
    "ui.resolving": "resolving",
    "ui.cantPlay": "⚠ Can't play: {title} — skipping",
    "ui.allFailed": "⚠ No track could be played (check your connection?)",
    "ui.playlist": " PLAYLIST · {n} tracks ",
    "ui.addLabel": " Add track ",
    "ui.addPrompt": "Paste a URL (YouTube, radio, stream) and press Enter:",
    "ui.importLabel": " New playlist ",
    "ui.importPrompt": "Type a name for an empty list, or paste a YouTube playlist/URL, then Enter:",
    "ui.deleteLabel": " Delete ",
    "ui.deleteConfirm": "Delete this track?  {title}",
    "ui.deletePlaylistConfirm": "Delete playlist and its tracks?  {name}",
    "ui.searchLabel": " Search YouTube ",
    "ui.searchPrompt": "Type a song or artist and press Enter:",
    "ui.searching": "Searching…",
    "ui.finding": "🔎 Finding similar tracks…",
    "ui.noResults": "No results.",
    "ui.resultsLabel": " Results — ↵ play · u queue · Esc cancel ",
    "ui.lyricsLabel": " Lyrics ",
    "ui.lyricsNote":
      "Lyrics aren't shown in catunes (copyright) — opening a search in your browser:",
    "ui.lyricsHint": "Press any key to close",
    "ui.state.play": "PLAY",
    "ui.state.pause": "PAUSE",
    "ui.state.stop": "STOP",
    "ui.help":
      " {a}↑↓{/} nav  {a}↵{/} play  {a}space{/} pause  {a}n/p{/} next/prev  {a}/{/} search  {a}?{/} help  {a}q{/} quit",
    "ui.helpLabel": " Keys ",
    "ui.helpScreen": `  {a}Tab{/}      switch panel (tracks / playlists)
  {a}↑ ↓{/}      navigate
  {a}Enter{/}    play selected (or open playlist)
  {a}Space{/}    pause / resume
  {a}← →{/}      seek 5s
  {a}n / p{/}    next / previous
  {a}s{/}        shuffle on/off
  {a}r{/}        repeat (off / all / one)
  {a}/{/}        search YouTube
  {a}z{/}        find similar tracks (YouTube Mix)
  {a}y{/}        lyrics (opens a browser search)
  {a}a{/}        add a URL
  {a}d{/}        delete selected
  {a}o{/}        settings (language, results)
  {a}+ / -{/}    volume
  {a}m{/}        mute
  {a}?{/}        this help
  {a}q{/}        quit
  {a}e{/}        equalizer (theater modes)
  {a}f{/}        filter the current list
  {a}v{/}        cycle visualizer mode
  {a}l / *{/}    favorite on/off
  {a}u / U{/}    add to queue / view queue
  {a}h{/}        history
  {a}t{/}        sleep timer

  {gray-fg}Esc to close{/}`,
    "ui.langLabel": " Language ",
    "ui.settingsLabel": " Settings ",
    "ui.optLanguage": "Language",
    "ui.optSearch": "Search results",
    "ui.optPlaylist": "Playlist",
    "ui.optTheme": "Theme",
    "ui.optShortcuts": "Keyboard shortcuts",
    "ui.themesLabel": " Theme ",
    "ui.searchLimitLabel": " Search results ",
    "ui.resultsCount": "{n} results",
    "ui.playlistsLabel": " Playlists ",
    "ui.optCrossfade": "Crossfade",
    "ui.optOffline": "Offline cache",
    "ui.optSleep": "Sleep timer",
    "ui.optHistory": "History",
    "ui.optUpdate": "Update catunes",
    "sleep.usage": "Usage: catunes sleep <minutes>  (0 cancels)",
    "sleep.label": "Sleep timer",
    "sleep.set": "⏾ Sleep timer: stopping in {n} min",
    "sleep.off": "⏾ Sleep timer off",
    "sleep.endOfTrack": "⏾ Stopping at the end of this track",
    "sleep.remaining": "{n} min left",
    "sleep.optOff": "Off",
    "sleep.optTrack": "At the end of this track",
    "sleep.optMin": "{n} minutes",
    "fav.added": "★ Added to favorites",
    "fav.removed": "☆ Removed from favorites",
    "queue.added": "⏭ Queued: {title}",
    "queue.label": "Up next ({n})",
    "queue.empty": "The queue is empty. Press u on a track (or a search result) to add it.",
    "queue.hint": "↵ play now · d remove · esc close",
    "history.label": "Recently played",
    "history.empty": "Nothing played yet.",
    "history.hint": "↵ play · x clear history · esc close",
    "crossfade.note": "Fades the end of each track out and the next one in.",
    "offline.note":
      "Saves the audio of the songs you play so they work without internet. Only YouTube tracks (radios can't be saved). Saved now: {n}",
    "offline.opt": "Keep the last {n}",
    "offline.on": "💾 Offline cache: keeping the last {n} songs",
    "offline.off": "💾 Offline cache off (saved songs deleted)",
    "update.running": "⏳ Updating catunes…",
    "update.done": "✅ Updated! Quit (q) and reopen catunes to use the new version.",
    "update.upToDate": "✅ catunes is already up to date.",
    "update.notGit": "This catunes wasn't installed from git. Update it with:  npm install -g catunes",
    "update.failed": "❌ Update failed at: {step}",
    "theme.optNew": "＋ Create a theme…",
    "theme.optImport": "⇩ Import a theme code…",
    "theme.optShare": "⇧ Share the current theme",
    "theme.editLabel": "New theme",
    "theme.editHint": "↑↓ part · ←→ color · ↵ save · esc back",
    "theme.slotAccent": "Accent",
    "theme.slotLow": "Low",
    "theme.slotMid": "Mid",
    "theme.slotHigh": "High",
    "theme.namePrompt": "Name your theme and press Enter:",
    "theme.importLabel": "Import theme",
    "theme.importPrompt": "Paste a theme code (catunes-theme:…) and press Enter:",
    "theme.shareLabel": "Share theme",
    "theme.shareHint":
      "Send this code to a friend: they import it in Settings → Theme (or `catunes theme import \"<code>\"`). It was also copied to the clipboard if your system allows it.",
    "theme.savedLabel": "Theme saved",
    "theme.saved": "✅ Saved and applied: {name}",
    "theme.imported": "✅ Theme imported and applied: {name}",
    "theme.badCode": "❌ That doesn't look like a valid theme code.",
    "theme.unknown": "Unknown theme: {name}",
    "theme.usage": "Usage: catunes theme [list | export <name> | import \"<code>\"]",
  },
  es: {
    "help.body": `
catunes v{version} — reproductor de musica en terminal

USO:
  catunes                Abre la interfaz del reproductor con tu playlist
  catunes add <url>      Anade una URL a tu playlist
  catunes play <url>     Reproduce una URL suelta (modo linea)
  catunes status         Imprime el "ahora suena"
  catunes setup          Descarga yt-dlp para tu sistema (si hace falta)
  catunes config [k] [v] Ver o cambiar ajustes (lang, searchLimit)
  catunes doctor         Comprueba dependencias (mpv, yt-dlp)
  catunes update         Actualiza catunes (instalacion con git: pull + compilar)
  catunes theme ...      list | export <nombre> | import "<codigo>"

CONTROL DESDE CUALQUIER PESTANA (con un reproductor en marcha):
  catunes pause          Pausa / reanuda
  catunes next           Siguiente cancion
  catunes prev           Cancion anterior
  catunes vol +5         Sube/baja el volumen (+5 / -5)
  catunes sleep 30       Detiene la musica en 30 minutos (0 cancela)
  catunes off            Detiene toda la reproduccion (boton de panico)

AHORA SUENA EN CUALQUIER TERMINAL:
  Mientras catunes reproduce, actualiza el TITULO del terminal (Warp lo muestra
  en la barra de pestanas; iTerm/kitty/Windows Terminal en el titulo).
  catunes --help         Muestra esta ayuda

PLAYLIST:
  Edita tus canciones (una URL por linea) en:
  {playlist}

CONTROLES (interfaz):
  ↑↓ navegar · ↵ play · espacio pausa · ←→ seek · n/p sig/ant · +/- vol · q salir
`,
    "err.mpvMissing": "\n❌ mpv no esta instalado.\n   {hint}\n",
    "err.alreadyRunning":
      "\n⚠️  catunes ya esta abierto en otra ventana.\n   Cierralo primero, o usa `catunes off` para detenerlo.\n",
    "err.ytdlpYoutube":
      "\n⚠️  Esta URL parece de YouTube y yt-dlp no esta instalado.\n   {hint}\n",
    "err.missingUrlPlay": "Falta la URL. Uso: catunes play <url>",
    "err.missingUrlAdd": "Falta la URL. Uso: catunes add <url>",
    "err.unknownCmd": "Comando desconocido: {cmd}",
    "playlist.empty": "\nTu playlist esta vacia. Anade URLs en:\n  {file}\n",
    "doctor.header": "\ncatunes doctor — estado de dependencias:\n",
    "doctor.mpvOk": "  ✅ mpv      {version}",
    "doctor.mpvMissing": "  ❌ mpv      NO encontrado  →  {hint}",
    "doctor.ytOk": "  ✅ yt-dlp   {version}",
    "doctor.ytMissing":
      "  ⚠️  yt-dlp   no encontrado  →  {hint}  (solo necesario para YouTube)",
    "doctor.ytDownloaded": "  ✅ yt-dlp   descargado por catunes ({size} MB)",
    "doctor.ytAuto":
      "  ⚙️  yt-dlp   no instalado — se descargará al primer uso ({asset})",
    "doctor.ready": "\n  Listo para reproducir. 🎵\n",
    "doctor.needMpv": "\n  Instala mpv para poder reproducir.\n",
    "add.ok": "✅ Anadida a la playlist:\n   {url}",
    "add.skip": "⚠️  No anadida ({reason}).",
    "reason.empty": "URL vacia",
    "reason.duplicate": "ya estaba en la lista",
    "ctl.noPlayer": "No hay un reproductor catunes activo.",
    "vol.usage": "Uso: catunes vol +5  (o -5)",
    "off.done": "Detenidos {n} reproductor(es) de catunes. 🔇",
    "off.none": "No había reproducción de catunes en marcha.",
    "play.goodbye": "\n👋 hasta luego\n",
    "deps.installFallback": "Instala {dep} desde su web oficial.",
    "ui.noSong": "— sin cancion —",
    "ui.loading": "⏳ Cargando…",
    "ui.importing": "⏳ Importando playlist…",
    "ui.importedTo": "Importadas {n} canciones → {name}",
    "ui.emptyHint": "Pulsa / para buscar o a para anadir",
    "ui.resolving": "resolviendo",
    "ui.cantPlay": "⚠ No se puede reproducir: {title} — saltando",
    "ui.allFailed": "⚠ No se pudo reproducir nada (¿revisa tu conexion?)",
    "ui.playlist": " PLAYLIST · {n} temas ",
    "ui.addLabel": " Anadir cancion ",
    "ui.addPrompt": "Pega una URL (YouTube, radio, stream) y pulsa Enter:",
    "ui.importLabel": " Nueva lista ",
    "ui.importPrompt": "Escribe un nombre para una lista vacía, o pega una playlist/URL, y pulsa Enter:",
    "ui.deleteLabel": " Borrar ",
    "ui.deleteConfirm": "¿Borrar esta cancion?  {title}",
    "ui.deletePlaylistConfirm": "¿Borrar la lista y sus canciones?  {name}",
    "ui.searchLabel": " Buscar en YouTube ",
    "ui.searchPrompt": "Escribe una cancion o artista y pulsa Enter:",
    "ui.searching": "Buscando…",
    "ui.finding": "🔎 Buscando canciones parecidas…",
    "ui.noResults": "Sin resultados.",
    "ui.resultsLabel": " Resultados — ↵ reproducir · u a la cola · Esc cancelar ",
    "ui.lyricsLabel": " Letra ",
    "ui.lyricsNote":
      "La letra no se muestra en catunes (derechos de autor) — abriendo una búsqueda en tu navegador:",
    "ui.lyricsHint": "Presiona cualquier tecla para cerrar",
    "ui.state.play": "PLAY",
    "ui.state.pause": "PAUSA",
    "ui.state.stop": "STOP",
    "ui.help":
      " {a}↑↓{/} nav  {a}↵{/} play  {a}espacio{/} pausa  {a}n/p{/} sig/ant  {a}/{/} buscar  {a}?{/} ayuda  {a}q{/} salir",
    "ui.helpLabel": " Teclas ",
    "ui.helpScreen": `  {a}Tab{/}      cambiar panel (canciones / listas)
  {a}↑ ↓{/}      navegar
  {a}Enter{/}    reproducir seleccionada (o abrir lista)
  {a}Espacio{/}  pausa / reanudar
  {a}← →{/}      avanzar/retroceder 5s
  {a}n / p{/}    siguiente / anterior
  {a}s{/}        aleatorio on/off
  {a}r{/}        repetir (off / todo / una)
  {a}/{/}        buscar en YouTube
  {a}z{/}        buscar canciones parecidas (Mix de YouTube)
  {a}y{/}        letra (abre una busqueda en el navegador)
  {a}a{/}        anadir una URL
  {a}d{/}        borrar seleccionada
  {a}o{/}        ajustes (idioma, resultados)
  {a}+ / -{/}    volumen
  {a}m{/}        silenciar
  {a}?{/}        esta ayuda
  {a}q{/}        salir
  {a}e{/}        ecualizador (modos de teatro)
  {a}f{/}        filtrar la lista actual
  {a}v{/}        cambiar modo del visualizador
  {a}l / *{/}    favorito si/no
  {a}u / U{/}    anadir a la cola / ver la cola
  {a}h{/}        historial
  {a}t{/}        temporizador de apagado

  {gray-fg}Esc para cerrar{/}`,
    "ui.langLabel": " Idioma ",
    "ui.settingsLabel": " Ajustes ",
    "ui.optLanguage": "Idioma",
    "ui.optSearch": "Resultados de busqueda",
    "ui.optPlaylist": "Lista",
    "ui.optTheme": "Tema",
    "ui.optShortcuts": "Atajos de teclado",
    "ui.themesLabel": " Tema ",
    "ui.searchLimitLabel": " Resultados de busqueda ",
    "ui.resultsCount": "{n} resultados",
    "ui.playlistsLabel": " Listas ",
    "ui.optCrossfade": "Transición suave",
    "ui.optOffline": "Caché offline",
    "ui.optSleep": "Temporizador de apagado",
    "ui.optHistory": "Historial",
    "ui.optUpdate": "Actualizar catunes",
    "sleep.usage": "Uso: catunes sleep <minutos>  (0 cancela)",
    "sleep.label": "Temporizador de apagado",
    "sleep.set": "⏾ Temporizador: se detiene en {n} min",
    "sleep.off": "⏾ Temporizador desactivado",
    "sleep.endOfTrack": "⏾ Se detiene al terminar esta canción",
    "sleep.remaining": "quedan {n} min",
    "sleep.optOff": "Apagado",
    "sleep.optTrack": "Al terminar esta canción",
    "sleep.optMin": "{n} minutos",
    "fav.added": "★ Añadida a favoritos",
    "fav.removed": "☆ Quitada de favoritos",
    "queue.added": "⏭ En cola: {title}",
    "queue.label": "A continuación ({n})",
    "queue.empty": "La cola está vacía. Pulsa u sobre una canción (o un resultado de búsqueda) para añadirla.",
    "queue.hint": "↵ reproducir ya · d quitar · esc cerrar",
    "history.label": "Escuchado recientemente",
    "history.empty": "Todavía no has escuchado nada.",
    "history.hint": "↵ reproducir · x borrar historial · esc cerrar",
    "crossfade.note": "Baja suavemente el final de cada canción y sube el inicio de la siguiente.",
    "offline.note":
      "Guarda el audio de las canciones que escuchas para oírlas sin internet. Solo canciones de YouTube (las radios no se pueden guardar). Guardadas ahora: {n}",
    "offline.opt": "Guardar las últimas {n}",
    "offline.on": "💾 Caché offline: se guardan las últimas {n} canciones",
    "offline.off": "💾 Caché offline desactivada (canciones guardadas borradas)",
    "update.running": "⏳ Actualizando catunes…",
    "update.done": "✅ ¡Actualizado! Sal (q) y vuelve a abrir catunes para usar la nueva versión.",
    "update.upToDate": "✅ catunes ya está al día.",
    "update.notGit": "Este catunes no se instaló con git. Actualízalo con:  npm install -g catunes",
    "update.failed": "❌ La actualización falló en: {step}",
    "theme.optNew": "＋ Crear un tema…",
    "theme.optImport": "⇩ Importar un código de tema…",
    "theme.optShare": "⇧ Compartir el tema actual",
    "theme.editLabel": "Tema nuevo",
    "theme.editHint": "↑↓ parte · ←→ color · ↵ guardar · esc volver",
    "theme.slotAccent": "Acento",
    "theme.slotLow": "Graves",
    "theme.slotMid": "Medios",
    "theme.slotHigh": "Agudos",
    "theme.namePrompt": "Ponle nombre a tu tema y pulsa Enter:",
    "theme.importLabel": "Importar tema",
    "theme.importPrompt": "Pega un código de tema (catunes-theme:…) y pulsa Enter:",
    "theme.shareLabel": "Compartir tema",
    "theme.shareHint":
      "Mándale este código a quien quieras: lo importa en Ajustes → Tema (o con `catunes theme import \"<código>\"`). También se copió al portapapeles si tu sistema lo permite.",
    "theme.savedLabel": "Tema guardado",
    "theme.saved": "✅ Guardado y aplicado: {name}",
    "theme.imported": "✅ Tema importado y aplicado: {name}",
    "theme.badCode": "❌ Eso no parece un código de tema válido.",
    "theme.unknown": "Tema desconocido: {name}",
    "theme.usage": "Uso: catunes theme [list | export <nombre> | import \"<código>\"]",
  },
};

let current: Locale | null = null;

/** Resolve the locale from CATUNES_LANG, the system LANG/LC_ALL, or default en. */
export function detectLocale(): Locale {
  const raw = (
    process.env.CATUNES_LANG ||
    process.env.LANG ||
    process.env.LC_ALL ||
    ""
  ).toLowerCase();
  const match = SUPPORTED_LOCALES.find((l) => raw.startsWith(l));
  return match ?? "en";
}

export function setLocale(loc: Locale): void {
  current = loc;
}

export function getLocale(): Locale {
  if (!current) current = detectLocale();
  return current;
}

/** Translate a key, interpolating {placeholders} from vars. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const loc = getLocale();
  let str = MESSAGES[loc][key] ?? MESSAGES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
