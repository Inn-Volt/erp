#!/usr/bin/env bash
# Respaldo diario del servidor de InnVolt (lo corre el cron a las 03:30): los datos de la ERP y las
# cuentas (como en la migración) y los archivos. Quedan 7 días en el servidor y, si está configurada
# RESPALDO_PAR_URL, una copia en Object Storage de Oracle (bucket «innvolt-respaldos», gratis hasta 20 GB).
# Se restaura con restaurar.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
source ops/oracle/comun.sh
DESTINO=ops/oracle/respaldos
FECHA=$(date +%F)
mkdir -p "$DESTINO"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

sacar_datos "$LOCAL" "$TMP" >/dev/null
tar -czf "$DESTINO/innvolt-$FECHA-datos.tgz" -C "$TMP" public.sql auth.sql
# Los archivos (Storage), completos para restaurar de una vez.
archivos_a_tgz "$PWD/$DESTINO/innvolt-$FECHA-archivos.tgz"
find "$DESTINO" -name 'innvolt-*.tgz' -mtime +7 -delete

if [[ -n "${RESPALDO_PAR_URL:-}" ]]; then
  for f in datos archivos; do
    curl -fsS --retry 3 -T "$DESTINO/innvolt-$FECHA-$f.tgz" "${RESPALDO_PAR_URL%/}/innvolt-$FECHA-$f.tgz" \
      || echo "$(date -Is) No se pudo subir el respaldo de $f a Object Storage."
  done
fi
echo "$(date -Is) Respaldo listo: $(du -sh "$DESTINO/innvolt-$FECHA-datos.tgz" | cut -f1) de datos, $(du -sh "$DESTINO/innvolt-$FECHA-archivos.tgz" | cut -f1) de archivos."
