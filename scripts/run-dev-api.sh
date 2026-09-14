#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/php"
MODE="${1:-personal}"
API_PORT="${PULSENOTES_DEV_API_PORT:-8787}"

if [ "$MODE" = 'global' ]; then
  test -f "$ROOT/.dev/mysql.env" || { echo 'Configuration MySQL absente. Lancez install-dev-db.bat.' >&2; exit 1; }
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.dev/mysql.env"
  set +a
  php -m | grep -qi pdo_mysql || { echo 'Extension PHP pdo_mysql manquante.' >&2; exit 1; }
  export PULSENOTES_DEPLOYMENT_MODE=global
  export PULSENOTES_INSTANCE_NAME='PulseNotes Dev Global'
  export PULSENOTES_DATABASE_DSN="mysql:host=127.0.0.1;port=${MYSQL_PORT};dbname=${MYSQL_DATABASE};charset=utf8mb4"
  export PULSENOTES_DATABASE_USER="$MYSQL_USER"
  export PULSENOTES_DATABASE_PASSWORD="$MYSQL_PASSWORD"
  echo "API PulseNotes en mode global avec MySQL sur le port ${MYSQL_PORT}."
elif [ "$MODE" = 'personal' ]; then
  php -m | grep -qi pdo_sqlite || { echo 'Extension PHP pdo_sqlite manquante.' >&2; exit 1; }
  export PULSENOTES_DEPLOYMENT_MODE=selfhosted
  export PULSENOTES_INSTANCE_NAME='PulseNotes Dev Personnel'
  echo 'API PulseNotes en mode personnel avec SQLite.'
else
  echo "Mode de développement inconnu : $MODE" >&2
  exit 1
fi

exec php -S "127.0.0.1:${API_PORT}" router.php
