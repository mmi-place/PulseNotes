#!/bin/bash
# =============================================================================
# Installateur terminal générique pour PulseNotes / application cPanel
# =============================================================================
# Ce script :
#   - se connecte au compte cPanel de l’utilisateur courant ;
#   - crée/recrée un sous-domaine et son dossier web ;
#   - télécharge la dernière release personnelle PulseNotes depuis GitHub ;
#   - vérifie son empreinte SHA-256 et la structure de l’archive ;
#   - déploie le frontend React + l’API PHP + SQLite dans le dossier web ;
#   - détecte le PHP CloudLinux sélectionné et vérifie/active au mieux les extensions PHP requises ;
#   - réutilise en priorité un certificat FleetSSL/Let’s Encrypt déjà stocké ;
#   - n’émet un nouveau certificat que si aucun certificat existant n’est trouvé ;
#   - propose --clean pour supprimer l’installation sans la recréer ;
#   - propose --new-cert pour forcer une nouvelle émission Let’s Encrypt ;
#   - propose --demo pour créer une installation de test isolée avec le suffixe demo ;
#   - affiche un spinner animé + temps écoulé pendant les opérations longues ;
#   - propose --debug pour afficher les opérations techniques (secrets masqués).
#
# Pour tester avec un autre projet, modifier UNIQUEMENT la zone CONFIGURATION
# ci-dessous. Les URL et noms importants sont centralisés ici.
# =============================================================================

set -u
umask 077

# ============================ CONFIGURATION ============================
# Nom affiché dans l’interface terminal et la page de test.
APP_DISPLAY_NAME="PulseNotes"

# Nom du dossier créé directement dans $HOME.
APP_DIR_NAME="pulsenotes"

# Préfixe DNS créé devant le domaine principal cPanel.
SUBDOMAIN_NAME="pulsenotes"

# Suffixes appliqués automatiquement avec --demo.
# Exemple : PulseNotes -> PulseNotes Demo
#           pulsenotes -> pulsenotes-demo
DEMO_DISPLAY_SUFFIX=" Demo"
DEMO_DIR_SUFFIX="-demo"
DEMO_SUBDOMAIN_SUFFIX="-demo"

# Laisser vide pour détecter automatiquement le domaine principal du compte.
# Exemple de test : MAIN_DOMAIN_OVERRIDE="example.com"
MAIN_DOMAIN_OVERRIDE=""

# Release personnelle officielle publiée par GitHub Actions.
APP_RELEASE_URL="https://github.com/mmi-place/PulseNotes/releases/latest/download/pulsenotes-personal.zip"
APP_RELEASE_SHA256_URL="${APP_RELEASE_URL}.sha256"

# Connexion cPanel. CPANEL_HOST_OVERRIDE peut aussi être fourni dans l’environnement.
CPANEL_PROTOCOL="https"
CPANEL_PORT="2083"
CPANEL_HOST="${CPANEL_HOST_OVERRIDE:-$(hostname -f 2>/dev/null || hostname)}"
CPANEL_LOGIN_PATH="/login"
CPANEL_UAPI_PREFIX="/execute"
CPANEL_API2_PATH="/json-api/cpanel"

# Plugin Let’s Encrypt™ SSL / FleetSSL.
FLEETSSL_PLUGIN_PATH="/frontend/jupiter/letsencrypt/letsencrypt.live.cgi"
FLEETSSL_API_VERSION="1"
FLEETSSL_API_ISSUE="issue-certificate"
FLEETSSL_API_REMOVE="remove-certificate"
FLEETSSL_API_REINSTALL="reinstall-certificate"

# Paramètres utilisés uniquement lors d’une NOUVELLE émission.
SSL_CHALLENGE_METHOD="http-01"
SSL_KEY_TYPE="rsa:2048"
SSL_PREFERRED_ISSUER=""

# Protocoles utilisés pour vérifier le site.
SITE_HTTP_PROTOCOL="http"
SITE_HTTPS_PROTOCOL="https"
# ========================== FIN CONFIGURATION ==========================

TOTAL_STEPS=12
DEBUG=0
MODE="install"
FORCE_NEW_CERT=0
DEMO_MODE=0
CPANEL_USER="${USER:-$(id -un)}"

TMP_DIR=""
COOKIE_FILE=""
HEADER_FILE=""
LOGIN_FILE=""
DOMAINS_FILE=""
API_FILE=""
SSL_FILE=""
APP_ARCHIVE_FILE=""
APP_CHECKSUM_FILE=""
PRESERVED_CONFIG_FILE=""
PRESERVED_DATA_DIR=""
PRESERVED_RUNTIME_DIR=""
PHP_SELECTOR_VERSION=""
PHP_SELECTOR_CGI=""
PHP_EXTENSIONS_ACTIVE=0
PHP_EXTENSIONS_TOTAL=8
PHP_EXTENSIONS_INACTIVE=""
SECURITY_TOKEN=""
MAIN_DOMAIN=""
TARGET_DOMAIN=""
TUI_ACTIVE=0
TTY_AVAILABLE=0
CURRENT_STEP=0
CURRENT_TITLE="Préparation"
CURRENT_PERCENT=0
CURRENT_STATUS="Initialisation..."
SPINNER_PID=""
SPINNER_ACTIVE=0

ESC=$'\033'
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
RED="${ESC}[31m"
GREEN="${ESC}[32m"
YELLOW="${ESC}[33m"
BLUE="${ESC}[34m"
CYAN="${ESC}[36m"
WHITE="${ESC}[97m"
BG_BLUE="${ESC}[44m"
BG_GREEN="${ESC}[42m"
BG_RED="${ESC}[41m"

# Ouvre le terminal utilisateur sur le descripteur 3.
# C'est indispensable pour permettre les saisies interactives même lorsque
# le script est exécuté avec : curl -fsSL https://... | bash
# Dans ce cas, stdin (fd 0) contient le script et ne doit pas servir au clavier.
if [ -r /dev/tty ] && [ -w /dev/tty ]; then
  if exec 3<>/dev/tty 2>/dev/null; then
    TTY_AVAILABLE=1
  fi
fi

usage() {
  printf '%s\n' \
    "Usage : $0 [--debug] [--clean] [--new-cert] [--demo] [--help]" \
    "" \
    "  --debug      désactive l’interface plein écran et affiche les détails techniques" \
    "  --clean      supprime ${APP_DISPLAY_NAME} sans le réinstaller" \
    "  --new-cert   force une nouvelle émission Let’s Encrypt au lieu de réutiliser le certificat stocké" \
    "  --demo       utilise un nom, dossier et sous-domaine suffixés par demo" \
    "  --help       affiche cette aide"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --debug|-d)
      DEBUG=1
      ;;
    --clean)
      if [ "$FORCE_NEW_CERT" = "1" ]; then
        echo "Les options --clean et --new-cert ne peuvent pas être combinées." >&2
        exit 1
      fi
      MODE="clean"
      TOTAL_STEPS=5
      ;;
    --new-cert)
      if [ "$MODE" = "clean" ]; then
        echo "Les options --clean et --new-cert ne peuvent pas être combinées." >&2
        exit 1
      fi
      FORCE_NEW_CERT=1
      ;;
    --demo)
      DEMO_MODE=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Option inconnue : $1"
      usage
      exit 1
      ;;
  esac
  shift
done

# --demo ne modifie jamais les valeurs de la zone CONFIGURATION sur disque.
# Les suffixes sont appliqués uniquement en mémoire pour cette exécution.
if [ "$DEMO_MODE" = "1" ]; then
  APP_DISPLAY_NAME="${APP_DISPLAY_NAME}${DEMO_DISPLAY_SUFFIX}"
  APP_DIR_NAME="${APP_DIR_NAME}${DEMO_DIR_SUFFIX}"
  SUBDOMAIN_NAME="${SUBDOMAIN_NAME}${DEMO_SUBDOMAIN_SUFFIX}"
fi

# Valeurs dérivées : toujours calculées après traitement des options afin que
# --demo s'applique de façon cohérente au dossier, au domaine et à l'interface.
APP_DIR="$HOME/$APP_DIR_NAME"
CPANEL_ORIGIN="${CPANEL_PROTOCOL}://${CPANEL_HOST}:${CPANEL_PORT}"
CPANEL_LOGIN_URL="${CPANEL_ORIGIN}${CPANEL_LOGIN_PATH}"

