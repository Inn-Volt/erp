#!/usr/bin/env bash
# Funciones compartidas de migrar-desde-supabase.sh, respaldo.sh y restaurar.sh: sacar y cargar los
# DATOS de la ERP (la estructura la crean siempre los SQL de siempre, con migraciones.sh).
#   · public: todas las tablas de la ERP (pg_dump, solo datos).
#   · auth: las cuentas y sus contraseñas (users e identities), solo con las columnas que existen en
#     los dos lados: así sirve aunque el login de Supabase sea de otra versión.
# Uso: source ops/oracle/comun.sh  (desde la raíz del repositorio)

DC=(docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env)
# shellcheck disable=SC1091
set -a; source ops/oracle/.env; set +a
# Como supabase_admin (el superusuario del servidor): cargar datos pide apagar los disparadores
# (session_replication_role) y tocar las tablas del login y de los archivos, que no son de postgres.
LOCAL="postgresql://supabase_admin:${POSTGRES_PASSWORD}@localhost:5432/postgres"
# Dónde están los datos (en .env la ruta es relativa a ops/oracle, como en docker-compose.yml).
case "${DATOS:-./datos}" in /*) DIR_DATOS="$DATOS" ;; *) DIR_DATOS="$PWD/ops/oracle/${DATOS#./}" ;; esac
# Los archivos los escribe el servicio de Storage como root: se empaquetan desde un contenedor
# (node:22-alpine, la misma imagen que copia los archivos al migrar: no hay que bajar otra).
archivos_a_tgz() { docker run --rm -v "$DIR_DATOS:/d:ro" -v "$(dirname "$1"):/o" node:22-alpine tar -czf "/o/$(basename "$1")" -C /d storage; }
tgz_a_archivos() {
  docker run --rm -v "$DIR_DATOS:/d" -v "$(cd "$(dirname "$1")" && pwd):/o:ro" node:22-alpine \
    sh -c "rm -rf /d/storage.antes; [ -d /d/storage ] && mv /d/storage /d/storage.antes; tar -xzf /o/$(basename "$1") -C /d"
}

# psql dentro del contenedor de la base. Con -c (una consulta), sin entrada: «docker compose exec»
# se come lo que llega por la entrada, y en un script que después pregunta algo, se comería la respuesta.
psql_en() {
  local a
  for a in "${@:2}"; do
    [[ "$a" == -c ]] && { "${DC[@]}" exec -T db psql "$1" -v ON_ERROR_STOP=1 -q "${@:2}" < /dev/null; return; }
  done
  "${DC[@]}" exec -T db psql "$1" -v ON_ERROR_STOP=1 -q "${@:2}"
}

# Columnas comunes (no generadas) de una tabla de auth entre el origen y la base local.
columnas_comunes() {   # columnas_comunes <conexión origen> <tabla>
  local q="select column_name from information_schema.columns where table_schema = 'auth' and table_name = '$2' and is_generated = 'NEVER' order by 1"
  comm -12 <(psql_en "$1" -At -c "$q" | tr -d '\r' | sort) <(psql_en "$LOCAL" -At -c "$q" | tr -d '\r' | sort) | sed 's/.*/"&"/' | paste -sd, -
}

# Saca los datos a <carpeta>/public.sql y <carpeta>/auth.sql.
sacar_datos() {   # sacar_datos <conexión origen> <carpeta>
  local origen="$1" dir="$2" t cols
  "${DC[@]}" exec -T db pg_dump "$origen" --data-only --no-owner --no-privileges -n public < /dev/null > "$dir/public.sql"
  : > "$dir/auth.sql"
  for t in users identities; do
    cols=$(columnas_comunes "$origen" "$t")
    [[ -n "$cols" ]] || { echo "No se pudieron leer las columnas de auth.$t"; return 1; }
    { echo "COPY auth.$t ($cols) FROM stdin;"; psql_en "$origen" -c "COPY (SELECT $cols FROM auth.$t) TO STDOUT"; echo '\.'; } >> "$dir/auth.sql"
  done
  echo "Datos: $(grep -c '^COPY ' "$dir/public.sql") tablas de la ERP y $(grep -c . "$dir/auth.sql") líneas de cuentas."
}

# Reemplaza TODOS los datos de la base local por los de <carpeta> (en una sola transacción: si algo
# falla, la base queda como estaba). Los disparadores no corren al cargar (avisos, reglas).
cargar_datos() {   # cargar_datos <carpeta>
  local dir="$1"
  {
    echo "BEGIN;"
    echo "SET session_replication_role = replica;"
    echo "DO \$\$ DECLARE t TEXT; BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t FROM pg_tables WHERE schemaname = 'public';
      IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE'; END IF;
    END \$\$;"
    echo "DELETE FROM auth.identities; DELETE FROM auth.sessions; DELETE FROM auth.refresh_tokens; DELETE FROM auth.users;"
    cat "$dir/public.sql" "$dir/auth.sql"
    echo "COMMIT;"
  } | psql_en "$LOCAL"
  psql_en "$LOCAL" -c "NOTIFY pgrst, 'reload schema';"
}

# Lo guardado en los datos con una dirección completa pasa de <vieja> a <nueva>: las direcciones de
# archivos (el logo de cada empresa, bucket público «logos») y la de los avisos al celular
# (push_config.url, a la que llama la base). Sin disparadores: no va a la auditoría ni toca «actualizado».
apuntar_direcciones() {   # apuntar_direcciones <dirección vieja> <dirección nueva>
  psql_en "$LOCAL" -At -v viejo="${1%/}/storage/v1/" -v nuevo="${2%/}/storage/v1/" -v push="${2%/}/api/push" <<'SQL'
SET session_replication_role = replica;
SET migrar.viejo TO :'viejo';
SET migrar.nuevo TO :'nuevo';
SET migrar.push TO :'push';
CREATE TEMP TABLE _cambios (donde TEXT, filas BIGINT);
DO $$
DECLARE
  viejo TEXT := current_setting('migrar.viejo');
  nuevo TEXT := current_setting('migrar.nuevo');
  r RECORD; n BIGINT;
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
        EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb WHERE strpos(%I::text, $1) > 0',
                       r.t, r.col, r.col, r.col) USING viejo, nuevo;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = replace(%I, $1, $2) WHERE strpos(%I, $1) > 0',
                       r.t, r.col, r.col, r.col) USING viejo, nuevo;
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN INSERT INTO _cambios VALUES (r.t || '.' || r.col, n); END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _cambios VALUES (r.t || '.' || r.col || ' (NO se pudo: ' || SQLERRM || ')', 0);
    END;
  END LOOP;
  IF to_regclass('public.push_config') IS NOT NULL THEN
    UPDATE public.push_config SET url = current_setting('migrar.push') WHERE COALESCE(url, '') <> '';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN INSERT INTO _cambios VALUES ('avisos al celular → ' || current_setting('migrar.push'), n); END IF;
  END IF;
END $$;
SELECT '      ' || COALESCE(string_agg(donde || CASE WHEN filas > 0 THEN ': ' || filas ELSE '' END, E'\n      ' ORDER BY donde), 'Nada que cambiar.') FROM _cambios;
SQL
}
