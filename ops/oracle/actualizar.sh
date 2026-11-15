#!/usr/bin/env bash
# Pone al día el servidor con lo último de GitHub: trae el código, reconstruye la app y la cambia
# (unos segundos sin servicio). Si llegó un SQL nuevo, se corre aparte con migraciones.sh.
#
#   sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/actualizar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DC=(docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env)
antes=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
git pull --quiet --ff-only || echo "Aviso: no se pudo traer de GitHub (se construye lo que hay)."
ahora=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
echo "ERP: $antes → $ahora"
# El sitio innvolt.cl, si está (agregar-sitio.sh): también se trae lo último.
SITIO_CODIGO=$(grep -s '^SITIO_CODIGO=' ops/oracle/.env | cut -d= -f2- | tr -d '"' || true)
if [[ -n "$SITIO_CODIGO" && -d "$SITIO_CODIGO/.git" ]]; then
  git -C "$SITIO_CODIGO" pull --quiet --ff-only || echo "Aviso: no se pudo traer el sitio de GitHub."
  echo "Sitio: $(git -C "$SITIO_CODIGO" log --oneline -1)"
  DC+=(--profile sitio)
fi
# Construye la app y, si está activo, el sitio.
"${DC[@]}" build
"${DC[@]}" up -d
"${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
nuevos=$(git diff --name-only "$antes" "$ahora" -- 'supabase_*.sql' 2>/dev/null || true)
[[ -n "$nuevos" ]] && echo "SQL nuevo o cambiado desde la versión anterior (córrelo con migraciones.sh):" && echo "$nuevos"
exit 0
