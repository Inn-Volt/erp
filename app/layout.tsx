import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import PWARegister from '@/components/PWARegister';

// Tipografías de TecApp, auto-hospedadas por Next (se descargan en el build y
// se sirven desde el propio sitio: sin depender de Google en tiempo de uso).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'InnVolt — Cotizador ERP',
  description: 'Sistema de cotizaciones eléctricas InnVolt SpA',
  manifest: '/manifest.webmanifest',
  applicationName: 'InnVolt',
  appleWebApp: { capable: true, title: 'InnVolt', statusBarStyle: 'default' },
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#18181b' },
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
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${grotesk.variable}`}>
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
