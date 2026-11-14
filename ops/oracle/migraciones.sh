#!/usr/bin/env bash
# Crea o pone al día la estructura de la base del servidor con los mismos SQL de siempre, en el mismo
# orden que las pruebas (tests/sql/correr.sh). Todos son idempotentes: se pueden volver a correr.
#
#   bash ops/oracle/migraciones.sh                       todas, en orden
#   bash ops/oracle/migraciones.sh supabase_fase20_x.sql una nueva (lo que antes era pegarla en Supabase)
set -uo pipefail
cd "$(dirname "$0")/../.."
DC=(docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env)

ORDEN=(supabase_schema.sql supabase_solicitudes.sql supabase_agenda.sql supabase_mejoras_comerciales.sql)
for n in 1_usuarios_permisos 2_operacion 3_cotizador 4_cotizador_tecapp 5_tecapp_operacion 6_ot_terreno 7_flujo 8_informes \
         9_planillas 10_visita_tecnico 11_levantamientos 12_avisos_agenda 13_utilidad 14_push 15_revision 16_aperturas \
         17_descuentos 18_imprevistos 19_fondos; do
  ORDEN+=("supabase_fase$n.sql")
done
[[ $# -gt 0 ]] && ORDEN=("$@")

# La base, el login y los archivos tienen que estar arriba: crean sus esquemas (auth, storage) al partir.
for s in db auth storage; do
  for _ in $(seq 1 60); do
    [[ "$("${DC[@]}" ps --format '{{.Health}}' "$s" 2>/dev/null)" == "healthy" ]] && break
    sleep 2
  done
done

fallo=0
for f in "${ORDEN[@]}"; do
  [[ -f "$f" ]] || { echo "No existe $f"; fallo=1; continue; }
  if salida=$("${DC[@]}" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f" 2>&1); then
    echo "ok   $f"
  else
    echo "FALLA $f"; echo "$salida" | grep -v "NOTICE\|skipping" | tail -8; fallo=1
  fi
done
# PostgREST relee la estructura (tablas y funciones nuevas).
"${DC[@]}" exec -T db psql -U postgres -d postgres -q -c "NOTIFY pgrst, 'reload schema';" >/dev/null
exit $fallo
