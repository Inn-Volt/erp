#!/usr/bin/env bash
# Trae a este servidor los datos de la ERP que hoy están en Supabase: todas las tablas, las cuentas
# (con sus mismas contraseñas) y los archivos (boletas, fotos, PDF enviados…). La estructura ya la
# creó migraciones.sh. Supabase NO se toca: solo se lee (queda de respaldo).
#
#   sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/migrar-desde-supabase.sh
#
# Pide (y no guarda):
#   · la conexión a la base de Supabase: Supabase → Connect → «Session pooler» (con la clave de la base);
#   · la URL del proyecto y su «service_role key» (Supabase → Project Settings → API), para los archivos.
# Después, todos vuelven a iniciar sesión (con su misma contraseña).
set -euo pipefail
cd "$(dirname "$0")/../.."
source ops/oracle/comun.sh

hay=$(psql_en "$LOCAL" -At -c "select count(*) from public.profiles" 2>/dev/null || echo 0)
if [[ "$hay" != "0" ]]; then
  echo "OJO: esta base ya tiene $hay cuentas. Migrar REEMPLAZA todos sus datos por los de Supabase."
fi
read -r -p "Escribe MIGRAR para seguir: " ok
[[ "$ok" == "MIGRAR" ]] || { echo "Cancelado."; exit 1; }

read -r -s -p "Conexión de Supabase (postgresql://postgres.xxxx:CLAVE@aws-…pooler.supabase.com:5432/postgres): " ORIGEN; echo
[[ "$ORIGEN" == postgres* ]] || { echo "No parece una conexión de PostgreSQL."; exit 1; }
psql_en "$ORIGEN" -At -c "select 'Conectado a Supabase: ' || count(*) || ' cuentas' from public.profiles"

# Qué fases tiene Supabase: las que falten se corren aquí después, con sus traspasos de datos.
read -r f15 f16 f17 f18 f19 < <(psql_en "$ORIGEN" -At -F' ' -c "select
  to_regclass('public.compras') is not null, to_regclass('public.cotizacion_aperturas') is not null,
  to_regclass('public.descuentos_maximos') is not null,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ajustes_cotizacion' and column_name = 'imprevistos_por_tipo'),
  to_regclass('public.fondo_movimientos') is not null" | tr -d '\r')
faltan=()
[[ "$f15" == t ]] || faltan+=(supabase_fase15_revision.sql)
[[ "$f16" == t ]] || faltan+=(supabase_fase16_aperturas.sql)
[[ "$f17" == t ]] || faltan+=(supabase_fase17_descuentos.sql)
[[ "$f18" == t ]] || faltan+=(supabase_fase18_imprevistos.sql)
[[ "$f19" == t ]] || faltan+=(supabase_fase19_fondos.sql)

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "1/3 · Copiando los datos de Supabase…"
sacar_datos "$ORIGEN" "$TMP"
echo "2/3 · Cargándolos aquí (todo o nada)…"
cargar_datos "$TMP"
if (( ${#faltan[@]} )); then
  echo "      Fases que Supabase no tenía (se corren ahora, con sus traspasos): ${faltan[*]}"
  bash ops/oracle/migraciones.sh "${faltan[@]}"
fi
psql_en "$LOCAL" -At -c "select 'Aquí quedaron ' || (select count(*) from public.profiles) || ' cuentas, ' || (select count(*) from public.cotizaciones) || ' cotizaciones y ' || (select count(*) from public.clientes) || ' clientes'"

echo "3/3 · Copiando los archivos…"
read -r -p "URL del proyecto de Supabase (https://xxxx.supabase.co): " ORIGEN_URL
read -r -s -p "service_role key de Supabase: " ORIGEN_CLAVE; echo
docker run --rm --network innvolt_default -v "$PWD/ops/oracle:/s:ro" \
  -e ORIGEN_URL="$ORIGEN_URL" -e ORIGEN_CLAVE="$ORIGEN_CLAVE" -e DESTINO_URL=http://storage:5000 -e DESTINO_CLAVE="$SERVICE_ROLE_KEY" \
  node:22-alpine node /s/copiar-archivos.mjs

echo
echo "Migración lista. Ahora:"
echo "  · Entra a $URL_PUBLICA con tu correo y tu misma contraseña."
echo "  · En la ERP: Configuración → Avisos al celular → «Configurar» (para que los avisos salgan desde aquí)."
echo "  · Revisa una cotización, su PDF y una boleta. Supabase sigue intacto por si hay que volver."
