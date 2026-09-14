#!/bin/bash
set -euo pipefail
umask 077

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_URL="${PULSENOTES_RELEASE_URL:-https://bulletins.mmi.place/install/pulsenotes-personal.zip}"
TMP_DIR="$(mktemp -d)"
ROLLBACK=0
cleanup() {
  if [ "$ROLLBACK" = '1' ] && [ -d "$TMP_DIR/backup" ]; then
    find "$APP_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a "$TMP_DIR/backup/." "$APP_DIR/"
    printf '%s\n' 'La mise à jour a échoué. La version précédente a été restaurée.' >&2
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

command -v sha256sum >/dev/null 2>&1 || { echo 'sha256sum est requis.' >&2; exit 1; }
test -f "$APP_DIR/api/config.php" || { echo 'Configuration personnelle introuvable.' >&2; exit 1; }

curl -fL --proto '=https' --tlsv1.2 "$RELEASE_URL" -o "$TMP_DIR/release.zip"
curl -fL --proto '=https' --tlsv1.2 "$RELEASE_URL.sha256" -o "$TMP_DIR/release.sha256"
EXPECTED_HASH="$(awk 'NR==1 {print $1}' "$TMP_DIR/release.sha256")"
ACTUAL_HASH="$(sha256sum "$TMP_DIR/release.zip" | awk '{print $1}')"
[ -n "$EXPECTED_HASH" ] && [ "$EXPECTED_HASH" = "$ACTUAL_HASH" ] || { echo 'Empreinte SHA-256 de la mise à jour invalide.' >&2; exit 1; }
unzip -q "$TMP_DIR/release.zip" -d "$TMP_DIR/release"
test -f "$TMP_DIR/release/index.html"
test -f "$TMP_DIR/release/api/router.php"
php -l "$TMP_DIR/release/api/router.php" >/dev/null
cp "$APP_DIR/api/config.php" "$TMP_DIR/config.php"
mkdir -p "$TMP_DIR/data"
if [ -d "$APP_DIR/api/data" ]; then cp -a "$APP_DIR/api/data/." "$TMP_DIR/data/"; fi
mkdir -p "$TMP_DIR/backup"
cp -a "$APP_DIR/." "$TMP_DIR/backup/"
ROLLBACK=1
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name api -exec rm -rf -- {} +
find "$APP_DIR/api" -mindepth 1 -maxdepth 1 ! -name data ! -name config.php -exec rm -rf -- {} +
cp -a "$TMP_DIR/release/." "$APP_DIR/"
cp "$TMP_DIR/config.php" "$APP_DIR/api/config.php"
mkdir -p "$APP_DIR/api/data"
cp -a "$TMP_DIR/data/." "$APP_DIR/api/data/"
chmod 600 "$APP_DIR/api/config.php"
chmod 700 "$APP_DIR/api/data"
php -l "$APP_DIR/api/index.php" >/dev/null
test -s "$APP_DIR/index.html"
ROLLBACK=0
echo "PulseNotes personnel a été mis à jour. Vos réglages et votre base SQLite sont conservés."
