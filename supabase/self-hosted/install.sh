#!/bin/bash
# ============================================================
# Levanta un stack de Supabase self-hosted nuevo (Docker) para un
# proyecto que reusa este mismo repositorio. Pensado para correr en
# un servidor Linux (Ubuntu/Debian) limpio, con Docker no necesariamente
# instalado. NO toca ningún Postgres nativo que ya exista en el
# servidor: Supabase levanta su propio Postgres en un contenedor,
# aislado del resto.
#
# Uso:
#   ./install.sh <project-dir> <public-host-o-ip> <http-port>
#
# Ejemplo (segundo proyecto en el mismo servidor 192.168.1.170,
# usando el puerto 8002 porque el 8001 ya lo usa evaluacion-docente):
#   ./install.sh supabase-otro-proyecto 192.168.1.170 8002
#
# Después de este script:
#   1. Aplicar el schema.sql del proyecto correspondiente:
#        ./apply-schema.sh <project-dir> /ruta/a/schema.sql
#   2. Crear el usuario admin:
#        ./create-admin.sh <project-dir> admin@ejemplo.com "contraseña"
#   3. Copiar SUPABASE_PUBLIC_URL y ANON_KEY (quedan en <project-dir>/.env)
#      al .env.local de la app React.
# ============================================================
set -euo pipefail

PROJECT_DIR="${1:?Uso: install.sh <project-dir> <public-host-o-ip> <http-port>}"
PUBLIC_HOST="${2:?Falta el host/IP público}"
HTTP_PORT="${3:?Falta el puerto HTTP a exponer}"

if [ -d "$PROJECT_DIR" ]; then
  echo "ERROR: ya existe un directorio '$PROJECT_DIR'. Elegí otro nombre o borralo primero." >&2
  exit 1
fi

echo "==> Descargando el bootstrap oficial de Supabase self-hosted..."
curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh -o /tmp/supabase-setup-"$PROJECT_DIR".sh
sh /tmp/supabase-setup-"$PROJECT_DIR".sh -y --project-dir "$PROJECT_DIR"
rm -f /tmp/supabase-setup-"$PROJECT_DIR".sh

cd "$PROJECT_DIR"

echo "==> Configurando URLs y puerto HTTP (${PUBLIC_HOST}:${HTTP_PORT})..."
sed -i \
  -e "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=http://${PUBLIC_HOST}:${HTTP_PORT}|" \
  -e "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://${PUBLIC_HOST}:${HTTP_PORT}/auth/v1|" \
  -e "s|^SITE_URL=.*|SITE_URL=http://${PUBLIC_HOST}:${HTTP_PORT}|" \
  -e "s|^KONG_HTTP_PORT=.*|KONG_HTTP_PORT=${HTTP_PORT}|" \
  -e "s|^API_GW_HTTP_PORT=.*|API_GW_HTTP_PORT=${HTTP_PORT}|" \
  .env

cat <<'EOF'

IMPORTANTE - revisá antes de continuar si este servidor ya corre OTRO
Postgres o OTRA instancia de Supabase:
  - POSTGRES_PORT (default 5432) y POOLER_PROXY_PORT_TRANSACTION (default
    6543) en el .env de este proyecto se exponen al host. Si ya hay algo
    escuchando en esos puertos, cambialos ANTES de levantar el stack:
      sed -i 's/^POSTGRES_PORT=.*/POSTGRES_PORT=5433/' .env
      sed -i 's/^POOLER_PROXY_PORT_TRANSACTION=.*/POOLER_PROXY_PORT_TRANSACTION=6544/' .env
  - Esto NO afecta a ningún Postgres nativo del servidor: es un
    contenedor propio de este stack de Supabase.

EOF

echo "==> Descargando imágenes y levantando el stack..."
docker compose pull
docker compose up -d

echo ""
echo "==> Listo. Estado de los contenedores:"
docker compose ps --format 'table {{.Name}}\t{{.Status}}'

echo ""
echo "SUPABASE_PUBLIC_URL: http://${PUBLIC_HOST}:${HTTP_PORT}"
echo "ANON_KEY / SERVICE_ROLE_KEY: ver $(pwd)/.env"
