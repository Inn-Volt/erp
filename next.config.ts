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
        permanent: true,
      },
    ]
  },
};

export default nextConfig;