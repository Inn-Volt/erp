#!/usr/bin/env bash
# Crea ops/oracle/.env con claves nuevas para el servidor de InnVolt (solo la primera vez: si ya
# existe, no lo toca). Las claves quedan solo en el servidor; nunca van al repositorio.
#
#   bash ops/oracle/generar-env.sh erp.innvolt.cl
#   bash ops/oracle/generar-env.sh 127-0-0-1.sslip.io --prueba-local     (en un computador, para probar)
set -euo pipefail
cd "$(dirname "$0")"
DOMINIO="${1:?Uso: generar-env.sh <dominio> [--prueba-local]}"
PRUEBA="${2:-}"
[[ -f .env ]] && { echo "ops/oracle/.env ya existe: no se cambia (las claves de la base y del login van juntas)."; exit 0; }

azar() { openssl rand -hex "$1"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
JWT_SECRET=$(azar 32)
AHORA=$(date +%s); HASTA=$((AHORA + 10 * 365 * 24 * 3600))
jwt() {   # jwt <rol>: la clave «anon» o «service_role», firmada con JWT_SECRET (10 años)
  local h p f
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$AHORA" "$HASTA" | b64url)
  f=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  echo "$h.$p.$f"
}

if [[ "$PRUEBA" == "--prueba-local" ]]; then
  URL="http://$DOMINIO:8088"; SITIO="http://$DOMINIO:8088"; HTTP="8088:8088"; HTTPS="8443:443"; BUFFERS=256MB; CACHE=1GB
else
  URL="https://$DOMINIO"; SITIO="$DOMINIO"; HTTP="80:80"; HTTPS="443:443"; BUFFERS=2GB; CACHE=6GB
fi

umask 077
cat > .env <<EOF
# ── Servidor de InnVolt (Oracle). Generado el $(date +%F). NO subir al repositorio. ──
DOMINIO=$DOMINIO
URL_PUBLICA=$URL
CADDY_SITIO=$SITIO
PUBLICAR_HTTP=$HTTP
PUBLICAR_HTTPS=$HTTPS
DATOS=./datos
PG_SHARED_BUFFERS=$BUFFERS
PG_EFFECTIVE_CACHE=$CACHE

# Base de datos y login (van juntas: si se cambia JWT_SECRET, hay que rehacer ANON_KEY y SERVICE_ROLE_KEY).
POSTGRES_PASSWORD=$(azar 24)
JWT_SECRET=$JWT_SECRET
ANON_KEY=$(jwt anon)
SERVICE_ROLE_KEY=$(jwt service_role)
SECRET_KEY_BASE=$(azar 32)

# Correo de «Olvidé mi contraseña» (opcional). Gmail: smtp.gmail.com, 465, la cuenta y una «clave de
# aplicación». Resend: smtp.resend.com, 465, usuario «resend», clave = la API key.
SMTP_HOST=
SMTP_PORT=465
SMTP_USUARIO=
SMTP_CLAVE=
SMTP_REMITENTE=

# Lo mismo que hoy está en Netlify (Site configuration → Environment variables): copiarlo aquí.
PUSH_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
RESEND_API_KEY=
CORREO_REMITENTE=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
IA_PROVIDER=
IA_MODEL=
GEMINI_MODEL=
GROQ_MODEL=
GOOGLE_SHEET_ID=

# Respaldo diario fuera del servidor: URL de escritura (PAR) del bucket «innvolt-respaldos» en Object
# Storage, terminada en «/o/». Vacío: el respaldo queda solo en el servidor.
RESPALDO_PAR_URL=
EOF
echo "Listo: ops/oracle/.env (solo legible por este usuario). Completa lo de Netlify antes de construir la app."
