#!/usr/bin/env bash
# Cambia la dirección de la ERP (por ejemplo, del ensayo con sslip.io a erp.innvolt.cl) sin tocar las
# claves ni los datos: ajusta ops/oracle/.env, reconstruye la app (la dirección va dentro del código
# del navegador), Caddy saca el certificado nuevo y lo guardado en los datos pasa a la nueva dirección.
# El DNS de la nueva dirección tiene que apuntar YA a este servidor (si no, no hay certificado).
#
#   sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/cambiar-direccion.sh erp.innvolt.cl
set -euo pipefail
cd "$(dirname "$0")/../.."
NUEVO="${1:?Uso: cambiar-direccion.sh <dominio>   (ej. erp.innvolt.cl)}"
[[ "$NUEVO" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "Dominio no válido: $NUEVO"; exit 1; }
source ops/oracle/comun.sh
[[ "${PUBLICAR_HTTP:-}" == "80:80" ]] || { echo "Es para el servidor: la prueba local se rehace con generar-env.sh."; exit 1; }
[[ "$DOMINIO" != "$NUEVO" ]] || { echo "La ERP ya está en $NUEVO."; exit 0; }
VIEJA="$URL_PUBLICA"

echo "Hoy: $VIEJA   →   Nueva: https://$NUEVO"
echo "Según el DNS, $NUEVO apunta a: $(getent ahostsv4 "$NUEVO" | awk 'NR==1{print $1}' || true)"
echo "(debe ser la IP pública de este servidor)."
read -r -p "Escribe CAMBIAR para seguir: " ok || true
[[ "$ok" == "CAMBIAR" ]] || { echo "Cancelado."; exit 1; }

cp ops/oracle/.env "ops/oracle/.env.antes-$(date +%F-%H%M)"
sed -i "s|^DOMINIO=.*|DOMINIO=$NUEVO|; s|^URL_PUBLICA=.*|URL_PUBLICA=https://$NUEVO|; s|^CADDY_SITIO=.*|CADDY_SITIO=$NUEVO|" ops/oracle/.env
source ops/oracle/comun.sh
echo "1/3 · Reconstruyendo la app con la nueva dirección…"
"${DC[@]}" build app
echo "2/3 · Cambiando el login, la app y Caddy (certificado nuevo)…"
"${DC[@]}" up -d
echo "3/3 · Apuntando las direcciones guardadas a $URL_PUBLICA…"
apuntar_direcciones "$VIEJA" "$URL_PUBLICA"
"${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
echo
echo "Listo: la ERP está en $URL_PUBLICA (el certificado puede tardar un minuto la primera vez)."
echo "Todos vuelven a iniciar sesión; en el celular, instalar la app de nuevo y activar los avisos."
echo "El .env anterior quedó como respaldo en ops/oracle/.env.antes-*."
