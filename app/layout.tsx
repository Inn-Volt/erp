// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'InnVolt ERP',
  description: 'Sistema de Gestión Eléctrica',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  )
}