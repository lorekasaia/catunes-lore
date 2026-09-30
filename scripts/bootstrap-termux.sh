#!/data/data/com.termux/files/usr/bin/bash
# One-shot installer for catunes on a fresh Termux install.
#
# Run this once, right after installing Termux, with:
#   curl -fsSL https://raw.githubusercontent.com/lorekasaia/catunes-lore/main/scripts/bootstrap-termux.sh | bash
#
# It installs everything catunes needs, clones/builds the client, and drops
# a ~/.shortcuts/catunes launcher so both Termux:Widget and the Android
# launcher-icon wrapper app (android/) can start it with one tap.

set -e

REPO_URL="https://github.com/lorekasaia/catunes-lore.git"
REPO_DIR="$HOME/catunes-lore"

echo "== Instalando dependencias del sistema =="
pkg update -y
pkg upgrade -y
pkg install -y nodejs-lts npm git mpv python-yt-dlp

echo "== Descargando catunes =="
if [ -d "$REPO_DIR" ]; then
  (cd "$REPO_DIR" && git pull)
else
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "== Instalando dependencias de Node y compilando =="
# El visualizador usa el ffmpeg nativo de Termux en vez del binario de
# ffmpeg-static (que no existe para Android).
export FFMPEG_BIN="$PREFIX/bin/ffmpeg"
(cd "$REPO_DIR/packages/client" && npm install && npm run build)

echo "== Creando el acceso directo =="
mkdir -p "$HOME/.shortcuts"
cat > "$HOME/.shortcuts/catunes" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/catunes-lore/packages/client"
node dist/cli.js
EOF
chmod +x "$HOME/.shortcuts/catunes"

echo ""
echo "== Listo =="
echo "Ya puedes abrir catunes con el widget de Termux:Widget, o escribiendo"
echo "'catunes' aquí mismo."
echo ""
echo "Para que la app 'catunes' (el ícono independiente de Termux) también"
echo "pueda abrirlo, corre esto una sola vez:"
echo "  echo \"allow-external-apps=true\" >> ~/.termux/termux.properties"
echo "  termux-reload-settings"
