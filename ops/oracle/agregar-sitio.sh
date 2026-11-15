#!/usr/bin/env bash
# Suma el sitio innvolt.cl (repo Inn-Volt/innvolt.cl) al servidor de InnVolt, al lado de la ERP:
# lo clona en /opt/innvolt/sitio, lo construye y Caddy lo publica con su certificado.
# Se puede repetir: primero con una dirección de prueba y después con la definitiva.
#
#   sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/agregar-sitio.sh sitio.152-67-10-20.sslip.io   (prueba)
#   sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/agregar-sitio.sh innvolt.cl                     (definitiva, con www)
#
# Antes, en ops/oracle/.env, lo que hoy está en Netlify para el sitio: SITIO_GA_ID, SITIO_EMAILJS_*
# y GOOGLE_PLACES_API_KEY (si faltan, el sitio funciona sin estadísticas, formulario o reseñas).
set -euo pipefail
cd "$(dirname "$0")/../.."
D="${1:?Uso: agregar-sitio.sh <dominio>   (ej. innvolt.cl o sitio.IP-CON-GUIONES.sslip.io)}"
[[ "$D" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "Dominio no válido: $D"; exit 1; }
REPO_SITIO="${REPO_SITIO:-https://github.com/Inn-Volt/innvolt.cl.git}"
CODIGO="$(cd .. && pwd)/sitio"
ENV=ops/oracle/.env

# Deja CLAVE="valor" en .env (reemplaza la línea o la agrega al final). Entre comillas: los scripts
# también leen el .env con bash, y «innvolt.cl, www.innvolt.cl» lleva un espacio.
poner() {
  if grep -q "^$1=" "$ENV"; then sed -i "s|^$1=.*|$1=\"$2\"|" "$ENV"; else echo "$1=\"$2\"" >> "$ENV"; fi
}

echo "Según el DNS, $D apunta a: $(getent ahostsv4 "$D" | awk 'NR==1{print $1}' || true)"
echo "(debe ser la IP pública de este servidor; si no, Caddy no puede sacar el certificado)."

if [[ -d "$CODIGO/.git" ]]; then
  git -C "$CODIGO" pull --quiet --ff-only
else
  # El repositorio del sitio es público. Si se vuelve privado: clave de solo lectura propia
  # (GitHub no deja usar la misma clave en dos repositorios) y REPO_SITIO=git@…
  git clone --quiet --branch main "$REPO_SITIO" "$CODIGO"
fi
echo "Sitio: $(git -C "$CODIGO" log --oneline -1)"

# Con www solo en un dominio propio (en sslip.io no hace falta).
if [[ "$D" == *.sslip.io ]]; then DIRS="$D"; else DIRS="$D, www.$D"; fi
grep -q "^# ── El sitio" "$ENV" || printf '\n# ── El sitio innvolt.cl (agregar-sitio.sh) ──\n' >> "$ENV"
poner SITIO "$D"
poner SITIO_CADDY "$DIRS"
poner SITIO_CODIGO "$CODIGO"
poner COMPOSE_PROFILES sitio
for v in SITIO_GA_ID SITIO_EMAILJS_SERVICE SITIO_EMAILJS_TEMPLATE SITIO_EMAILJS_KEY SITIO_EMAILJS_AUTOREPLY GOOGLE_PLACES_API_KEY; do
  grep -q "^$v=" "$ENV" || echo "$v=" >> "$ENV"
done

DC=(docker compose -f ops/oracle/docker-compose.yml --env-file "$ENV")
echo "Construyendo el sitio (la primera vez, unos minutos)…"
"${DC[@]}" build sitio
"${DC[@]}" up -d sitio caddy
"${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
echo
echo "Listo: https://$D (el certificado puede tardar un minuto la primera vez)."
[[ "$D" == *.sslip.io ]] || echo "También https://www.$D, que lleva a https://$D."
