#!/usr/bin/env bash
# Prueba completa del servidor de InnVolt en una máquina limpia (GitHub Actions, ARM como el Ampere
# de Oracle). Recorre lo mismo que se hará en Oracle, con los scripts de verdad:
#   1. un «Supabase de origen» (el mismo stack, otro proyecto) con datos y fases solo hasta la 14;
#   2. el servidor nuevo: estructura, app construida, todo arriba;
#   3. migrar-desde-supabase.sh → login con la misma contraseña, datos, logo, archivos, campanita, app;
#   4. respaldo.sh → se borra algo → restaurar.sh → todo de vuelta;
#   5. agregar-sitio.sh (innvolt.cl de verdad, en una dirección local con HTTPS);
#   6. cambiar-direccion.sh a una dirección con HTTPS (80/443 como en Oracle).
# Necesita Docker, Node 22 y `npm ci` hecho en la raíz. Sale con error al primer fallo.
set -euo pipefail
cd "$(dirname "$0")/../../.."
[[ "${CI:-}" == true ]] || { echo "Solo en una máquina desechable (GitHub Actions): borra ops/oracle/.env y los datos."; exit 1; }
OR=/tmp/origen
DATOS_OR=/tmp/origen-datos
grupo() { echo "::group::$*"; }
fin() { echo "::endgroup::"; }
falla() { echo "::error::$*"; exit 1; }
val() { grep "^$1=" "$2" | head -1 | cut -d= -f2- | tr -d '"'; }   # val CLAVE archivo.env
DC=(docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env)
sql() { "${DC[@]}" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "$1"; }
espera() {   # espera <descripción> <comando…>: hasta 3 minutos
  local que="$1"; shift
  for _ in $(seq 1 90); do "$@" >/dev/null 2>&1 && return 0; sleep 2; done
  falla "No llegó: $que"
}

