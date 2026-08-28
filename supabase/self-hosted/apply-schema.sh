#!/bin/bash
# ============================================================
# Aplica uno o más archivos .sql a la base de datos interna de un
# stack de Supabase self-hosted levantado con install.sh.
#
# Uso:
#   ./apply-schema.sh <project-dir> archivo1.sql [archivo2.sql ...]
#
# Ejemplo:
#   ./apply-schema.sh supabase-eval-docente ../schema.sql
# ============================================================
set -euo pipefail

PROJECT_DIR="${1:?Uso: apply-schema.sh <project-dir> archivo1.sql [archivo2.sql ...]}"
shift

if [ "$#" -eq 0 ]; then
  echo "ERROR: pasá al menos un archivo .sql." >&2
  exit 1
fi

DB_CONTAINER="$(cd "$PROJECT_DIR" && docker compose ps -q db)"
if [ -z "$DB_CONTAINER" ]; then
  echo "ERROR: no encuentro el contenedor 'db' en $PROJECT_DIR (¿está levantado el stack?)" >&2
  exit 1
fi

for f in "$@"; do
  echo "==> Aplicando $f..."
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$f"
done

echo "==> Listo."