validate_config() {
  case "$APP_DIR_NAME" in
    ""|"."|".."|*/*)
      echo "Configuration invalide : APP_DIR_NAME doit être un simple nom de dossier." >&2
      exit 2
      ;;
  esac

  case "$SUBDOMAIN_NAME" in
    ""|.*|*[^A-Za-z0-9-]*|-*|*-)
      echo "Configuration invalide : SUBDOMAIN_NAME n’est pas un label DNS valide." >&2
      exit 2
      ;;
  esac

  if [ "${#SUBDOMAIN_NAME}" -gt 63 ]; then
    echo "Configuration invalide : SUBDOMAIN_NAME dépasse 63 caractères." >&2
    exit 2
  fi

  if [ -z "$APP_DISPLAY_NAME" ]; then
    echo "Configuration invalide : APP_DISPLAY_NAME ne peut pas être vide." >&2
    exit 2
  fi

  case "$APP_RELEASE_URL" in
    https://github.com/mmi-place/PulseNotes/releases/*) : ;;
    *)
      echo "Configuration invalide : APP_RELEASE_URL doit pointer vers une release GitHub PulseNotes." >&2
      exit 2
      ;;
  esac

  case "$APP_RELEASE_SHA256_URL" in
    https://github.com/mmi-place/PulseNotes/releases/*) : ;;
    *)
      echo "Configuration invalide : APP_RELEASE_SHA256_URL doit pointer vers une release GitHub PulseNotes." >&2
      exit 2
      ;;
  esac

  if [ -z "$CPANEL_HOST" ] || [ -z "$CPANEL_PROTOCOL" ] || [ -z "$CPANEL_PORT" ]; then
    echo "Configuration invalide : paramètres cPanel incomplets." >&2
    exit 2
  fi

  if [ "$APP_DIR" = "$HOME" ] || [ "$APP_DIR" = "/" ]; then
    echo "Configuration dangereuse refusée : APP_DIR pointe vers un dossier critique." >&2
    exit 2
  fi
}

validate_config

cleanup() {
  spinner_stop 2>/dev/null || true

  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi

  unset CPANEL_PASS FORM_DATA SSL_PAYLOAD

  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[?25h${ESC}[?1049l"
    TUI_ACTIVE=0
  fi
}

trap cleanup EXIT
trap 'exit 130' INT TERM

supports_tui() {
  [ "$TTY_AVAILABLE" = "1" ] && [ -t 1 ] && [ "${TERM:-dumb}" != "dumb" ]
}

repeat_char() {
  local char="$1"
  local count="$2"
  local out=""
  local i=0

  while [ "$i" -lt "$count" ]; do
    out="${out}${char}"
    i=$((i + 1))
  done

  printf '%s' "$out"
}

progress_bar() {
  local percent="$1"
  local color="${2:-$GREEN}"
  local width=38
  local filled=$((percent * width / 100))
  local empty=$((width - filled))

  printf '%s' "$color"
  repeat_char '█' "$filled"
  printf '%s' "${DIM}"
  repeat_char '░' "$empty"
  printf '%s' "${RESET}"
}

tui_start() {
  if [ "$DEBUG" = "0" ] && supports_tui; then
    printf '%s' "${ESC}[?1049h${ESC}[2J${ESC}[H${ESC}[?25l"
    TUI_ACTIVE=1
  fi
}

tui_stop() {
  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[?25h${ESC}[?1049l"
    TUI_ACTIVE=0
  fi
}

render_ui() {
  if [ "$TUI_ACTIVE" != "1" ]; then
    return 0
  fi

  printf '%s' "${ESC}[H${ESC}[2J"
  printf '  %s%s Installateur %s %s\n' "$BG_BLUE" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
  printf '\n'
  printf '  %sCompte%s      %s\n' "$DIM" "$RESET" "$CPANEL_USER"
  printf '  %sServeur%s     %s\n' "$DIM" "$RESET" "$CPANEL_HOST"
  printf '\n'
  printf '  %sÉtape %d/%d%s  %s%s%s\n' "$CYAN$BOLD" "$CURRENT_STEP" "$TOTAL_STEPS" "$RESET" "$BOLD" "$CURRENT_TITLE" "$RESET"
  printf '\n'
  printf '  '
  progress_bar "$CURRENT_PERCENT"
  printf '  %3d%%\n' "$CURRENT_PERCENT"
  printf '\n'
  printf '  %s%s%s\n' "$YELLOW" "$CURRENT_STATUS" "$RESET"
  printf '\n'
  printf '  %sNe fermez pas cette fenêtre pendant l’installation.%s\n' "$DIM" "$RESET"
}

set_step() {
  CURRENT_STEP="$1"
  CURRENT_TITLE="$2"
  CURRENT_PERCENT="$3"
  CURRENT_STATUS="$4"

  if [ "$TUI_ACTIVE" = "1" ]; then
    render_ui
  else
    printf '\n[%d/%d] %s\n' "$CURRENT_STEP" "$TOTAL_STEPS" "$CURRENT_TITLE"
    printf '  %s\n' "$CURRENT_STATUS"
  fi
}

set_status() {
  CURRENT_STATUS="$1"
  CURRENT_PERCENT="${2:-$CURRENT_PERCENT}"

  if [ "$TUI_ACTIVE" = "1" ]; then
    render_ui
  elif [ "$DEBUG" = "1" ]; then
    printf '  → %s\n' "$CURRENT_STATUS"
  fi
}

# Animation d'attente pour les opérations réseau / cPanel longues.
# En mode TUI, seule la ligne de statut est redessinée : l'écran ne défile pas.
# En --debug, le spinner est désactivé afin de laisser les logs lisibles.
spinner_start() {
  local message="$1"

  if [ "$DEBUG" = "1" ] || [ "$TTY_AVAILABLE" != "1" ]; then
    return 0
  fi

  spinner_stop 2>/dev/null || true
  SPINNER_ACTIVE=1

  (
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local index=0
    local started now elapsed frame
    started="$(date +%s)"

    while true; do
      now="$(date +%s)"
      elapsed=$((now - started))
      frame="${frames[$((index % ${#frames[@]}))]}"

      if [ "$TUI_ACTIVE" = "1" ]; then
        # La ligne de statut de render_ui est la ligne 10.
        printf '%s' "${ESC}[10;1H${ESC}[2K" >&3
        printf '  %s%s%s %s  %s%ss%s' \
          "$CYAN" "$frame" "$RESET" "$message" "$DIM" "$elapsed" "$RESET" >&3
      else
        printf '\r%s' "${ESC}[2K" >&3
        printf '  %s%s%s %s  %s%ss%s' \
          "$CYAN" "$frame" "$RESET" "$message" "$DIM" "$elapsed" "$RESET" >&3
      fi

      index=$((index + 1))
      sleep 0.12
    done
  ) &

  SPINNER_PID=$!
}

spinner_stop() {
  if [ -n "${SPINNER_PID:-}" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
  fi

  SPINNER_ACTIVE=0

  if [ "$DEBUG" = "0" ] && [ "$TTY_AVAILABLE" = "1" ]; then
    if [ "$TUI_ACTIVE" = "1" ]; then
      # Restaure l'affichage statique de l'étape en cours.
      render_ui
    else
      printf '\r%s' "${ESC}[2K" >&3
    fi
  fi
}

debug() {
  if [ "$DEBUG" = "1" ]; then
    printf '    [debug] %s\n' "$*"
  fi
}

debug_json() {
  local file="$1"
  local label="$2"

  if [ "$DEBUG" != "1" ] || [ ! -s "$file" ]; then
    return 0
  fi

  printf '    [debug] %s :\n' "$label"

  python3 -c '
import json
import sys

path = sys.argv[1]
try:
    data = json.load(open(path, encoding="utf-8"))
except Exception:
    print("      <réponse non JSON>")
    raise SystemExit(0)

secret_parts = ("password", "pass", "cookie", "privkey", "private_key", "privatekey")
large_parts = ("cert_pem", "issuer_pem", "certificate_pem")

def clean(value):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            low = str(key).lower()
            if any(part in low for part in secret_parts):
                result[key] = "<masqué>"
            elif any(part in low for part in large_parts):
                result[key] = "<certificat masqué>"
            else:
                result[key] = clean(item)
        return result
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value

for line in json.dumps(clean(data), indent=2, ensure_ascii=False).splitlines():
    print("      " + line)
' "$file"
}

fatal() {
  local message="$1"

  if [ "$TUI_ACTIVE" = "1" ]; then
    CURRENT_STATUS="$message"
    render_ui
    printf '\n  %s%sÉchec de l’installation%s\n' "$RED" "$BOLD" "$RESET"
    printf '  %s\n' "$message"
    printf '\n  %sRelancez avec --debug pour voir les détails.%s\n' "$DIM" "$RESET"
    printf '\n  Appuyez sur Entrée pour quitter...'
    printf '%s' "${ESC}[?25h"
    read -r _ <&3 || true
    tui_stop
  else
    printf '  ✗ %s\n' "$message" >&2
  fi

  exit 1
}

success_screen() {
  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[H${ESC}[2J"
    printf '  %s%s Installateur %s %s\n' "$BG_GREEN" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
    printf '\n'
    printf '  %s%s✓ Installation terminée%s\n' "$GREEN" "$BOLD" "$RESET"
    printf '\n'
    printf '  %s%s%s Installer%s\n' "$BOLD" "$WHITE" "$APP_DISPLAY_NAME" "$RESET"
    printf '  Ouvre la page suivante pour utiliser l’application :\n'
    printf '\n'
    printf '  %s%s╭────────────────────────────────────────────────────────────╮%s\n' "$CYAN" "$BOLD" "$RESET"
    printf '  %s%s│  %s://%-46s │%s\n' "$CYAN" "$BOLD" "$SITE_HTTPS_PROTOCOL" "$TARGET_DOMAIN" "$RESET"
    printf '  %s%s╰────────────────────────────────────────────────────────────╯%s\n' "$CYAN" "$BOLD" "$RESET"
    printf '\n'
    printf '  %s%s se trouve dans le dossier :%s\n' "$DIM" "$APP_DISPLAY_NAME" "$RESET"
    printf '  %s%s%s%s\n' "$DIM" "$BOLD" "$APP_DIR" "$RESET"
    printf '  %sNe pas toucher à ce dossier.%s\n' "$DIM" "$RESET"
    printf '\n'
    printf '  %sAppuie sur Entrée pour quitter.%s' "$DIM" "$RESET"
    printf '%s' "${ESC}[?25h"
    read -r _ <&3 || true
    tui_stop
  else
    printf '\n✓ Installation terminée\n'
    printf '%s Installer — ouvre : %s://%s\n' "$APP_DISPLAY_NAME" "$SITE_HTTPS_PROTOCOL" "$TARGET_DOMAIN"
    printf '%s se trouve dans le dossier %s — ne pas toucher au dossier.\n' "$APP_DISPLAY_NAME" "$APP_DIR"
  fi
}

clean_success_screen() {
  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[H${ESC}[2J"
    printf '  %s%s Installateur %s %s\n' "$BG_GREEN" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
    printf '\n'
    printf '  %s%s✓ Nettoyage terminé%s\n' "$GREEN" "$BOLD" "$RESET"
    printf '\n'
    printf '  %s a été supprimé de ce compte.\n' "$APP_DISPLAY_NAME"
    printf '\n'
    printf '  %sSous-domaine supprimé : %s%s\n' "$DIM" "$TARGET_DOMAIN" "$RESET"
    printf '  %sDossier supprimé : %s%s\n' "$DIM" "$APP_DIR" "$RESET"
    printf '\n'
    printf '  %sAppuie sur Entrée pour quitter.%s' "$DIM" "$RESET"
    printf '%s' "${ESC}[?25h"
    read -r _ <&3 || true
    tui_stop
  else
    printf '\n✓ Nettoyage terminé\n'
    printf 'Sous-domaine : %s\n' "$TARGET_DOMAIN"
    printf 'Dossier : %s\n' "$APP_DIR"
  fi
}

cert_success_screen() {
  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[H${ESC}[2J"
    printf '  %s%s Installateur %s %s\n' "$BG_GREEN" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
    printf '\n'
    printf '  %s%s✓ Certificat réinstallé%s\n' "$GREEN" "$BOLD" "$RESET"
    printf '\n'
    printf '  Le certificat SSL existant a été réinstallé sans nouvelle émission Let’s Encrypt.\n'
    printf '\n'
    printf '  %s%s╭────────────────────────────────────────────────────────────╮%s\n' "$CYAN" "$BOLD" "$RESET"
    printf '  %s%s│  %s://%-46s │%s\n' "$CYAN" "$BOLD" "$SITE_HTTPS_PROTOCOL" "$TARGET_DOMAIN" "$RESET"
    printf '  %s%s╰────────────────────────────────────────────────────────────╯%s\n' "$CYAN" "$BOLD" "$RESET"
    printf '\n'
    printf '  %sAppuie sur Entrée pour quitter.%s' "$DIM" "$RESET"
    printf '%s' "${ESC}[?25h"
    read -r _ <&3 || true
    tui_stop
  else
    printf '\n✓ Certificat SSL réinstallé\n'
    printf '%s://%s\n' "$SITE_HTTPS_PROTOCOL" "$TARGET_DOMAIN"
  fi
}

auth_error_screen() {
  local message="${1:-Mot de passe incorrect}"
  local key=""

  if [ "$TUI_ACTIVE" = "1" ]; then
    while true; do
      printf '%s' "${ESC}[H${ESC}[2J"
      printf '  %s%s Installateur %s %s\n' "$BG_RED" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
      printf '\n'
      printf '  %sCompte%s      %s\n' "$DIM" "$RESET" "$CPANEL_USER"
      printf '  %sServeur%s     %s\n' "$DIM" "$RESET" "$CPANEL_HOST"
      printf '\n'
      printf '  %s%sConnexion impossible%s\n' "$RED" "$BOLD" "$RESET"
      printf '\n  '
      progress_bar 100 "$RED"
      printf '  %s100%%%s\n' "$RED$BOLD" "$RESET"
      printf '\n'
      printf '  %s%s╭────────────────────────────────────────────────────────────╮%s\n' "$RED" "$BOLD" "$RESET"
      printf '  %s%s│  %-58s│%s\n' "$RED" "$BOLD" "$message" "$RESET"
      printf '  %s%s╰────────────────────────────────────────────────────────────╯%s\n' "$RED" "$BOLD" "$RESET"
      printf '\n'
      printf '  %sESPACE%s  Réessayer      %sENTRÉE%s  Quitter\n' "$BOLD" "$RESET" "$BOLD" "$RESET"
      printf '  %s1  Changer l’identifiant%s\n' "$DIM" "$RESET"
      printf '%s' "${ESC}[?25h"
      IFS= read -rsn1 key <&3 || key=""
      printf '%s' "${ESC}[?25l"

      case "$key" in
        ' ') AUTH_ACTION="retry"; return 0 ;;
        '1') AUTH_ACTION="change_user"; return 0 ;;
        '') AUTH_ACTION="quit"; return 0 ;;
      esac
    done
  fi

  printf '\n✗ %s\n' "$message" >&2
  printf 'Espace = réessayer, Entrée = quitter, 1 = changer l’identifiant : ' >&2
  IFS= read -rsn1 key <&3 || key=""
  printf '\n' >&2
  case "$key" in
    ' ') AUTH_ACTION="retry" ;;
    '1') AUTH_ACTION="change_user" ;;
    *) AUTH_ACTION="quit" ;;
  esac
}

change_username() {
  local new_user=""

  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[H${ESC}[2J"
    printf '  %s%s Installateur %s %s\n' "$BG_BLUE" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
    printf '\n'
    printf '  %sChanger l’identifiant cPanel%s\n' "$BOLD" "$RESET"
    printf '\n'
    printf '  Nouvel identifiant [%s] : ' "$CPANEL_USER"
    printf '%s' "${ESC}[?25h"
    IFS= read -r new_user <&3 || true
    printf '%s' "${ESC}[?25l"
  else
    read -rp "Nouvel identifiant cPanel [$CPANEL_USER] : " new_user <&3
  fi

  if [ -n "$new_user" ]; then
    CPANEL_USER="$new_user"
  fi
}

read_password_masked() {
  local prompt="Mot de passe cPanel"
  local password=""
  local char=""

  if [ "$TUI_ACTIVE" = "1" ]; then
    printf '%s' "${ESC}[H${ESC}[2J"
    printf '  %s%s Installateur %s %s\n' "$BG_BLUE" "$WHITE$BOLD" "$APP_DISPLAY_NAME" "$RESET"
    printf '\n'
    printf '  %sCompte%s      %s\n' "$DIM" "$RESET" "$CPANEL_USER"
    printf '  %sServeur%s     %s\n' "$DIM" "$RESET" "$CPANEL_HOST"
    printf '\n'
    printf '  %sConnexion à cPanel%s\n' "$BOLD" "$RESET"
    printf '\n'
    printf '  %s : ' "$prompt"
    printf '%s' "${ESC}[?25h"

    while IFS= read -rsn1 char <&3; do
      if [ -z "$char" ]; then
        break
      fi

      case "$char" in
        $'\177'|$'\b')
          if [ -n "$password" ]; then
            password="${password%?}"
            printf '\b \b'
          fi
          ;;
        *)
          password="${password}${char}"
          printf '*'
          ;;
      esac
    done

    printf '\n'
    printf '%s' "${ESC}[?25l"
  else
    read -rsp "Mot de passe cPanel pour $CPANEL_USER : " password <&3
    printf '\n'
  fi

  CPANEL_PASS="$password"
}

uapi_get() {
  local module="$1"
  local function="$2"
  local outfile="$3"
  shift 3

  local url="${CPANEL_ORIGIN}/${SECURITY_TOKEN}${CPANEL_UAPI_PREFIX}/${module}/${function}"
  local args=(
    -sS
    --connect-timeout 10
    --max-time 60
    -b "$COOKIE_FILE"
    -G
    -o "$outfile"
    -w '%{http_code}'
  )
  local parameter

  for parameter in "$@"; do
    args+=(--data-urlencode "$parameter")
  done

  debug "UAPI GET ${module}/${function}"
  for parameter in "$@"; do
    debug "paramètre : $parameter"
  done

  LAST_HTTP="$(curl "${args[@]}" "$url")"
  debug "HTTP : $LAST_HTTP"
  debug_json "$outfile" "réponse UAPI"
}

api2_get() {
  local module="$1"
  local function="$2"
  local outfile="$3"
  shift 3

  local url="${CPANEL_ORIGIN}/${SECURITY_TOKEN}${CPANEL_API2_PATH}"
  local args=(
    -sS
    --connect-timeout 10
    --max-time 60
    -b "$COOKIE_FILE"
    -G
    -o "$outfile"
    -w '%{http_code}'
    --data-urlencode "cpanel_jsonapi_user=$CPANEL_USER"
    --data-urlencode "cpanel_jsonapi_apiversion=2"
    --data-urlencode "cpanel_jsonapi_module=$module"
    --data-urlencode "cpanel_jsonapi_func=$function"
  )
  local parameter

  for parameter in "$@"; do
    args+=(--data-urlencode "$parameter")
  done

  debug "API2 GET ${module}/${function}"
  for parameter in "$@"; do
    debug "paramètre : $parameter"
  done

  LAST_HTTP="$(curl "${args[@]}" "$url")"
  debug "HTTP : $LAST_HTTP"
  debug_json "$outfile" "réponse API2"
}

uapi_ok() {
  python3 -c '
import json
import sys
try:
    obj = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)
result = obj.get("result", obj)
raise SystemExit(0 if result.get("status") in (1, True, "1") else 1)
' "$1"
}

api2_ok() {
  python3 -c '
import json
import sys
try:
    obj = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)
result = obj.get("cpanelresult", {})
event_ok = result.get("event", {}).get("result") in (1, True, "1")
data = result.get("data") or []
data_ok = True
if data and isinstance(data, list) and isinstance(data[0], dict):
    data_ok = data[0].get("result") in (1, True, "1")
raise SystemExit(0 if event_ok and data_ok else 1)
' "$1"
}

fleet_url() {
  printf '%s' "${CPANEL_ORIGIN}/${SECURITY_TOKEN}${FLEETSSL_PLUGIN_PATH}"
}

fleet_remove_old_cert() {
  local url
  local payload
  url="$(fleet_url)"

  payload="$(python3 -c '
import json
import sys
print(json.dumps({"virtual_host": sys.argv[1]}))
' "$TARGET_DOMAIN")"

  debug "FleetSSL POST remove-certificate"
  debug "virtual_host : $TARGET_DOMAIN"

  LAST_HTTP="$(printf '%s' "$payload" | curl \
    -sS \
    --connect-timeout 10 \
    --max-time 120 \
    -b "$COOKIE_FILE" \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    -X POST \
    --data-binary @- \
    -o "$API_FILE" \
    -w '%{http_code}' \
    "${url}?api_version=${FLEETSSL_API_VERSION}&api_function=${FLEETSSL_API_REMOVE}")"

  debug "HTTP : $LAST_HTTP"
  debug_json "$API_FILE" "réponse suppression SSL"

  if [ "$LAST_HTTP" = "200" ]; then
    return 0
  fi

  if [ "$LAST_HTTP" = "404" ]; then
    return 0
  fi

  return 1
}

fleet_reinstall_cert() {
  local url
  local payload
  url="$(fleet_url)"

  payload="$(python3 -c '
import json
import sys
print(json.dumps({
    "virtual_host": sys.argv[1],
    "preferred_issuer": sys.argv[2]
}))
' "$TARGET_DOMAIN" "$SSL_PREFERRED_ISSUER")"

  debug "FleetSSL POST reinstall-certificate"
  debug "virtual_host : $TARGET_DOMAIN"

  LAST_HTTP="$(printf '%s' "$payload" | curl \
    -sS \
    --connect-timeout 10 \
    --max-time 120 \
    -b "$COOKIE_FILE" \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    -X POST \
    --data-binary @- \
    -o "$SSL_FILE" \
    -w '%{http_code}' \
    "${url}?api_version=${FLEETSSL_API_VERSION}&api_function=${FLEETSSL_API_REINSTALL}")"

  debug "HTTP : $LAST_HTTP"
  debug_json "$SSL_FILE" "réponse réinstallation SSL"

  [ "$LAST_HTTP" = "200" ] || return 1

  python3 -c '
import json
import sys
try:
    obj = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if obj.get("success") is True else 1)
' "$SSL_FILE"
}

fleet_issue_cert() {
  local url
  url="$(fleet_url)"

  SSL_PAYLOAD="$(python3 -c '
import json
import sys

domain = sys.argv[1]
print(json.dumps({
    "virtual_host": domain,
    "dns_identifiers": [domain],
    "challenge_method": sys.argv[2],
    "preferred_issuer_cn": sys.argv[3],
    "dry_run": False,
    "key_type": sys.argv[4]
}))
' "$TARGET_DOMAIN" "$SSL_CHALLENGE_METHOD" "$SSL_PREFERRED_ISSUER" "$SSL_KEY_TYPE")"

  if [ -z "$SSL_PAYLOAD" ]; then
    debug "Erreur : payload SSL vide avant l’appel FleetSSL"
    return 1
  fi

  debug "FleetSSL POST issue-certificate"
  debug "virtual_host : $TARGET_DOMAIN"
  debug "dns_identifiers : [$TARGET_DOMAIN]"
  debug "challenge_method : $SSL_CHALLENGE_METHOD"
  debug "key_type : $SSL_KEY_TYPE"

  LAST_HTTP="$(printf '%s' "$SSL_PAYLOAD" | curl \
    -sS \
    --connect-timeout 10 \
    --max-time 180 \
    -b "$COOKIE_FILE" \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    -X POST \
    --data-binary @- \
    -o "$SSL_FILE" \
    -w '%{http_code}' \
    "${url}?api_version=${FLEETSSL_API_VERSION}&api_function=${FLEETSSL_API_ISSUE}")"

  unset SSL_PAYLOAD
  debug "HTTP : $LAST_HTTP"
  debug_json "$SSL_FILE" "réponse émission SSL"

  [ "$LAST_HTTP" = "200" ] || return 1

  python3 -c '
import json
import sys
try:
    obj = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if obj.get("success") is True else 1)
' "$SSL_FILE"
}

download_release_archive() {
  local archive_size="0"

  debug "Téléchargement de la release personnelle PulseNotes"
  debug "Archive : $APP_RELEASE_URL"
  debug "SHA-256 : $APP_RELEASE_SHA256_URL"
  debug "Fichier temporaire : $APP_ARCHIVE_FILE"

  LAST_HTTP="$(curl \
    -sS \
    -L \
    --fail \
    --proto '=https' \
    --tlsv1.2 \
    --connect-timeout 10 \
    --max-time 180 \
    -o "$APP_ARCHIVE_FILE" \
    -w '%{http_code}' \
    "$APP_RELEASE_URL" \
    || true)"

  debug "HTTP archive : $LAST_HTTP"

  if [ -f "$APP_ARCHIVE_FILE" ]; then
    archive_size="$(wc -c < "$APP_ARCHIVE_FILE" 2>/dev/null | tr -d '[:space:]')"
    archive_size="${archive_size:-0}"
  fi
  debug "Taille archive : ${archive_size} octets"

  if [ "$LAST_HTTP" != "200" ] || [ ! -s "$APP_ARCHIVE_FILE" ]; then
    return 1
  fi

  LAST_HTTP="$(curl \
    -sS \
    -L \
    --fail \
    --proto '=https' \
    --tlsv1.2 \
    --connect-timeout 10 \
    --max-time 60 \
    -o "$APP_CHECKSUM_FILE" \
    -w '%{http_code}' \
    "$APP_RELEASE_SHA256_URL" \
    || true)"

  debug "HTTP SHA-256 : $LAST_HTTP"
  if [ "$LAST_HTTP" != "200" ] || [ ! -s "$APP_CHECKSUM_FILE" ]; then
    return 2
  fi

  if ! python3 - "$APP_ARCHIVE_FILE" "$APP_CHECKSUM_FILE" <<'PY'
import hashlib
import re
import sys

archive, checksum_file = sys.argv[1:3]
text = open(checksum_file, encoding="ascii", errors="strict").read().strip()
match = re.match(r"^([0-9a-fA-F]{64})(?:\s+.+)?$", text)
if not match:
    raise SystemExit(2)
expected = match.group(1).lower()
h = hashlib.sha256()
with open(archive, "rb") as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
        h.update(chunk)
raise SystemExit(0 if h.hexdigest() == expected else 1)
PY
  then
    return 3
  fi

  if ! python3 - "$APP_ARCHIVE_FILE" <<'PY'
import pathlib
import stat
import sys
import zipfile

archive = sys.argv[1]
required = {
    "index.html",
    ".htaccess",
    "api/index.php",
    "api/router.php",
    "api/config.php",
    "api/.htaccess",
    "api/update.sh",
}

try:
    with zipfile.ZipFile(archive) as z:
        names = {name.rstrip("/") for name in z.namelist()}
        missing = sorted(required - names)
        if missing:
            print("Fichiers manquants dans la release : " + ", ".join(missing), file=sys.stderr)
            raise SystemExit(4)

        for info in z.infolist():
            raw = info.filename.replace("\\", "/")
            path = pathlib.PurePosixPath(raw)
            if path.is_absolute() or ".." in path.parts:
                print("Chemin ZIP dangereux : " + info.filename, file=sys.stderr)
                raise SystemExit(5)
            mode = (info.external_attr >> 16) & 0o170000
            if mode == stat.S_IFLNK:
                print("Lien symbolique refusé dans la release : " + info.filename, file=sys.stderr)
                raise SystemExit(6)

        bad = z.testzip()
        if bad is not None:
            print("Entrée ZIP corrompue : " + bad, file=sys.stderr)
            raise SystemExit(7)
except zipfile.BadZipFile:
    raise SystemExit(8)
PY
  then
    return 4
  fi

  debug "Archive PulseNotes et empreinte SHA-256 vérifiées"
  return 0
}

extract_release_archive() {
  local archive="$1"
  local destination="$2"

  python3 - "$archive" "$destination" <<'PY'
import pathlib
import shutil
import sys
import zipfile

archive, destination = sys.argv[1:3]
root = pathlib.Path(destination).resolve()
root.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(archive) as z:
    for info in z.infolist():
        raw = info.filename.replace("\\", "/")
        rel = pathlib.PurePosixPath(raw)
        if rel.is_absolute() or ".." in rel.parts:
            raise SystemExit("Chemin ZIP dangereux refusé : " + info.filename)
        if not rel.parts:
            continue
        target = root.joinpath(*rel.parts)
        resolved = target.resolve()
        try:
            resolved.relative_to(root)
        except ValueError:
            raise SystemExit("Extraction hors dossier refusée : " + info.filename)
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with z.open(info, "r") as src, open(target, "wb") as dst:
            shutil.copyfileobj(src, dst)
PY
}

write_personal_config() {
  local config_file="$1"
  local instance_name="$2"
  local app_key

  app_key="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  [ -n "$app_key" ] || return 1

  python3 - "$config_file" "$instance_name" "$app_key" <<'PY'
import sys

path, name, key = sys.argv[1:4]
def php_single(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")

content = """<?php
return [
    'PULSENOTES_INSTANCE_NAME' => '%s',
    'PULSENOTES_APP_KEY' => '%s',
    'PULSENOTES_SQLITE_PATH' => __DIR__ . '/data/pulsenotes.sqlite',
];
""" % (php_single(name), php_single(key))
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
PY
}

validate_status_json() {
  python3 -c '
import json
import sys
try:
    obj = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if obj.get("deploymentMode") == "selfhosted" else 1)
'
}

configure_php_extensions() {
  local selector_info=""
  local selector_extensions_file="$TMP_DIR/php-selector-extensions.txt"
  local selector_log=""
  local module=""
  local module_state=""
  local loaded_after=""
  local inactive_list=""
  local -a required_extensions=(curl dom imagick libxml session pdo pdo_sqlite zip)

  PHP_EXTENSIONS_ACTIVE=0
  PHP_EXTENSIONS_TOTAL="${#required_extensions[@]}"
  PHP_EXTENSIONS_INACTIVE=""

  # Détecte d'abord le PHP CloudLinux sélectionné. Si selectorctl n'existe pas,
  # on tente quand même une vérification avec php-cgi/php, sans rendre l'étape bloquante.
  if command -v selectorctl >/dev/null 2>&1; then
    selector_info="$(selectorctl --user-current 2>/dev/null || true)"
    PHP_SELECTOR_VERSION="$(printf '%s\n' "$selector_info" | awk 'NR==1 {print $1}')"
    PHP_SELECTOR_CGI="$(printf '%s\n' "$selector_info" | awk 'NR==1 {print $3}')"

    debug "PHP Selector : ${selector_info:-<aucune réponse>}"
    debug "Version PHP sélectionnée : ${PHP_SELECTOR_VERSION:-<inconnue>}"
    debug "Binaire PHP CGI : ${PHP_SELECTOR_CGI:-<inconnu>}"
  else
    debug "PHP Selector : selectorctl est introuvable ; activation automatique impossible"
  fi

  # Repli non bloquant si CloudLinux ne fournit pas un chemin exploitable.
  if [ -z "$PHP_SELECTOR_CGI" ] || [ ! -x "$PHP_SELECTOR_CGI" ]; then
    PHP_SELECTOR_CGI="$(command -v php-cgi 2>/dev/null || command -v php 2>/dev/null || true)"
    if [ -n "$PHP_SELECTOR_CGI" ]; then
      debug "PHP de repli utilisé pour la vérification : $PHP_SELECTOR_CGI"
    fi
  fi

  # Sans binaire PHP, impossible de vérifier. On journalise puis on continue.
  if [ -z "$PHP_SELECTOR_CGI" ] || [ ! -x "$PHP_SELECTOR_CGI" ]; then
    PHP_EXTENSIONS_INACTIVE="curl, dom, imagick, libxml, session, pdo, pdo_sqlite, zip"
    debug "Extensions PHP : aucun binaire PHP exécutable trouvé ; vérification ignorée"
    return 0
  fi

  : > "$selector_extensions_file"
  if command -v selectorctl >/dev/null 2>&1 && [ -n "$PHP_SELECTOR_VERSION" ]; then
    selectorctl --list-user-extensions \
      --version="$PHP_SELECTOR_VERSION" \
      --all >"$selector_extensions_file" 2>/dev/null || true
  fi

  for module in "${required_extensions[@]}"; do
    # La vérité finale est ce que charge réellement le PHP sélectionné.
    if "$PHP_SELECTOR_CGI" -m 2>/dev/null | grep -Fqix "$module"; then
      PHP_EXTENSIONS_ACTIVE=$((PHP_EXTENSIONS_ACTIVE + 1))
      debug "Extension PHP $module : déjà active"
      continue
    fi

    module_state=""
    if [ -s "$selector_extensions_file" ]; then
      module_state="$(awk -v ext="$module" '$2 == ext {print $1; exit}' "$selector_extensions_file")"
    fi

    if [ -z "$module_state" ]; then
      debug "Extension PHP $module : non chargée et non proposée par PHP Selector ; ignorée"
    else
      selector_log="$TMP_DIR/selectorctl-${module}.log"
      : > "$selector_log"
      debug "Extension PHP $module : tentative d’activation (état Selector : $module_state)"

      # Dans CageFS, selectorctl agit sur l'utilisateur courant : ne pas passer --user.
      selectorctl \
        --enable-user-extensions="$module" \
        --version="$PHP_SELECTOR_VERSION" \
        >"$selector_log" 2>&1 || true

      if [ "$DEBUG" = "1" ] && [ -s "$selector_log" ]; then
        while IFS= read -r line; do
          debug "selectorctl/$module : $line"
        done < "$selector_log"
      fi
    fi

    loaded_after=0
    if "$PHP_SELECTOR_CGI" -m 2>/dev/null | grep -Fqix "$module"; then
      loaded_after=1
    fi

    if [ "$loaded_after" = "1" ]; then
      PHP_EXTENSIONS_ACTIVE=$((PHP_EXTENSIONS_ACTIVE + 1))
      debug "Extension PHP $module : active après vérification/activation"
    else
      if [ -n "$inactive_list" ]; then
        inactive_list="${inactive_list}, ${module}"
      else
        inactive_list="$module"
      fi
      debug "Extension PHP $module : toujours inactive ; poursuite de l’installation"
    fi
  done

  PHP_EXTENSIONS_INACTIVE="$inactive_list"
  debug "Extensions PHP actives : ${PHP_EXTENSIONS_ACTIVE}/${PHP_EXTENSIONS_TOTAL}"
  if [ -n "$PHP_EXTENSIONS_INACTIVE" ]; then
    debug "Extensions PHP non actives (non bloquant) : $PHP_EXTENSIONS_INACTIVE"
  fi

  # Toujours succès : cette étape est volontairement non bloquante.
  return 0
}

if [ "$TTY_AVAILABLE" != "1" ]; then
  echo "Impossible d'accéder au terminal interactif (/dev/tty)." >&2
  echo "Lancez ce script depuis un terminal interactif." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
COOKIE_FILE="$TMP_DIR/cookies"
HEADER_FILE="$TMP_DIR/headers"
LOGIN_FILE="$TMP_DIR/login"
DOMAINS_FILE="$TMP_DIR/domains.json"
API_FILE="$TMP_DIR/api.json"
SSL_FILE="$TMP_DIR/ssl.json"
APP_ARCHIVE_FILE="$TMP_DIR/pulsenotes-personal.zip"
APP_CHECKSUM_FILE="$TMP_DIR/pulsenotes-personal.zip.sha256"
PRESERVED_CONFIG_FILE="$TMP_DIR/config.php.preserved"
PRESERVED_DATA_DIR="$TMP_DIR/data.preserved"
PRESERVED_RUNTIME_DIR="$TMP_DIR/runtime.preserved"

tui_start

if [ "$DEMO_MODE" = "1" ]; then
  debug "Mode démo activé"
  debug "Nom : $APP_DISPLAY_NAME"
  debug "Dossier : $APP_DIR"
  debug "Sous-domaine : $SUBDOMAIN_NAME"
fi

debug "Release PulseNotes : $APP_RELEASE_URL"
debug "Empreinte release : $APP_RELEASE_SHA256_URL"
debug "Serveur cPanel : $CPANEL_ORIGIN"

# -----------------------------------------------------------------------------
# INSTALLATION NORMALE : la release est téléchargée et vérifiée AVANT toute
# modification cPanel. Une panne GitHub ou une archive invalide ne touche donc
# pas à l’installation existante.
# -----------------------------------------------------------------------------
if [ "$MODE" != "clean" ]; then
  command -v curl >/dev/null 2>&1 || fatal "curl est requis pour installer PulseNotes."
  command -v python3 >/dev/null 2>&1 || fatal "python3 est requis pour installer PulseNotes."

  set_step 1 "Téléchargement de PulseNotes" 5 "Récupération de la dernière release personnelle depuis GitHub..."
  set_status "Téléchargement de pulsenotes-personal.zip..." 7

  spinner_start "Téléchargement de la release GitHub..."
  download_release_archive
  DOWNLOAD_RC=$?
  spinner_stop
  if [ "$DOWNLOAD_RC" -ne 0 ]; then
    case "$DOWNLOAD_RC" in
      2) fatal "La release a été téléchargée, mais son fichier SHA-256 est introuvable." ;;
      3) fatal "L’empreinte SHA-256 de la release PulseNotes est invalide." ;;
      4) fatal "La release GitHub est corrompue ou ne contient pas une installation PulseNotes complète." ;;
      *) fatal "Impossible de télécharger la release PulseNotes depuis GitHub." ;;
    esac
  fi

  set_status "Release PulseNotes téléchargée et vérifiée." 10
fi

while true; do
  read_password_masked

  if [ -z "$CPANEL_PASS" ]; then
    AUTH_ACTION=""
    auth_error_screen "Le mot de passe ne peut pas être vide"
    case "$AUTH_ACTION" in
      retry) continue ;;
      change_user) change_username; continue ;;
      *) exit 1 ;;
    esac
  fi

  if [ "$MODE" = "clean" ]; then
    set_step 1 "Connexion à cPanel" 10 "Connexion sécurisée au compte..."
  else
    set_step 2 "Connexion à cPanel" 15 "Connexion sécurisée au compte..."
  fi

  FORM_DATA="$(CPANEL_USER="$CPANEL_USER" CPANEL_PASS="$CPANEL_PASS" python3 -c '
import os
from urllib.parse import urlencode
print(urlencode({"user": os.environ["CPANEL_USER"], "pass": os.environ["CPANEL_PASS"]}))
')"

  spinner_start "Connexion sécurisée à cPanel..."

  LAST_HTTP="$(printf '%s' "$FORM_DATA" | curl \
    -sS \
    --connect-timeout 10 \
    --max-time 30 \
    -D "$HEADER_FILE" \
    -c "$COOKIE_FILE" \
    -o "$LOGIN_FILE" \
    -w '%{http_code}' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary @- \
    "$CPANEL_LOGIN_URL")"

  spinner_stop
  unset CPANEL_PASS FORM_DATA

  SECURITY_TOKEN="$(grep -Eho 'cpsess[0-9]+' "$HEADER_FILE" "$LOGIN_FILE" | head -1)"

  debug "Login cPanel HTTP : $LAST_HTTP"
  debug "Session cPanel obtenue : $([ -n "$SECURITY_TOKEN" ] && echo oui || echo non)"

  if [ -n "$SECURITY_TOKEN" ]; then
    break
  fi

  AUTH_ACTION=""
  auth_error_screen "Mot de passe incorrect"

  case "$AUTH_ACTION" in
    retry)
      : > "$COOKIE_FILE"
      : > "$HEADER_FILE"
      : > "$LOGIN_FILE"
      continue
      ;;
    change_user)
      change_username
      : > "$COOKIE_FILE"
      : > "$HEADER_FILE"
      : > "$LOGIN_FILE"
      continue
      ;;
    *)
      exit 1
      ;;
  esac
done

if [ "$MODE" = "clean" ]; then
  set_status "Connexion réussie." 20
  set_step 2 "Détection du domaine" 30 "Recherche du domaine principal..."
else
  set_status "Connexion réussie." 20
  set_step 3 "Détection du domaine" 24 "Recherche du domaine principal..."
fi

spinner_start "Lecture des domaines cPanel..."
uapi_get DomainInfo list_domains "$DOMAINS_FILE"
spinner_stop

if [ "$LAST_HTTP" != "200" ] || ! uapi_ok "$DOMAINS_FILE"; then
  fatal "Impossible de lire les domaines du compte."
fi

if [ -n "$MAIN_DOMAIN_OVERRIDE" ]; then
  MAIN_DOMAIN="$MAIN_DOMAIN_OVERRIDE"
  debug "Domaine principal forcé par configuration : $MAIN_DOMAIN"
else
  MAIN_DOMAIN="$(python3 -c '
import json
import sys
obj = json.load(open(sys.argv[1], encoding="utf-8"))
result = obj.get("result", obj)
print((result.get("data") or {}).get("main_domain", ""))
' "$DOMAINS_FILE")"
fi

if [ -z "$MAIN_DOMAIN" ]; then
  fatal "Aucun domaine principal n’a été trouvé."
fi

TARGET_DOMAIN="${SUBDOMAIN_NAME}.${MAIN_DOMAIN}"

if [ "$MODE" = "clean" ]; then
  set_status "Domaine trouvé : $TARGET_DOMAIN" 40
  set_step 3 "Analyse de l’installation" 50 "Recherche des éléments existants..."
else
  set_status "Domaine trouvé : $TARGET_DOMAIN" 29
  set_step 4 "Analyse de l’installation" 33 "Recherche des éléments existants..."
fi

DOMAIN_EXISTS="$(TARGET_DOMAIN="$TARGET_DOMAIN" python3 -c '
import json
import os
import sys
obj = json.load(open(sys.argv[1], encoding="utf-8"))
result = obj.get("result", obj)
data = result.get("data") or {}
target = os.environ["TARGET_DOMAIN"]
domains = []
for key in ("sub_domains", "addon_domains", "parked_domains"):
    value = data.get(key) or []
    if isinstance(value, list):
        domains.extend(value)
print("1" if target in domains else "0")
' "$DOMAINS_FILE")"

debug "Sous-domaine déjà présent : $([ "$DOMAIN_EXISTS" = "1" ] && echo oui || echo non)"
debug "Dossier déjà présent : $([ -e "$APP_DIR" ] && echo oui || echo non)"

if [ "$MODE" = "clean" ]; then
  set_status "État de l’installation analysé." 55
  set_step 4 "Suppression du domaine et du HTTPS" 65 "Suppression du certificat et du sous-domaine..."

  set_status "Suppression du certificat HTTPS..." 68
  spinner_start "Suppression du certificat HTTPS..."
  fleet_remove_old_cert || debug "Suppression SSL précédente ignorée (HTTP $LAST_HTTP)"
  spinner_stop

  if [ "$DOMAIN_EXISTS" = "1" ]; then
    set_status "Suppression de l’ancien sous-domaine..." 76
    spinner_start "Suppression du sous-domaine..."
    api2_get SubDomain delsubdomain "$API_FILE" "domain=$TARGET_DOMAIN"
    spinner_stop
    if [ "$LAST_HTTP" != "200" ] || ! api2_ok "$API_FILE"; then
      fatal "Impossible de supprimer l’ancien sous-domaine."
    fi
  fi

  set_status "Sous-domaine et HTTPS nettoyés." 80
  set_step 5 "Suppression du dossier" 88 "Suppression de $APP_DIR..."

  if [ "$APP_DIR" != "$HOME/$APP_DIR_NAME" ]; then
    fatal "Le chemin de nettoyage est invalide."
  fi

  debug "Suppression du dossier : $APP_DIR"
  rm -rf -- "$APP_DIR"

  if [ -e "$APP_DIR" ]; then
    fatal "Le dossier $APP_DIR n’a pas pu être supprimé."
  fi

  set_status "$APP_DISPLAY_NAME a été entièrement supprimé." 100
  clean_success_screen
  exit 0
fi

set_status "Installation existante analysée." 36
set_step 5 "Nettoyage" 40 "Préparation d’une installation propre..."

set_status "Conservation du certificat HTTPS existant..." 41
debug "Le certificat FleetSSL n’est pas supprimé pendant une réinstallation normale."

if [ "$DOMAIN_EXISTS" = "1" ]; then
  set_status "Suppression de l’ancien sous-domaine..." 43
  spinner_start "Suppression de l’ancien sous-domaine..."
  api2_get SubDomain delsubdomain "$API_FILE" "domain=$TARGET_DOMAIN"
  spinner_stop
  if [ "$LAST_HTTP" != "200" ] || ! api2_ok "$API_FILE"; then
    fatal "Impossible de supprimer l’ancien sous-domaine."
  fi
fi

set_status "Nettoyage du dossier $APP_DIR_NAME..." 46

if [ "$APP_DIR" != "$HOME/$APP_DIR_NAME" ]; then
  fatal "Le chemin de nettoyage est invalide."
fi

# Conserve la configuration et la base SQLite d’une installation PulseNotes existante.
# C’est indispensable pour ne pas changer PULSENOTES_APP_KEY lors d’une réinstallation.
if [ -f "$APP_DIR/api/config.php" ]; then
  cp -p "$APP_DIR/api/config.php" "$PRESERVED_CONFIG_FILE"
  debug "Configuration personnelle existante conservée."
fi
if [ -d "$APP_DIR/api/data" ]; then
  mkdir -p "$PRESERVED_DATA_DIR"
  cp -a "$APP_DIR/api/data/." "$PRESERVED_DATA_DIR/" 2>/dev/null || true
  debug "Données SQLite existantes conservées."
fi
if [ -d "$APP_DIR/api/runtime" ]; then
  mkdir -p "$PRESERVED_RUNTIME_DIR"
  if [ -f "$APP_DIR/api/runtime/update-state.json" ]; then
    cp -p "$APP_DIR/api/runtime/update-state.json" "$PRESERVED_RUNTIME_DIR/update-state.json"
  fi
  debug "État de mise à jour existant conservé."
fi

debug "Suppression du dossier : $APP_DIR"
rm -rf -- "$APP_DIR"

if [ -e "$APP_DIR" ]; then
  fatal "Le dossier $APP_DIR n’a pas pu être supprimé."
fi

mkdir -p "$APP_DIR"
chmod 755 "$APP_DIR"
set_status "Ancienne installation supprimée." 49

set_step 6 "Création du sous-domaine" 52 "Création de $TARGET_DOMAIN..."

spinner_start "Création du sous-domaine..."
uapi_get SubDomain addsubdomain "$API_FILE" \
  "domain=$SUBDOMAIN_NAME" \
  "rootdomain=$MAIN_DOMAIN" \
  "dir=/$APP_DIR_NAME" \
  "disallowdot=1"
spinner_stop

if [ "$LAST_HTTP" != "200" ] || ! uapi_ok "$API_FILE"; then
  fatal "cPanel n’a pas pu créer le sous-domaine."
fi

set_status "Sous-domaine créé." 57

set_step 7 "Extensions PHP" 60 "Vérification et activation des extensions PHP requises..."

set_status "Vérification de curl, dom, imagick, libxml, session, pdo, pdo_sqlite et zip..." 61
spinner_start "Configuration des extensions PHP..."
configure_php_extensions
spinner_stop

if [ "$PHP_EXTENSIONS_ACTIVE" -eq "$PHP_EXTENSIONS_TOTAL" ]; then
  set_status "Extensions PHP vérifiées : ${PHP_EXTENSIONS_ACTIVE}/${PHP_EXTENSIONS_TOTAL} actives." 65
elif [ -n "$PHP_EXTENSIONS_INACTIVE" ]; then
  set_status "Extensions PHP : ${PHP_EXTENSIONS_ACTIVE}/${PHP_EXTENSIONS_TOTAL} actives ; indisponibles ignorées : $PHP_EXTENSIONS_INACTIVE" 65
else
  set_status "Vérification des extensions PHP terminée sans bloquer l’installation." 65
fi

set_step 8 "Installation de l’application" 67 "Déploiement complet de PulseNotes depuis la release GitHub..."

set_status "Extraction du frontend, de l’API et des fichiers de configuration..." 68
debug "Archive vérifiée : $APP_ARCHIVE_FILE"
debug "Destination : $APP_DIR"

if ! extract_release_archive "$APP_ARCHIVE_FILE" "$APP_DIR"; then
  fatal "Impossible d’extraire la release PulseNotes dans $APP_DIR."
fi

for required_file in \
  "$APP_DIR/index.html" \
  "$APP_DIR/.htaccess" \
  "$APP_DIR/api/index.php" \
  "$APP_DIR/api/router.php" \
  "$APP_DIR/api/updater.php" \
  "$APP_DIR/api/version.json" \
  "$APP_DIR/api/config.php" \
  "$APP_DIR/api/.htaccess" \
  "$APP_DIR/api/update.sh"
do
  if [ ! -f "$required_file" ]; then
    fatal "Installation incomplète : $(basename "$required_file") est absent après extraction."
  fi
done

# Une réinstallation conserve la clé d’application et la base SQLite existantes.
if [ -s "$PRESERVED_CONFIG_FILE" ]; then
  cp -p "$PRESERVED_CONFIG_FILE" "$APP_DIR/api/config.php"
  debug "Configuration personnelle restaurée."
else
  if ! write_personal_config "$APP_DIR/api/config.php" "$APP_DISPLAY_NAME"; then
    fatal "Impossible de générer la configuration personnelle PulseNotes."
  fi
  debug "Nouvelle PULSENOTES_APP_KEY générée de manière aléatoire."
fi

mkdir -p "$APP_DIR/api/data"
if [ -d "$PRESERVED_DATA_DIR" ]; then
  cp -a "$PRESERVED_DATA_DIR/." "$APP_DIR/api/data/" 2>/dev/null || true
  debug "Base SQLite et données personnelles restaurées."
fi
mkdir -p "$APP_DIR/api/runtime"
if [ -d "$PRESERVED_RUNTIME_DIR" ]; then
  if [ -f "$PRESERVED_RUNTIME_DIR/update-state.json" ]; then
    cp -p "$PRESERVED_RUNTIME_DIR/update-state.json" "$APP_DIR/api/runtime/update-state.json"
  fi
  debug "État de mise à jour restauré."
fi

# Permissions adaptées à un hébergement cPanel/PHP exécuté sous l’utilisateur.
find "$APP_DIR" -type d -exec chmod 755 {} +
find "$APP_DIR" -type f -exec chmod 644 {} +
chmod 600 "$APP_DIR/api/config.php"
chmod 700 "$APP_DIR/api/data"
chmod 700 "$APP_DIR/api/runtime"
chmod 700 "$APP_DIR/api/update.sh"

# Validation locale PHP avant d’exposer le site.
if [ -n "$PHP_SELECTOR_CGI" ] && [ -x "$PHP_SELECTOR_CGI" ]; then
  if ! "$PHP_SELECTOR_CGI" -l "$APP_DIR/api/index.php" >/dev/null 2>&1; then
    fatal "Le fichier api/index.php de la release contient une erreur PHP."
  fi
  if ! "$PHP_SELECTOR_CGI" -l "$APP_DIR/api/router.php" >/dev/null 2>&1; then
    fatal "Le fichier api/router.php de la release contient une erreur PHP."
  fi
  if ! "$PHP_SELECTOR_CGI" -l "$APP_DIR/api/updater.php" >/dev/null 2>&1; then
    fatal "Le fichier api/updater.php de la release contient une erreur PHP."
  fi
fi

if [ ! -s "$APP_DIR/index.html" ]; then
  fatal "Le frontend PulseNotes n’a pas été installé correctement."
fi

set_status "PulseNotes complet est installé dans le dossier web." 71
set_step 9 "Vérification HTTP" 73 "Vérification de l’API PulseNotes..."

SITE_READY=0
ATTEMPT=1

while [ "$ATTEMPT" -le 8 ]; do
  PERCENT=$((73 + ATTEMPT))
  set_status "Test de /api/status (${ATTEMPT}/8)..." "$PERCENT"

  spinner_start "Test API HTTP ${ATTEMPT}/8..."
  STATUS_JSON="$(curl \
    -fsS \
    --connect-timeout 5 \
    --max-time 10 \
    "${SITE_HTTP_PROTOCOL}://${TARGET_DOMAIN}/api/status" \
    2>/dev/null \
    || true)"
  spinner_stop

  if [ -n "$STATUS_JSON" ] && printf '%s' "$STATUS_JSON" | validate_status_json; then
    SITE_READY=1
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -le 8 ]; then
    sleep 3
  fi
done

if [ "$SITE_READY" != "1" ]; then
  fatal "Le domaine a été créé, mais /api/status ne répond pas comme une installation PulseNotes personnelle."
fi

set_status "L’API PulseNotes répond correctement en HTTP." 82
set_step 10 "Recherche du certificat HTTPS" 84 "Recherche d’un certificat existant..."

if [ "$FORCE_NEW_CERT" = "1" ]; then
  set_status "Nouvelle émission forcée avec --new-cert." 85
  debug "Mode --new-cert : réutilisation initiale du certificat désactivée."
  CERT_ACTION="issue"
else
  set_status "Tentative de réinstallation du certificat existant..." 86

  spinner_start "Recherche et réinstallation du certificat existant..."
  if fleet_reinstall_cert; then
    spinner_stop
    CERT_ACTION="reused"
    set_status "Certificat existant réinstallé sans nouvelle émission." 88
  else
    REINSTALL_RC=$?
    spinner_stop
    REINSTALL_HTTP="$LAST_HTTP"
    if [ "$REINSTALL_HTTP" = "404" ]; then
      CERT_ACTION="issue"
      set_status "Aucun certificat existant n’a été trouvé." 88
    else
      fatal "Le certificat existant a été trouvé mais n’a pas pu être réinstallé."
    fi
  fi
fi

set_step 11 "Activation du HTTPS" 90 "Installation du certificat SSL..."

if [ "$CERT_ACTION" = "issue" ]; then
  if [ "$FORCE_NEW_CERT" = "1" ]; then
    set_status "Demande d’un nouveau certificat Let’s Encrypt..." 92
  else
    set_status "Premier certificat : demande à Let’s Encrypt..." 92
  fi

  spinner_start "Demande du certificat Let’s Encrypt..."
  if fleet_issue_cert; then
    spinner_stop
    set_status "Nouveau certificat HTTPS installé." 95
  else
    ISSUE_RC=$?
    spinner_stop
    ISSUE_HTTP="$LAST_HTTP"

    if [ "$DEBUG" = "1" ] && [ -s "$SSL_FILE" ]; then
      debug_json "$SSL_FILE" "erreur nouvelle émission Let’s Encrypt"
    fi

    if [ "$FORCE_NEW_CERT" = "1" ]; then
      set_status "Nouvelle émission refusée. Restauration du certificat existant..." 94

      spinner_start "Restauration du certificat existant..."
      if fleet_reinstall_cert; then
        spinner_stop
        set_status "Ancien certificat restauré sans nouvelle émission." 95
        debug "Émission refusée (HTTP $ISSUE_HTTP), certificat stocké restauré."
      else
        spinner_stop
        fatal "Let’s Encrypt a refusé le nouveau certificat et aucun certificat existant n’a pu être restauré."
      fi
    else
      fatal "Let’s Encrypt n’a pas pu installer le certificat HTTPS."
    fi
  fi
else
  set_status "Certificat existant déjà réinstallé." 95
fi

set_step 12 "Vérification HTTPS" 97 "Vérification de la connexion sécurisée..."

HTTPS_OK=0
ATTEMPT=1
while [ "$ATTEMPT" -le 5 ]; do
  set_status "Test HTTPS (${ATTEMPT}/5)..." $((97 + ATTEMPT / 2))

  spinner_start "Test HTTPS ${ATTEMPT}/5..."
  STATUS_JSON="$(curl \
    -fsS \
    --connect-timeout 5 \
    --max-time 10 \
    "${SITE_HTTPS_PROTOCOL}://${TARGET_DOMAIN}/api/status" \
    2>/dev/null \
    || true)"
  if [ -n "$STATUS_JSON" ] && printf '%s' "$STATUS_JSON" | validate_status_json; then
    spinner_stop
    HTTPS_OK=1
    break
  fi

  spinner_stop
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

if [ "$HTTPS_OK" = "1" ]; then
  set_status "HTTPS fonctionne." 100
else
  set_status "Certificat installé. HTTPS peut nécessiter quelques secondes." 100
fi

success_screen
exit 0
