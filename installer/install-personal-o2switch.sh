#!/bin/bash
set -euo pipefail
umask 077

APP_NAME="PulseNotes personnel"
APP_DIR_NAME="pulsenotes"
SUBDOMAIN="pulsenotes"
RELEASE_URL="${PULSENOTES_RELEASE_URL:-https://bulletins.mmi.place/install/pulsenotes-personal.zip}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { printf '\nErreur : %s\n' "$1" >&2; exit 1; }
step() { printf '\n[%s/5] %s\n' "$1" "$2"; }
need() { command -v "$1" >/dev/null 2>&1 || fail "La commande $1 est requise dans le Terminal cPanel o2switch."; }

printf '%s\n' 'Installation o2switch — PulseNotes personnel' 'Cette installation est réservée à un seul étudiant.'
for command in curl unzip php uapi openssl sha256sum; do need "$command"; done

step 1 'Téléchargement et contrôle de la distribution'
curl -fL --proto '=https' --tlsv1.2 "$RELEASE_URL" -o "$TMP_DIR/release.zip" || fail 'Téléchargement impossible.'
curl -fL --proto '=https' --tlsv1.2 "$RELEASE_URL.sha256" -o "$TMP_DIR/release.sha256" || fail 'Somme de contrôle introuvable.'
EXPECTED_HASH="$(awk 'NR==1 {print $1}' "$TMP_DIR/release.sha256")"
ACTUAL_HASH="$(sha256sum "$TMP_DIR/release.zip" | awk '{print $1}')"
[ -n "$EXPECTED_HASH" ] && [ "$EXPECTED_HASH" = "$ACTUAL_HASH" ] || fail 'La vérification SHA-256 de la distribution a échoué.'
unzip -q "$TMP_DIR/release.zip" -d "$TMP_DIR/release"
test -f "$TMP_DIR/release/index.html" || fail 'Archive invalide : index.html absent.'
test -f "$TMP_DIR/release/api/router.php" || fail 'Archive invalide : API absente.'
php -l "$TMP_DIR/release/api/router.php" >/dev/null || fail 'Le proxy PHP téléchargé est invalide.'

step 2 'Détection de votre domaine o2switch'
uapi --output=json DomainInfo list_domains > "$TMP_DIR/domains.json" || fail 'Impossible de lire les domaines cPanel.'
MAIN_DOMAIN="$(php -r '$j=json_decode(file_get_contents($argv[1]),true); echo $j["result"]["data"]["main_domain"] ?? "";' "$TMP_DIR/domains.json")"
[ -n "$MAIN_DOMAIN" ] || fail 'Aucun domaine principal trouvé.'
TARGET_DOMAIN="$SUBDOMAIN.$MAIN_DOMAIN"
printf 'Installation prévue sur https://%s\n' "$TARGET_DOMAIN"
printf 'Continuer ? [O/n] '
read -r answer </dev/tty
case "${answer:-o}" in n|N|non|NON) exit 0;; esac

step 3 'Création du sous-domaine'
DOMAIN_EXISTS="$(TARGET_DOMAIN="$TARGET_DOMAIN" php -r '$j=json_decode(file_get_contents($argv[1]),true); $d=$j["result"]["data"]??[]; $all=array_merge($d["sub_domains"]??[],$d["addon_domains"]??[]); echo in_array(getenv("TARGET_DOMAIN"),$all,true)?"1":"0";' "$TMP_DIR/domains.json")"
if [ "$DOMAIN_EXISTS" != '1' ]; then
  uapi --output=json SubDomain addsubdomain "domain=$SUBDOMAIN" "rootdomain=$MAIN_DOMAIN" "dir=/$APP_DIR_NAME" "disallowdot=1" > "$TMP_DIR/subdomain.json" || fail 'Création du sous-domaine impossible.'
  php -r '$j=json_decode(file_get_contents($argv[1]),true); if(($j["result"]["status"]??0)!=1) exit(1);' "$TMP_DIR/subdomain.json" || fail 'cPanel a refusé le sous-domaine.'
else
  printf 'Le sous-domaine existe déjà, il est conservé.\n'
fi

step 4 'Installation sécurisée de l’application'
APP_DIR="$HOME/$APP_DIR_NAME"
mkdir -p "$APP_DIR"
if [ -f "$APP_DIR/api/config.php" ]; then cp "$APP_DIR/api/config.php" "$TMP_DIR/config.php"; fi
if [ -d "$APP_DIR/api/data" ]; then mkdir -p "$TMP_DIR/data"; cp -a "$APP_DIR/api/data/." "$TMP_DIR/data/"; fi
find "$APP_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "$TMP_DIR/release/." "$APP_DIR/"
mkdir -p "$APP_DIR/api/data"
if [ -f "$TMP_DIR/config.php" ]; then
  cp "$TMP_DIR/config.php" "$APP_DIR/api/config.php"
else
  APP_KEY="$(openssl rand -hex 32)"
  cat > "$APP_DIR/api/config.php" <<PHP
<?php
return [
    'PULSENOTES_INSTANCE_NAME' => 'Mon PulseNotes',
    'PULSENOTES_APP_KEY' => '$APP_KEY',
    'PULSENOTES_SQLITE_PATH' => __DIR__ . '/data/pulsenotes.sqlite',
];
PHP
fi
if [ -d "$TMP_DIR/data" ]; then cp -a "$TMP_DIR/data/." "$APP_DIR/api/data/"; fi
chmod 600 "$APP_DIR/api/config.php"
chmod 700 "$APP_DIR/api/data"
find "$APP_DIR" -type d ! -path "$APP_DIR/api/data" -exec chmod 755 {} +
find "$APP_DIR" -type f ! -path "$APP_DIR/api/config.php" ! -path "$APP_DIR/api/data/*" -exec chmod 644 {} +
chmod 700 "$APP_DIR/api/update.sh" 2>/dev/null || true

step 5 'Vérification'
STATUS_URL="https://$TARGET_DOMAIN/api/status"
if curl -fsS --max-time 20 "$STATUS_URL" | php -r '$j=json_decode(stream_get_contents(STDIN),true); exit(($j["ok"]??false)&&($j["deploymentMode"]??"")==="selfhosted"?0:1);'; then
  printf '\nInstallation terminée : %s\nOuvrez cette adresse pour lancer l’assistant de configuration.\n' "https://$TARGET_DOMAIN"
else
  printf '\nLes fichiers sont installés, mais HTTPS n’est pas encore prêt.\nAttendez l’activation AutoSSL o2switch, puis ouvrez : https://%s\n' "$TARGET_DOMAIN"
fi
