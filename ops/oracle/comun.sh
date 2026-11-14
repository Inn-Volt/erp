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
LOCAL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
# Dónde están los datos (en .env la ruta es relativa a ops/oracle, como en docker-compose.yml).
case "${DATOS:-./datos}" in /*) DIR_DATOS="$DATOS" ;; *) DIR_DATOS="$PWD/ops/oracle/${DATOS#./}" ;; esac
# Los archivos los escribe el servicio de Storage como root: se empaquetan desde un contenedor
# (node:22-alpine, la misma imagen que copia los archivos al migrar: no hay que bajar otra).
archivos_a_tgz() { docker run --rm -v "$DIR_DATOS:/d:ro" -v "$(dirname "$1"):/o" node:22-alpine tar -czf "/o/$(basename "$1")" -C /d storage; }
tgz_a_archivos() {
  docker run --rm -v "$DIR_DATOS:/d" -v "$(cd "$(dirname "$1")" && pwd):/o:ro" node:22-alpine \
    sh -c "rm -rf /d/storage.antes; [ -d /d/storage ] && mv /d/storage /d/storage.antes; tar -xzf /o/$(basename "$1") -C /d"
}

psql_en() { "${DC[@]}" exec -T db psql "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }

# Columnas comunes (no generadas) de una tabla de auth entre el origen y la base local.
columnas_comunes() {   # columnas_comunes <conexión origen> <tabla>
  local q="select column_name from information_schema.columns where table_schema = 'auth' and table_name = '$2' and is_generated = 'NEVER' order by 1"
  comm -12 <(psql_en "$1" -At -c "$q" | tr -d '\r' | sort) <(psql_en "$LOCAL" -At -c "$q" | tr -d '\r' | sort) | sed 's/.*/"&"/' | paste -sd, -
}

# Saca los datos a <carpeta>/public.sql y <carpeta>/auth.sql.
sacar_datos() {   # sacar_datos <conexión origen> <carpeta>
  local origen="$1" dir="$2" t cols
  "${DC[@]}" exec -T db pg_dump "$origen" --data-only --no-owner --no-privileges -n public > "$dir/public.sql"
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
