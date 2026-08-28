#!/bin/bash
# ============================================================
# Crea (con el email ya confirmado) el usuario administrador de la
# app en un stack de Supabase self-hosted levantado con install.sh.
# Esta app es de uso exclusivo de Dirección Académica / administración:
# no hay autoservicio docente, así que alcanza con un solo usuario.
#
# Uso:
#   ./create-admin.sh <project-dir> email contraseña
#
# Ejemplo:
#   ./create-admin.sh supabase-eval-docente admin@fceune.edu.py "unaContraseñaSegura"
# ============================================================
set -euo pipefail

PROJECT_DIR="${1:?Uso: create-admin.sh <project-dir> email contraseña}"
EMAIL="${2:?Falta el email}"
PASSWORD="${3:?Falta la contraseña}"

PUBLIC_URL="$(grep '^SUPABASE_PUBLIC_URL=' "$PROJECT_DIR/.env" | cut -d= -f2-)"
SERVICE_ROLE_KEY="$(grep '^SERVICE_ROLE_KEY=' "$PROJECT_DIR/.env" | cut -d= -f2-)"

if [ -z "$PUBLIC_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "ERROR: no pude leer SUPABASE_PUBLIC_URL o SERVICE_ROLE_KEY de $PROJECT_DIR/.env" >&2
  exit 1
fi

curl -s -X POST "${PUBLIC_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"email_confirm\":true}"

echo ""
echo "==> Usuario creado. Ya podés loguearte en la app con ese email/contraseña."
