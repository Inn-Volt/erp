#!/usr/bin/env bash
# Pruebas de la base: levanta un Postgres de Supabase desechable (Docker), corre todas las
# migraciones en orden (como en producción: esquema → datos de antes → fases 1 a 15, la 15
# dos veces para probar que es idempotente) y después las pruebas. Sale con error si algo falla.
# Uso: bash tests/sql/correr.sh            (desde la raíz del repo; necesita Docker)
set -uo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../.."
C=innvolt_ci_db
psql_c() { docker exec "$C" psql -U "${2:-postgres}" -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -q -f "/tmp/$1"; }
fallo=0

# La misma imagen está en Docker Hub y en el registro público de AWS (que a veces limita las
# descargas desde GitHub): se usa la primera que baje.
IMG=
for i in supabase/postgres:17.6.1.139 public.ecr.aws/supabase/postgres:17.6.1.139; do
  for _ in 1 2 3; do docker pull -q "$i" >/dev/null 2>&1 && IMG=$i && break 2; sleep 10; done
done
[ -n "$IMG" ] || { echo "::error::No se pudo bajar la imagen de Postgres de Supabase"; exit 1; }

docker rm -f "$C" >/dev/null 2>&1
docker run -d --name "$C" -e POSTGRES_PASSWORD=solo_para_pruebas "$IMG" >/dev/null || { echo "::error::No partió el contenedor de prueba"; exit 1; }
for _ in $(seq 1 60); do docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 2; done
sleep 5

copiar() { docker cp "$1" "$C:/tmp/$(basename "$1")" >/dev/null; }
correr() {  # correr <archivo> [usuario]
  copiar "$1"
  if ! salida=$(psql_c "$(basename "$1")" "${2:-postgres}" 2>&1); then
    echo "::error::Falló $1"; echo "$salida" | grep -v "NOTICE\|skipping" | tail -15; fallo=1
  fi
}

correr tests/sql/stub_storage.sql supabase_admin
for f in supabase_schema.sql supabase_solicitudes.sql supabase_agenda.sql supabase_mejoras_comerciales.sql; do correr "$f"; done

# Datos "de antes": dos usuarios y algo de historia, como la base real.
docker exec "$C" psql -U supabase_admin -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -q -c "
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111', 'cesar@innvolt.cl', '{\"nombre\":\"César\"}'),
 ('22222222-2222-2222-2222-222222222222', 'joaquin@innvolt.cl', '{\"nombre\":\"Joaquín\"}');
insert into public.clientes (id, nombre_cliente, rut) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Comercial Andes', '76.543.210-K');
insert into public.cotizaciones (id, cliente_id, estado, total) values
 ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Pendiente', 1000000),
 ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Aceptado', 500000);" >/dev/null || fallo=1

for n in 1_usuarios_permisos 2_operacion 3_cotizador 4_cotizador_tecapp 5_tecapp_operacion 6_ot_terreno 7_flujo 8_informes \
         9_planillas 10_visita_tecnico 11_levantamientos 12_avisos_agenda 13_utilidad 14_push 15_revision 15_revision 16_aperturas 16_aperturas; do
  echo "== supabase_fase$n.sql"; correr "supabase_fase$n.sql"
done

for t in tests/sql/pruebas_*.sql; do
  copiar "$t"
  res=$(docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -q -f "/tmp/$(basename "$t")" 2>&1 | grep -E "^ (OK|FALLA) |OK / ")
  echo "$res"
  echo "$res" | grep -q "FALLA" && fallo=1
  echo "$res" | grep -q " 0 fallas" || fallo=1
done

docker rm -f "$C" >/dev/null 2>&1
[ $fallo -eq 0 ] && echo "Base: todo OK" || echo "::error::Hay pruebas de la base que fallaron"
exit $fallo
