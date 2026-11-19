#!/usr/bin/env bash
# Muda la ERP de un proyecto de Supabase a otro (p. ej. de Oregón a São Paulo, para que ande más
# rápido desde Chile). El proyecto de origen SOLO se lee: queda intacto, de respaldo.
#
#   bash ops/supabase/mudar-de-proyecto.sh            ensayo: todo, pero sin avisos al celular desde el nuevo
#   bash ops/supabase/mudar-de-proyecto.sh --final    el día del cambio: igual, con los avisos encendidos
#   bash ops/supabase/mudar-de-proyecto.sh --solo-comprobar   solo compara las filas de cada tabla (no cambia nada)
#
# Cada vez REEMPLAZA todo lo del proyecto nuevo por lo del de origen (se puede repetir):
#   1. estructura: las fases de siempre (supabase_*.sql), en orden;
#   2. datos: todas las tablas de la ERP y las cuentas con sus mismas contraseñas (todo o nada);
#   3. las fases que el origen aún no tenía, con sus traspasos;
#   4. las direcciones de archivos guardadas en los datos (logos) pasan al proyecto nuevo;
#   5. los archivos (boletas, fotos, PDF…) se copian con la API de Storage;
#   6. comprobación: cuántas filas tiene cada tabla en los dos lados.
# Lee las claves de ops/oracle/.env.migracion-sp (solo en este PC; git lo ignora). Necesita psql y
# pg_dump 17 (en el PATH o en PG_BIN) y Node 22.
set -euo pipefail
cd "$(dirname "$0")/../.."
FINAL=false; SOLO_COMPROBAR=false
case "${1:-}" in --final) FINAL=true ;; --solo-comprobar) SOLO_COMPROBAR=true ;; esac
ENVF=${ENVF:-ops/oracle/.env.migracion-sp}
PG_BIN=${PG_BIN:-$HOME/herramientas/pgsql/bin}
[[ -d "$PG_BIN" ]] && export PATH="$PG_BIN:$PATH"
export PGCLIENTENCODING=UTF8   # siempre UTF-8, aunque la consola de Windows use otra página de códigos
command -v psql >/dev/null && command -v pg_dump >/dev/null || { echo "Faltan psql y pg_dump (PostgreSQL 17)."; exit 1; }
[[ -f "$ENVF" ]] || { echo "No está $ENVF"; exit 1; }

