#!/usr/bin/env bash
# Vuelve la ERP a un respaldo (de respaldo.sh): reemplaza TODOS los datos por los del respaldo y,
# si se pide, también los archivos. Sirve también para montar el sistema en un servidor nuevo:
# preparar-servidor.sh y después esto.
#
#   sudo -u innvolt bash ops/oracle/restaurar.sh ops/oracle/respaldos/innvolt-2026-11-20-datos.tgz [archivos.tgz]
set -euo pipefail
cd "$(dirname "$0")/../.."
source ops/oracle/comun.sh
DATOS_TGZ="${1:?Uso: restaurar.sh <innvolt-FECHA-datos.tgz> [innvolt-FECHA-archivos.tgz]}"
ARCHIVOS_TGZ="${2:-}"
read -r -p "Esto REEMPLAZA todos los datos actuales por los del respaldo. Escribe RESTAURAR: " ok || true
[[ "$ok" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
tar -xzf "$DATOS_TGZ" -C "$TMP"
cargar_datos "$TMP"
if [[ -n "$ARCHIVOS_TGZ" ]]; then
  [[ -f "$TMP/storage.sql" ]] || { echo "Este respaldo no trae el registro de los archivos (es anterior): restaura solo los datos."; exit 1; }
  "${DC[@]}" stop storage
  # Los archivos y su registro en la base van juntos (todo o nada en la base).
  {
    echo "BEGIN;"
    echo "SET session_replication_role = replica;"
    echo "DO \$\$ DECLARE t TEXT; BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t FROM pg_tables
       WHERE schemaname = 'storage' AND tablename <> 'migrations';
      IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' CASCADE'; END IF;
    END \$\$;"
    cat "$TMP/storage.sql"
    echo "COMMIT;"
  } | psql_en "$LOCAL"
  tgz_a_archivos "$ARCHIVOS_TGZ"
  "${DC[@]}" start storage
  echo "Archivos restaurados (los anteriores quedaron en storage.antes)."
fi
psql_en "$LOCAL" -At -c "select 'Restaurado: ' || (select count(*) from public.profiles) || ' cuentas y ' || (select count(*) from public.cotizaciones) || ' cotizaciones'"
