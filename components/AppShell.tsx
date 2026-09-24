'use client';

/**
 * Armazón de la aplicación (lenguaje TecApp · marca InnVolt).
 * ─────────────────────────────────────────────────────────────────────────────
 *  · El menú se agrupa por la pregunta que responde cada sección —qué vendemos
 *    (Comercial), qué hacemos en terreno (Operación), a quién (Clientes), con qué
 *    (Mi empresa)— en vez de una lista plana de 10 ítems.
 *  · Escritorio: menú fijo a la altura de la pantalla, plegable a una franja.
 *  · Celular: barra superior + cajón lateral.
 *  · Salir de una sección pregunta si hay cambios sin guardar (cotizador).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, TrendingUp, Wrench, Users, Building2, LogOut,
  PanelLeftClose, PanelLeftOpen, Menu, X,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { LogoImg } from '@/components/Logo';
import { confirmarSalida } from '@/hooks/useSinGuardar';

type Item = { href: string; label: string; exacto?: boolean };
const MENU: { grupo: string; icono: React.ElementType; items: Item[] }[] = [
  { grupo: 'Inicio', icono: Home, items: [
    { href: '/dashboard', label: 'Dashboard' },
  ] },
  { grupo: 'Comercial', icono: TrendingUp, items: [
    { href: '/solicitudes', label: 'Solicitudes' },
    { href: '/cotizador', label: 'Cotizador', exacto: true },
    { href: '/cotizador/historial', label: 'Historial de cotizaciones' },
  ] },
  { grupo: 'Operación', icono: Wrench, items: [
    { href: '/agenda', label: 'Agenda' },
    { href: '/levantamiento', label: 'Levantamiento', exacto: true },
    { href: '/levantamiento/historial', label: 'Levantamientos' },
  ] },
  { grupo: 'Clientes', icono: Users, items: [
    { href: '/clientes', label: 'Clientes' },
  ] },
  { grupo: 'Mi empresa', icono: Building2, items: [
    { href: '/biblioteca', label: 'Biblioteca de precios' },
    { href: '/configuracion', label: 'Configuración' },
  ] },
];

const esActivo = (pathname: string, it: Item) =>
  it.exacto ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + '/');

export default function AppShell({ userName, onLogout, children }: {
  userName: string;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);       // cajón en celular
  const [plegado, setPlegado] = useState(false);       // menú plegado en escritorio

  useEffect(() => { setAbierto(false); }, [pathname]);
  useEffect(() => {
    try { setPlegado(localStorage.getItem('innvolt-menu-plegado') === '1'); } catch { /* sin almacenamiento */ }
  }, []);
  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [abierto]);

  const alternar = () => setPlegado(p => {
    const s = !p;
    try { localStorage.setItem('innvolt-menu-plegado', s ? '1' : '0'); } catch { /* ok */ }
    return s;
  });

  /** Navegar sin perder una cotización a medio hacer. */
  const guardia = (e: React.MouseEvent, href: string) => {
    if (href !== pathname && !confirmarSalida()) e.preventDefault();
  };

  const iniciales = userName.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'IV';

  const marca = (
    <Link href="/dashboard" onClick={e => guardia(e, '/dashboard')} className="flex items-center px-5 py-4" aria-label="InnVolt — inicio">
      <LogoImg height={34} />
    </Link>
  );

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 px-3 py-1">
      {MENU.map(g => (
        <div key={g.grupo} className="flex flex-col">
          {/* Cabecera del grupo: ícono + rótulo + línea */}
          <div className="mb-1 flex items-center gap-2 px-3">
            <g.icono size={13} className="text-accent" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted">{g.grupo}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {/* Los ítems cuelgan de un riel, para que se lea la jerarquía */}
          <div className="ml-[18px] flex flex-col gap-0.5 border-l border-line pl-2">
            {g.items.map(it => {
              const activo = esActivo(pathname, it);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={e => guardia(e, it.href)}
                  className={`relative rounded-lg px-3 py-2 text-sm transition ${
                    activo ? 'bg-surface-3 font-medium text-content' : 'text-content-muted hover:bg-surface-3 hover:text-content'
                  }`}
                >
                  {activo && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-innvolt" />}
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const pie = (
    <div className="border-t border-line p-3">
      <div className="mb-3 flex items-center gap-3 rounded-lg p-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-innvolt text-sm font-bold text-innvolt-ink">{iniciales}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-content">{userName}</span>
          <span className="block truncate text-xs text-content-muted">Administrador</span>
        </span>
      </div>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs text-content-muted">Tema</span>
        <ThemeToggle compact />
      </div>
      <button
        onClick={() => { if (confirmarSalida()) onLogout(); }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content-muted transition hover:bg-surface-3 hover:text-content"
      >
        <LogOut size={15} /> Cerrar sesión
      </button>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-2">
      {/* Menú lateral (escritorio) */}
      <aside className={`hidden h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface ${plegado ? '' : 'md:flex'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between pr-3">
          {marca}
          <button onClick={alternar} title="Ocultar menú" aria-label="Ocultar menú"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted hover:bg-surface-3 hover:text-content">
            <PanelLeftClose size={17} />
          </button>
        </div>
        {nav}
        {pie}
      </aside>

      {/* Menú plegado: franja que ocupa su lugar (no tapa el contenido) */}
      {plegado && (
        <div className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface pt-3 md:flex">
          <button onClick={alternar} title="Mostrar menú" aria-label="Mostrar menú"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted hover:bg-surface-3 hover:text-content">
            <PanelLeftOpen size={17} />
          </button>
        </div>
      )}

      {/* Columna de contenido */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Barra superior (solo celular) */}
        <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden"
          style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
          <Link href="/dashboard" onClick={e => guardia(e, '/dashboard')} aria-label="InnVolt — inicio"><LogoImg height={30} /></Link>
          <button onClick={() => setAbierto(true)} aria-label="Abrir menú"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-content hover:bg-surface-3">
            <Menu size={22} />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div style={{
            maxWidth: 1440, margin: '0 auto',
            padding: 'var(--page-px)',
            paddingBottom: 'calc(var(--page-pb) + env(safe-area-inset-bottom, 0px))',
          }}>
            {children}
          </div>
        </main>
      </div>

      {/* Cajón lateral (celular) */}
      {abierto && (
        <div className="fixed inset-0 z-[200] md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between">
              {marca}
              <button onClick={() => setAbierto(false)} aria-label="Cerrar menú"
                className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg text-content hover:bg-surface-3">
                <X size={20} />
              </button>
            </div>
            {nav}
            {pie}
          </aside>
        </div>
      )}
    </div>
  );
}
