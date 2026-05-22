import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InnVolt — Cotizador ERP',
  description: 'Sistema de cotizaciones eléctricas InnVolt SpA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
