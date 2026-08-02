/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permitir acceso desde la red local en desarrollo
  allowedDevOrigins: ['192.168.100.98'],

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
    ]
  },
};

export default nextConfig;