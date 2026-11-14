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
read -r -p "Esto REEMPLAZA todos los datos actuales por los del respaldo. Escribe RESTAURAR: " ok
[[ "$ok" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
tar -xzf "$DATOS_TGZ" -C "$TMP"
cargar_datos "$TMP"
if [[ -n "$ARCHIVOS_TGZ" ]]; then
  "${DC[@]}" stop storage
  tgz_a_archivos "$ARCHIVOS_TGZ"
  "${DC[@]}" start storage
  echo "Archivos restaurados (los anteriores quedaron en storage.antes)."
fi
psql_en "$LOCAL" -At -c "select 'Restaurado: ' || (select count(*) from public.profiles) || ' cuentas y ' || (select count(*) from public.cotizaciones) || ' cotizaciones'"