leer() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^["'\'' ]+|["'\'' ]+$//g'; }
ORIGEN_URL=$(leer ORIGEN_URL); ORIGEN_URL=${ORIGEN_URL:-https://xinuhsbzxppbutuwbddp.supabase.co}; ORIGEN_URL=${ORIGEN_URL%/}
DESTINO_URL=$(leer DESTINO_URL); DESTINO_URL=${DESTINO_URL%/}
CO=$(leer ORIGEN_DB_CLAVE); CD=$(leer DESTINO_DB_CLAVE)
KO=$(leer ORIGEN_SERVICE_ROLE); KD=$(leer DESTINO_SERVICE_ROLE)
for v in ORIGEN_URL DESTINO_URL CO CD KO KD; do [[ -n "${!v}" ]] || { echo "Falta un dato en $ENVF ($v)."; exit 1; }; done
ref() { sed -E 's#^https://([a-z0-9]+)\..*#\1#' <<<"$1"; }
RO=$(ref "$ORIGEN_URL"); RD=$(ref "$DESTINO_URL")
[[ "$RO" != "$RD" ]] || { echo "El origen y el destino son el mismo proyecto."; exit 1; }

# Cómo llegar a cada base. Primero, directo (db.<ref>.supabase.co, solo por IPv6): es lo más firme
# para copiar tablas grandes (el «pooler» compartido ha cortado la conexión a mitad de un COPY).
# Si no hay IPv6, por el «Session pooler», región por región: una región que no tiene el proyecto
# responde al tiro «Tenant or user not found». La contraseña siempre va por PGPASSWORD.
REGIONES=(sa-east-1 us-west-2 us-east-1 us-east-2 us-west-1 ca-central-1 eu-west-1 eu-west-2 eu-west-3 eu-central-1
          eu-central-2 eu-north-1 ap-south-1 ap-southeast-1 ap-southeast-2 ap-northeast-1 ap-northeast-2)
pooler() {   # pooler <ref> <clave> → host
  local h r err
  for r in "${REGIONES[@]}"; do
    for h in "aws-1-$r.pooler.supabase.com" "aws-0-$r.pooler.supabase.com"; do
      if err=$(PGPASSWORD="$2" PGCONNECT_TIMEOUT=8 psql "host=$h port=5432 dbname=postgres user=postgres.$1 sslmode=require" -Atqc "select 1" 2>&1); then
        echo "$h"; return 0
      fi
      [[ "$err" == *"password authentication failed"* ]] && { echo "CLAVE"; return 0; }
    done
  done
  return 1
}
conexion() {   # conexion <ref> <clave> → cadena de conexión (o CLAVE si la contraseña no sirve)
  local directa="host=db.$1.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" err h
  if err=$(PGPASSWORD="$2" PGCONNECT_TIMEOUT=10 psql "$directa" -Atqc "select 1" 2>&1); then echo "$directa"; return 0; fi
  [[ "$err" == *"password authentication failed"* ]] && { echo "CLAVE"; return 0; }
  h=$(pooler "$1" "$2") || return 1
  [[ "$h" == CLAVE ]] && { echo "CLAVE"; return 0; }
  echo "host=$h port=5432 dbname=postgres user=postgres.$1 sslmode=require"
}
echo "Buscando las dos bases…"
O=$(conexion "$RO" "$CO") || { echo "No se pudo conectar al origen."; exit 1; }
D=$(conexion "$RD" "$CD") || { echo "No se pudo conectar al destino."; exit 1; }
[[ "$O" != CLAVE ]] || { echo "La contraseña de la base de ORIGEN no es correcta (ORIGEN_DB_CLAVE)."; exit 1; }
[[ "$D" != CLAVE ]] || { echo "La contraseña de la base del proyecto NUEVO no es correcta (DESTINO_DB_CLAVE)."; exit 1; }
via() { [[ "$1" == *pooler* ]] && sed -E 's/.*host=([a-z0-9-]+)\.pooler.*/pooler \1/' <<<"$1" || echo "directo"; }
HO=$(via "$O"); HD=$(via "$D")
po() { PGPASSWORD="$CO" psql "$O" -v ON_ERROR_STOP=1 -q "$@"; }
pd() { PGPASSWORD="$CD" psql "$D" -v ON_ERROR_STOP=1 -q "$@"; }
echo "  Origen:  $HO  ·  $(po -At -c "select count(*) || ' cuentas, ' || (select count(*) from public.cotizaciones) || ' cotizaciones' from public.profiles" | tr -d '\r')"
hay=$(pd -At -c "select count(*) from public.profiles" 2>/dev/null | tr -d '\r' || echo 0)
echo "  Destino: $HD  ·  ${hay:-0} cuentas (se reemplaza todo)"
comprobar() {
  echo "6/6 · Comprobación (filas por tabla)…"
  q_cuenta="SELECT format('SELECT %L || ''|'' || count(*) FROM public.%I;', tablename, tablename) FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"
  cuenta() { "$1" -At -c "$q_cuenta" | tr -d '\r' | "$1" -At | tr -d '\r' | sort; }
  cuenta po > "$TMP/o.txt"; cuenta pd > "$TMP/d.txt"
  echo "auth.users|$(po -At -c 'select count(*) from auth.users' | tr -d '\r')" >> "$TMP/o.txt"
  echo "auth.users|$(pd -At -c 'select count(*) from auth.users' | tr -d '\r')" >> "$TMP/d.txt"
  sort -o "$TMP/o.txt" "$TMP/o.txt"; sort -o "$TMP/d.txt" "$TMP/d.txt"
  dif=$(join -t'|' -a1 -e 'NO EXISTE' -o 0,1.2,2.2 "$TMP/o.txt" "$TMP/d.txt" | awk -F'|' '$2 != $3')
  echo "      $(wc -l < "$TMP/o.txt") tablas comparadas · filas en total: origen $(awk -F'|' '{s+=$2} END {print s}' "$TMP/o.txt") · destino $(awk -F'|' '{s+=$2} END {print s}' "$TMP/d.txt")"
  if [[ -n "$dif" ]]; then echo "      DIFERENCIAS (tabla | origen | destino):"; echo "$dif" | sed 's/^/        /'; else echo "      Todas las tablas cuadran."; fi

}
if $SOLO_COMPROBAR; then TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; comprobar; exit 0; fi
if [[ "${MUDAR:-}" != si ]]; then
  read -r -p "Escribe MUDAR para seguir: " ok || true
  [[ "$ok" == MUDAR ]] || { echo "Cancelado."; exit 1; }
fi

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "1/6 · Estructura (las fases de siempre)…"
ORDEN=(supabase_schema.sql supabase_solicitudes.sql supabase_agenda.sql supabase_mejoras_comerciales.sql)
for n in 1_usuarios_permisos 2_operacion 3_cotizador 4_cotizador_tecapp 5_tecapp_operacion 6_ot_terreno 7_flujo 8_informes \
         9_planillas 10_visita_tecnico 11_levantamientos 12_avisos_agenda 13_utilidad 14_push 15_revision 16_aperturas \
         17_descuentos 18_imprevistos 19_fondos; do ORDEN+=("supabase_fase$n.sql"); done
correr_fases() {
  local f salida
  for f in "$@"; do
    if salida=$(pd -f "$f" 2>&1); then echo "      ok   $f"
    else echo "      FALLA $f"; echo "$salida" | grep -v "NOTICE\|skipping" | tail -8; return 1; fi
  done
}
correr_fases "${ORDEN[@]}"

# Qué fases tiene el origen: las que le falten se corren después de cargar, con sus traspasos.
read -r f15 f16 f17 f18 f19 < <(po -At -F' ' -c "select
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

# Antes de tocar nada: toda columna del origen tiene que existir en el destino (si no, algo se
# cambió a mano en el origen y hay que verlo antes de mudar).
q_cols="select table_name || '.' || column_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.is_generated = 'NEVER' order by 1"
sobran=$(comm -23 <(po -At -c "$q_cols" | tr -d '\r' | sort) <(pd -At -c "$q_cols" | tr -d '\r' | sort))
if [[ -n "$sobran" ]]; then
  echo "El origen tiene columnas que el destino no tiene (no se mudó nada):"; echo "$sobran" | sed 's/^/      /'; exit 1
fi

echo "2/6 · Datos y cuentas (todo o nada)…"
pg_dump_o() { PGPASSWORD="$CO" pg_dump "$O" "$@"; }
# Sin los retornos (\r) que agrega Windows al escribir (en los datos un retorno va escrito como «\r»).
pg_dump_o --data-only --no-owner --no-privileges -n public | tr -d '\r' > "$TMP/public.sql"
# Un contador (secuencia) del origen que el destino no tiene es un resto que nadie usa (las columnas
# que numeran usan los de las fases): se omite y se avisa.
secs=$(pd -At -c "select sequencename from pg_sequences where schemaname = 'public'" | tr -d '\r')
sin_uso=$(grep -oE "^SELECT pg_catalog\.setval\('public\.[A-Za-z0-9_]+'" "$TMP/public.sql" | sed -E "s/.*public\.//; s/'$//" \
          | grep -vxF -f <(printf '%s\n' "$secs") || true)
for sq in $sin_uso; do sed -i "/^SELECT pg_catalog\.setval('public\.$sq'/d" "$TMP/public.sql"; done
[[ -z "$sin_uso" ]] || echo "      Contadores del origen sin uso (se omiten): $(echo $sin_uso)"
q_auth="select column_name from information_schema.columns where table_schema = 'auth' and table_name = '%s' and is_generated = 'NEVER' order by 1"
: > "$TMP/auth.sql"
for t in users identities; do
  # shellcheck disable=SC2059
  cols=$(comm -12 <(po -At -c "$(printf "$q_auth" "$t")" | tr -d '\r' | sort) <(pd -At -c "$(printf "$q_auth" "$t")" | tr -d '\r' | sort) | sed 's/.*/"&"/' | paste -sd, -)
  [[ -n "$cols" ]] || { echo "No se pudieron leer las columnas de auth.$t"; exit 1; }
  { echo "COPY auth.$t ($cols) FROM stdin;"; po -c "COPY (SELECT $cols FROM auth.$t) TO STDOUT" | tr -d '\r'; echo '\.'; } >> "$TMP/auth.sql"
done
echo "      $(grep -c '^COPY ' "$TMP/public.sql") tablas de la ERP · $(( $(wc -l < "$TMP/auth.sql") - 4 )) filas de cuentas"
{
  echo "BEGIN;"
  echo "SET session_replication_role = replica;"
  echo "DO \$\$ DECLARE t TEXT; BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t FROM pg_tables WHERE schemaname = 'public';
    IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE'; END IF;
  END \$\$;"
  echo "DELETE FROM auth.identities; DELETE FROM auth.sessions; DELETE FROM auth.refresh_tokens; DELETE FROM auth.users;"
  cat "$TMP/public.sql" "$TMP/auth.sql"
  echo "COMMIT;"
} | pd > /dev/null

echo "3/6 · Fases que el origen no tenía…"
if (( ${#faltan[@]} )); then correr_fases "${faltan[@]}"; else echo "      ninguna"; fi

echo "4/6 · Direcciones de archivos guardadas en los datos → proyecto nuevo…"
pd -At -v viejo="$ORIGEN_URL/storage/v1/" -v nuevo="$DESTINO_URL/storage/v1/" -v final="$FINAL" <<'SQL'
SET session_replication_role = replica;
SET mudar.viejo TO :'viejo';
SET mudar.nuevo TO :'nuevo';
SET mudar.final TO :'final';
CREATE TEMP TABLE _cambios (donde TEXT, filas BIGINT);
DO $$
DECLARE r RECORD; n BIGINT;
  viejo TEXT := current_setting('mudar.viejo'); nuevo TEXT := current_setting('mudar.nuevo');
BEGIN
  FOR r IN
    SELECT c.table_name AS t, c.column_name AS col, c.data_type AS tipo
    FROM information_schema.columns c
    JOIN information_schema.tables x ON x.table_schema = c.table_schema AND x.table_name = c.table_name
    WHERE c.table_schema = 'public' AND x.table_type = 'BASE TABLE' AND c.is_generated = 'NEVER'
      AND c.data_type IN ('text', 'character varying', 'jsonb')
  LOOP
    BEGIN
      IF r.tipo = 'jsonb' THEN
        EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb WHERE strpos(%I::text, $1) > 0', r.t, r.col, r.col, r.col) USING viejo, nuevo;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = replace(%I, $1, $2) WHERE strpos(%I, $1) > 0', r.t, r.col, r.col, r.col) USING viejo, nuevo;
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN INSERT INTO _cambios VALUES (r.t || '.' || r.col, n); END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _cambios VALUES (r.t || '.' || r.col || ' (NO se pudo: ' || SQLERRM || ')', 0);
    END;
  END LOOP;
  -- La dirección de los avisos al celular es la de la app (Netlify), que no cambia. En el ensayo se
  -- apaga aquí, para que el proyecto nuevo no le mande avisos a nadie mientras se prueba.
  IF current_setting('mudar.final') <> 'true' AND to_regclass('public.push_config') IS NOT NULL THEN
    UPDATE public.push_config SET url = NULL WHERE COALESCE(url, '') <> '';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN INSERT INTO _cambios VALUES ('avisos al celular: apagados en el ensayo', n); END IF;
  END IF;
END $$;
SELECT '      ' || COALESCE(string_agg(donde || CASE WHEN filas > 0 THEN ': ' || filas ELSE '' END, E'\n      ' ORDER BY donde), 'Nada que cambiar.') FROM _cambios;
NOTIFY pgrst, 'reload schema';
SQL

echo "5/6 · Archivos…"
ORIGEN_URL="$ORIGEN_URL" ORIGEN_CLAVE="$KO" DESTINO_URL="$DESTINO_URL/storage/v1" DESTINO_CLAVE="$KD" \
  node ops/oracle/copiar-archivos.mjs | sed 's/^/      /' || echo "      (algunos archivos no se copiaron: se puede volver a correr)"

comprobar
echo
if $FINAL; then
  echo "Mudanza lista. Falta: en Netlify cambiar NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y"
  echo "SUPABASE_SERVICE_ROLE_KEY por las del proyecto nuevo, y volver a publicar."
else
  echo "Ensayo listo: el proyecto nuevo tiene todo (sin avisos al celular). Se prueba con una versión de"
  echo "prueba de Netlify apuntada a él; el ERP de todos sigue en el proyecto de origen."
fi
