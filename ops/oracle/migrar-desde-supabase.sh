#!/usr/bin/env bash
# Trae a este servidor los datos de la ERP que hoy están en Supabase: todas las tablas, las cuentas
# (con sus mismas contraseñas) y los archivos (boletas, fotos, PDF enviados…). La estructura ya la
# creó migraciones.sh. Supabase NO se toca: solo se lee (queda de respaldo).
#
#   sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/migrar-desde-supabase.sh
#
# Pide al comienzo (y no guarda):
#   · la conexión a la base de Supabase: Supabase → Connect → «Session pooler» (con la clave de la base);
#   · la URL del proyecto y su «service_role key» (Supabase → Project Settings → API), para los archivos.
# Se puede repetir (ensayo antes del cambio y de nuevo el día del cambio): cada vez reemplaza todo.
# Después, todos vuelven a iniciar sesión (con su misma contraseña).
set -euo pipefail
cd "$(dirname "$0")/../.."
source ops/oracle/comun.sh

hay=$(psql_en "$LOCAL" -At -c "select count(*) from public.profiles" 2>/dev/null || echo 0)
if [[ "$hay" != "0" ]]; then
  echo "OJO: esta base ya tiene $hay cuentas. Migrar REEMPLAZA todos sus datos por los de Supabase."
fi
read -r -p "Escribe MIGRAR para seguir: " ok || true
[[ "$ok" == "MIGRAR" ]] || { echo "Cancelado."; exit 1; }

# Todo lo que hay que pegar, al comienzo: después corre solo.
read -r -s -p "Conexión de Supabase (postgresql://postgres.xxxx:CLAVE@aws-…pooler.supabase.com:5432/postgres): " ORIGEN || true; echo
[[ "$ORIGEN" == postgres* ]] || { echo "No parece una conexión de PostgreSQL."; exit 1; }
psql_en "$ORIGEN" -At -c "select 'Conectado a Supabase: ' || count(*) || ' cuentas' from public.profiles"
read -r -p "URL del proyecto de Supabase (https://xxxx.supabase.co): " ORIGEN_URL || true
ORIGEN_URL="${ORIGEN_URL%/}"
[[ "$ORIGEN_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo "La URL debe ser como https://xxxx.supabase.co"; exit 1; }
read -r -s -p "service_role key de Supabase: " ORIGEN_CLAVE || true; echo
curl -fsS -o /dev/null -H "apikey: $ORIGEN_CLAVE" -H "Authorization: Bearer $ORIGEN_CLAVE" "$ORIGEN_URL/storage/v1/bucket" \
  || { echo "Supabase no aceptó esa URL o esa clave (se necesita la service_role, no la anon)."; exit 1; }
[[ "$URL_PUBLICA" =~ ^https?://[A-Za-z0-9.:-]+$ ]] || { echo "URL_PUBLICA de ops/oracle/.env no es válida: $URL_PUBLICA"; exit 1; }

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
echo "1/4 · Copiando los datos de Supabase…"
sacar_datos "$ORIGEN" "$TMP"
echo "2/4 · Cargándolos aquí (todo o nada)…"
cargar_datos "$TMP"
if (( ${#faltan[@]} )); then
  echo "      Fases que Supabase no tenía (se corren ahora, con sus traspasos): ${faltan[*]}"
  bash ops/oracle/migraciones.sh "${faltan[@]}"
fi
psql_en "$LOCAL" -At -c "select 'Aquí quedaron ' || (select count(*) from public.profiles) || ' cuentas, ' || (select count(*) from public.cotizaciones) || ' cotizaciones y ' || (select count(*) from public.clientes) || ' clientes'"

# Lo que en los datos todavía apunta a Supabase o a Netlify pasa a este servidor (el logo de cada
# empresa y la dirección de los avisos al celular).
echo "3/4 · Apuntando las direcciones guardadas a $URL_PUBLICA…"
apuntar_direcciones "$ORIGEN_URL" "$URL_PUBLICA"

echo "4/4 · Copiando los archivos…"
docker run --rm --network innvolt_default -v "$PWD/ops/oracle:/s:ro" \
  -e ORIGEN_URL="$ORIGEN_URL" -e ORIGEN_CLAVE="$ORIGEN_CLAVE" -e DESTINO_URL=http://storage:5000 -e DESTINO_CLAVE="$SERVICE_ROLE_KEY" \
  node:22-alpine node /s/copiar-archivos.mjs

echo
echo "Migración lista. Ahora:"
echo "  · Entra a $URL_PUBLICA con tu correo y tu misma contraseña."
echo "  · Revisa una cotización, su PDF (con el logo), una boleta y la campanita."
echo "  · Si la dirección cambió (antes era otra), cada persona abre la nueva, instala la app en el"
echo "    celular y activa los avisos otra vez (una sola vez). Con la misma dirección, no hace falta."
echo "  · Supabase sigue intacto por si hay que volver."
