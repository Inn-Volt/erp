import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InnVolt — Cotizador ERP',
  description: 'Sistema de cotizaciones eléctricas InnVolt SpA',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)',  color: '#080808' },
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
      <body>{children}</body>
    </html>
  );
}
