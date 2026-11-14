# La ERP de InnVolt para el servidor propio (Oracle Cloud, ops/oracle). Netlify no usa este archivo.
# Las variables NEXT_PUBLIC_* quedan dentro del código del navegador: se pasan al construir.

FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
# IPv4 primero: en redes sin IPv6, cada descarga esperaría ~40 s antes de caer en IPv4.
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm ci --no-audit --no-fund

FROM node:22-alpine AS construccion
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=construccion --chown=node:node /app/.next/standalone ./
COPY --from=construccion --chown=node:node /app/.next/static ./.next/static
COPY --from=construccion --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
