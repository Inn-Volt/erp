import type { Metadata, Viewport } from 'next';
import { Archivo, Barlow } from 'next/font/google';
import './globals.css';
import PWARegister from '@/components/PWARegister';

// Tipografías de la marca InnVolt (las mismas del sitio innvolt.cl), auto-hospedadas por Next:
// Archivo para títulos (con el eje de ancho: la guía de marca la usa al 112 %) y Barlow para el texto.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-barlow', display: 'swap' });

export const metadata: Metadata = {
  title: 'InnVolt — Cotizador ERP',
  description: 'Sistema de cotizaciones eléctricas InnVolt SpA',
  manifest: '/manifest.webmanifest',
  applicationName: 'InnVolt',
  appleWebApp: { capable: true, title: 'InnVolt', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1a1813' },
    { media: '(prefers-color-scheme: dark)',  color: '#14130f' },
  ],
};

/**
 * Aplica el tema guardado ANTES del primer pintado (sin destello). Si la
 * persona nunca eligió, se respeta la preferencia de su equipo.
 */
const APLICAR_TEMA = `(function(){try{
  var t = localStorage.getItem('innvolt-tema');
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (t === 'dark') document.documentElement.classList.add('dark');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${archivo.variable} ${barlow.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APLICAR_TEMA }} />
      </head>
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
