#!/usr/bin/env bash
# Deja listo el servidor de InnVolt en Oracle Cloud (Ubuntu 24.04, Ampere A1), desde cero y gratis:
# Docker, swap, firewall, actualizaciones de seguridad, el usuario «innvolt», el código (con una
# clave de solo lectura), las claves del servidor, la base con su estructura y el respaldo diario.
# Solo InnVolt: no toca nada de otros sistemas (VSX vive en otro servidor y otro compartimento).
#
# En el servidor, como «ubuntu»:
#   sudo bash preparar-servidor.sh app.innvolt.cl
#
# Se puede repetir sin romper nada: lo que ya existe (claves, .env, swap, datos) se respeta.
set -euo pipefail
DOMINIO="${1:?Uso: sudo bash preparar-servidor.sh <dominio>   (ej. app.innvolt.cl o 146-1-2-3.sslip.io)}"
USUARIO=innvolt
BASE=/opt/innvolt
APP=$BASE/erp
REPO=git@github.com:Inn-Volt/erp.git
RAMA=main
paso() { echo; echo "══ $* ══"; }
[[ $EUID -eq 0 ]] || { echo "Ejecutar con sudo."; exit 1; }

paso "Paquetes y actualizaciones de seguridad automáticas"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get install -y -q docker.io docker-compose-v2 git curl openssl unattended-upgrades cron
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null || true

paso "Swap (memoria de reserva al construir la app)"
if ! swapon --show | grep -q swapfile-innvolt; then
  fallocate -l 4G /swapfile-innvolt && chmod 600 /swapfile-innvolt && mkswap /swapfile-innvolt >/dev/null && swapon /swapfile-innvolt
  grep -q "^/swapfile-innvolt " /etc/fstab || echo "/swapfile-innvolt none swap sw 0 0" >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-innvolt.conf && sysctl -q -p /etc/sysctl.d/90-innvolt.conf
swapon --show

paso "Usuario «innvolt»"
id "$USUARIO" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /bin/bash "$USUARIO"
usermod -aG docker "$USUARIO"
install -d -o "$USUARIO" -g "$USUARIO" -m 700 "$BASE/.ssh"

paso "Firewall del servidor (80 y 443)"
REGLAS=/etc/iptables/rules.v4
if [[ -f "$REGLAS" ]] && grep -q "icmp-host-prohibited" "$REGLAS"; then
  # Imagen de Oracle: trae reglas que rechazan todo salvo SSH. Se abren 80 y 443 (como en VSX):
  # al archivo se agrega solo esta regla, no las cadenas de Docker.
  for PUERTO in 80 443; do
    iptables -C INPUT -p tcp --dport "$PUERTO" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 1 -p tcp --dport "$PUERTO" -m conntrack --ctstate NEW -j ACCEPT
    grep -Eq -- "--dport $PUERTO .*-j ACCEPT" "$REGLAS" \
      || sed -i "0,/^-A INPUT .*icmp-host-prohibited/s//-A INPUT -p tcp -m tcp --dport $PUERTO -m conntrack --ctstate NEW -j ACCEPT\n&/" "$REGLAS"
  done
  echo "Abiertos. También deben estar abiertos en la Security List de la red de InnVolt (Ingress 0.0.0.0/0, TCP 80 y 443)."
fi

paso "Código (clave de solo lectura en GitHub → Inn-Volt/erp → Settings → Deploy keys)"
[[ -f "$BASE/.ssh/id_ed25519" ]] || sudo -u "$USUARIO" ssh-keygen -q -t ed25519 -N "" -C "innvolt-servidor-lectura" -f "$BASE/.ssh/id_ed25519"
sudo -u "$USUARIO" sh -c "ssh-keyscan -t ed25519 github.com 2>/dev/null >> $BASE/.ssh/known_hosts; sort -u -o $BASE/.ssh/known_hosts $BASE/.ssh/known_hosts"
if [[ ! -d "$APP/.git" ]]; then
  echo "Agrega esta clave en GitHub → Inn-Volt/erp → Settings → Deploy keys → Add deploy key"
  echo "(nombre «servidor oracle», SIN marcar «Allow write access»):"
  echo; cat "$BASE/.ssh/id_ed25519.pub"; echo
  read -r -p "Presiona Enter cuando esté agregada… " _
  sudo -u "$USUARIO" git clone --quiet --branch "$RAMA" "$REPO" "$APP"
else
  sudo -u "$USUARIO" git -C "$APP" pull --quiet --ff-only
fi

paso "Claves del servidor (ops/oracle/.env)"
sudo -u "$USUARIO" bash "$APP/ops/oracle/generar-env.sh" "$DOMINIO"
# La base según la memoria de la máquina: 1/6 para su caché y la mitad como estimación del sistema
# (6 GB → ~1 GB y ~3 GB; 12 GB → ~2 GB y ~6 GB). Si la máquina cambia de tamaño, repetir este script.
RAM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
sudo -u "$USUARIO" sed -i "s/^PG_SHARED_BUFFERS=.*/PG_SHARED_BUFFERS=$((RAM_MB / 6))MB/; s/^PG_EFFECTIVE_CACHE=.*/PG_EFFECTIVE_CACHE=$((RAM_MB / 2))MB/" "$APP/ops/oracle/.env"
echo "Memoria: ${RAM_MB} MB → caché de la base $((RAM_MB / 6)) MB."

paso "Base de datos, login, archivos, API y avisos en vivo"
cd "$APP"
DC="docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env"
sudo -u "$USUARIO" $DC pull --quiet db auth rest storage realtime caddy
sudo -u "$USUARIO" $DC up -d db auth rest storage realtime
sudo -u "$USUARIO" bash ops/oracle/migraciones.sh

paso "Respaldo diario (03:30) y limpieza de imágenes viejas (domingos)"
cat > /etc/cron.d/innvolt <<EOF
30 3 * * * $USUARIO bash $APP/ops/oracle/respaldo.sh >> $BASE/respaldo.log 2>&1
15 4 * * 0 $USUARIO docker image prune -f >/dev/null 2>&1
EOF
chmod 644 /etc/cron.d/innvolt

echo
echo "Listo el servidor. Falta:"
echo "  1. Completar lo de Netlify en $APP/ops/oracle/.env (sudo -u $USUARIO nano $APP/ops/oracle/.env)."
echo "  2. Construir y levantar la app:  sudo -u $USUARIO bash $APP/ops/oracle/actualizar.sh"
echo "  3. Traer los datos de Supabase:  sudo -u $USUARIO bash $APP/ops/oracle/migrar-desde-supabase.sh"
echo "  4. El sitio innvolt.cl:          sudo -u $USUARIO bash $APP/ops/oracle/agregar-sitio.sh <dominio>"
