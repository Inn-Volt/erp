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
echo "Código: $antes → $ahora"
"${DC[@]}" build app
"${DC[@]}" up -d
"${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
nuevos=$(git diff --name-only "$antes" "$ahora" -- 'supabase_*.sql' 2>/dev/null || true)
[[ -n "$nuevos" ]] && echo "SQL nuevo o cambiado desde la versión anterior (córrelo con migraciones.sh):" && echo "$nuevos"
exit 0
