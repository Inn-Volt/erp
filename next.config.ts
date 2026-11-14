/** @type {import('next').NextConfig} */
const nextConfig = {
  // En el servidor propio (Oracle, ops/oracle) la app corre sola con `node server.js`: se arma
  // «standalone». En Netlify no se define y todo sigue como siempre.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),

  // Permitir acceso desde la red local en desarrollo (celular por IP).
  // Sin la IP correcta aquí, Next 16 bloquea /_next y el móvil queda cargando.
  allowedDevOrigins: [
    '192.168.100.147', '192.168.100.98',
    '192.168.100.*', '192.168.0.*', '192.168.1.*', '10.0.0.*',
  ],

  // Tus redirecciones
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        // permanent:false → 307. Un 308 permanente lo cachea el navegador de
        // forma dura y rompería el día que exista una home en '/'.
        permanent: false,
      },
      // Los levantamientos se reemplazaron por la OT de visita técnica (fase 6).
      { source: '/levantamiento', destination: '/ordenes', permanent: false },
      { source: '/levantamiento/:ruta*', destination: '/ordenes', permanent: false },
    ]
  },
};

export default nextConfig;