grupo "0 · Imágenes (Docker Hub o, si limita, el registro público de AWS)"
for i in supabase/postgres:17.6.1.139 supabase/gotrue:v2.191.0 postgrest/postgrest:v14.13 supabase/realtime:v2.148.3 \
         supabase/storage-api:v1.89.12 caddy:2.10 node:22-alpine; do
  case "$i" in
    supabase/*) espejo="public.ecr.aws/$i" ;;
    postgrest/*) espejo="public.ecr.aws/supabase/${i#postgrest/}" ;;
    *) espejo="public.ecr.aws/docker/library/$i" ;;
  esac
  docker pull -q "$i" >/dev/null 2>&1 || { docker pull -q "$espejo" >/dev/null && docker tag "$espejo" "$i"; } || falla "No bajó $i"
  echo "ok $i"
done
echo "127.0.0.1 erp.innvolt.test origen-caddy" | sudo tee -a /etc/hosts >/dev/null
fin

grupo "1 · Supabase de origen (fases hasta la 14, con datos como la base real)"
rm -rf "$OR" "$DATOS_OR"; mkdir -p "$OR"
cp -r ops supabase_*.sql "$OR/"
rm -f "$OR/ops/oracle/.env"
bash "$OR/ops/oracle/generar-env.sh" origen-caddy --prueba-local >/dev/null
sed -i "s|^URL_PUBLICA=.*|URL_PUBLICA=http://origen-caddy:9088|; s|^CADDY_SITIO=.*|CADDY_SITIO=:9088|; \
        s|^PUBLICAR_HTTP=.*|PUBLICAR_HTTP=9088:9088|; s|^PUBLICAR_HTTPS=.*|PUBLICAR_HTTPS=9443:443|; \
        s|^DATOS=.*|DATOS=$DATOS_OR|" "$OR/ops/oracle/.env"
echo "PUERTO_DB=5433" >> "$OR/ops/oracle/.env"
(
  cd "$OR"; export COMPOSE_PROJECT_NAME=origen
  DCO=(docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env)
  "${DCO[@]}" up -d db auth rest storage realtime
  "${DCO[@]}" up -d --no-deps caddy
  bash ops/oracle/migraciones.sh supabase_schema.sql supabase_solicitudes.sql supabase_agenda.sql supabase_mejoras_comerciales.sql
  # Datos «de antes de la fase 1», como en tests/sql/correr.sh: las fases los traspasan.
  "${DCO[@]}" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "
    insert into public.clientes (id, nombre_cliente, rut) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Comercial Andes', '76.543.210-K');
    insert into public.cotizaciones (id, cliente_id, estado, total) values
      ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Pendiente', 1000000),
      ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Aceptado', 500000);"
  f=(); for n in 1_usuarios_permisos 2_operacion 3_cotizador 4_cotizador_tecapp 5_tecapp_operacion 6_ot_terreno 7_flujo 8_informes \
                 9_planillas 10_visita_tecnico 11_levantamientos 12_avisos_agenda 13_utilidad 14_push; do f+=("supabase_fase$n.sql"); done
  bash ops/oracle/migraciones.sh "${f[@]}"
  "${DCO[@]}" exec -T db psql -U postgres -d postgres -q -c "update public.push_config set url = 'https://innvolt.netlify.app/api/push', secreto = 'secreto-de-antes'"
)
espera "Storage del origen" curl -fsS http://origen-caddy:9088/storage/v1/status
URL=http://origen-caddy:9088 ANON=$(val ANON_KEY "$OR/ops/oracle/.env") SERVICE=$(val SERVICE_ROLE_KEY "$OR/ops/oracle/.env") \
  node ops/oracle/prueba/cliente.mjs sembrar
fin

grupo "2 · El servidor nuevo: estructura, app y todo arriba"
rm -f ops/oracle/.env; rm -rf ops/oracle/datos ops/oracle/respaldos
bash ops/oracle/generar-env.sh erp.innvolt.test --prueba-local
"${DC[@]}" up -d db auth rest storage realtime
bash ops/oracle/migraciones.sh
bash ops/oracle/actualizar.sh
espera "la app sana" sh -c "[ \"\$(${DC[*]} ps --format '{{.Health}}' app)\" = healthy ]"
espera "Caddy → login" curl -fsS http://erp.innvolt.test:8088/auth/v1/health
espera "Caddy → app" curl -fsS -o /dev/null http://erp.innvolt.test:8088/login
fin

grupo "3 · Migrar desde el origen y verificar"
docker network connect --alias origen-db innvolt_default origen-db-1 || falla "No se pudo conectar la base del origen"
# El Caddy del origen no se conecta directo: en dos redes vería dos «storage» (el suyo y el del
# servidor nuevo). Un relevo, que lo busca por su nombre único, lo publica en la red nueva.
docker run -d --name origen-relevo --network origen_default caddy:2.10 \
  caddy reverse-proxy --from :9088 --to origen-caddy-1:9088 >/dev/null || falla "No partió el relevo del origen"
docker network connect --alias origen-caddy innvolt_default origen-relevo || falla "No se pudo conectar el relevo del origen"
echo "Origen conectado a la red del servidor nuevo."
ORIGEN="postgresql://postgres:$(val POSTGRES_PASSWORD "$OR/ops/oracle/.env")@origen-db:5432/postgres"
printf 'MIGRAR\n%s\n%s\n%s\n' "$ORIGEN" "http://origen-caddy:9088" "$(val SERVICE_ROLE_KEY "$OR/ops/oracle/.env")" \
  | bash ops/oracle/migrar-desde-supabase.sh
export URL=http://erp.innvolt.test:8088 ANON=$(val ANON_KEY ops/oracle/.env) SERVICE=$(val SERVICE_ROLE_KEY ops/oracle/.env)
node ops/oracle/prueba/cliente.mjs verificar
[[ "$(sql "select url from public.push_config")" == "$URL/api/push" ]] || falla "push_config.url no quedó en el servidor nuevo"
[[ "$(sql "select to_regclass('public.fondo_movimientos') is not null")" == t ]] || falla "No se corrió la fase 19 que faltaba en el origen"
echo "OK   avisos al celular apuntando a $URL/api/push; fases 15 a 19 corridas tras migrar"
fin

grupo "4 · Respaldo, borrar algo y restaurar"
bash ops/oracle/respaldo.sh
DATOS_TGZ=$(ls ops/oracle/respaldos/innvolt-*-datos.tgz | tail -1)
ARCH_TGZ=$(ls ops/oracle/respaldos/innvolt-*-archivos.tgz | tail -1)
sql "delete from public.cotizaciones where total = 500000" >/dev/null
curl -fsS -X DELETE "$URL/storage/v1/object/cotizaciones/cccccccc-0000-0000-0000-000000000001/condiciones.txt" \
  -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" >/dev/null
[[ "$(sql "select count(*) from public.cotizaciones")" == 1 ]] || falla "No se borró la cotización de prueba"
echo RESTAURAR | bash ops/oracle/restaurar.sh "$DATOS_TGZ" "$ARCH_TGZ"
espera "Storage tras restaurar" curl -fsS "$URL/storage/v1/status"
node ops/oracle/prueba/cliente.mjs verificar
fin

grupo "5 · El sitio innvolt.cl (repo de verdad) con HTTPS local"
bash ops/oracle/agregar-sitio.sh sitio.innvolt.localhost
R=(--resolve sitio.innvolt.localhost:8443:127.0.0.1 --resolve www.sitio.innvolt.localhost:8443:127.0.0.1)
espera "el sitio" curl -fsSk "${R[@]}" -o /dev/null https://sitio.innvolt.localhost:8443/
curl -fsSk "${R[@]}" https://sitio.innvolt.localhost:8443/ | grep -qi innvolt || falla "El sitio no muestra InnVolt"
loc=$(curl -sSk "${R[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' https://www.sitio.innvolt.localhost:8443/)
[[ "$loc" == "301 https://sitio.innvolt.localhost/" ]] || falla "www no lleva al sitio sin www ($loc)"
curl -fsS -o /dev/null "$URL/auth/v1/health" || falla "La ERP dejó de responder al sumar el sitio"
echo "OK   sitio con HTTPS, www → sin www, la ERP sigue respondiendo"
fin

grupo "6 · Cambiar la dirección a una con HTTPS en 80/443 (como en Oracle)"
sed -i 's|^PUBLICAR_HTTP=.*|PUBLICAR_HTTP=80:80|; s|^PUBLICAR_HTTPS=.*|PUBLICAR_HTTPS=443:443|' ops/oracle/.env
echo CAMBIAR | bash ops/oracle/cambiar-direccion.sh erp2.innvolt.localhost
N=https://erp2.innvolt.localhost
H=(--resolve erp2.innvolt.localhost:443:127.0.0.1)
espera "HTTPS en la dirección nueva" curl -fsSk "${H[@]}" "$N/auth/v1/health"
logo=$(sql "select logo_url from public.empresas where nombre = 'Empresa de prueba'")
[[ "$logo" == "$N/storage/v1/object/public/logos/"* ]] || falla "El logo no pasó a la dirección nueva ($logo)"
curl -fsSk "${H[@]}" -o /dev/null "$logo" || falla "El logo no se descarga en la dirección nueva"
[[ "$(sql "select url from public.push_config")" == "$N/api/push" ]] || falla "push_config.url no pasó a la dirección nueva"
tok=$(curl -fsSk "${H[@]}" "$N/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
      -d '{"email":"cesar@prueba.cl","password":"Prueba-Clave-2026"}' | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
[[ -n "$tok" ]] || falla "No se pudo iniciar sesión en la dirección nueva"
n=$(curl -fsSk "${H[@]}" "$N/rest/v1/cotizaciones?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $tok" | grep -o '"id"' | wc -l)
[[ "$n" == 2 ]] || falla "En la dirección nueva no se ven las 2 cotizaciones ($n)"
echo "OK   HTTPS en $N: login, datos, logo y avisos en la dirección nueva"
fin

"${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
echo "PRUEBA COMPLETA: todo OK"
