import type { Metadata, Viewport } from 'next';
import './globals.css';
import PWARegister from '@/components/PWARegister';

export const metadata: Metadata = {
  title: 'InnVolt — Cotizador ERP',
  description: 'Sistema de cotizaciones eléctricas InnVolt SpA',
  manifest: '/manifest.webmanifest',
  applicationName: 'InnVolt',
  appleWebApp: { capable: true, title: 'InnVolt', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e7e9ef' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
};

/**
 * Aplica el tema guardado ANTES del primer pintado, para que no se vea
 * un destello del tema contrario al cargar. Por defecto: oscuro.
 */
const APLICAR_TEMA = `(function(){try{
  var t = localStorage.getItem('innvolt-tema');
  if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  if (t === 'dark') document.documentElement.classList.add('dark');
}catch(e){ document.documentElement.classList.add('dark'); }})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
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
