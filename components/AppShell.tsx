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

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, TrendingUp, Wrench, Users, Building2, LogOut,
  PanelLeftClose, PanelLeftOpen, Menu, X, Lock, Loader2, AlertTriangle,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { LogoImg } from '@/components/Logo';
import CampanaAvisos from '@/components/CampanaAvisos';
import { useAvisos } from '@/hooks/useAvisos';
import { confirmarSalida } from '@/hooks/useSinGuardar';
import { usePermisos } from '@/hooks/usePermisos';
import { permisosDeRuta } from '@/lib/permisos';

/** `permisos`: basta con tener uno para ver el ítem (sin lista = siempre visible). */
type Item = { href: string; label: string; exacto?: boolean; permisos?: string[] };
const MENU: { grupo: string; icono: React.ElementType; items: Item[] }[] = [
  { grupo: 'Inicio', icono: Home, items: [
    { href: '/dashboard', label: 'Dashboard', permisos: ['dashboard.ver'] },
  ] },
  { grupo: 'Comercial', icono: TrendingUp, items: [
    { href: '/solicitudes', label: 'Solicitudes', permisos: ['solicitudes.ver'] },
    { href: '/cotizador', label: 'Cotizador', exacto: true, permisos: ['cotizaciones.crear'] },
    { href: '/cotizador/historial', label: 'Historial de cotizaciones', permisos: ['cotizaciones.ver'] },
  ] },
  { grupo: 'Operación', icono: Wrench, items: [
    { href: '/agenda', label: 'Agenda', permisos: ['agenda.ver'] },
    { href: '/levantamiento', label: 'Levantamiento', exacto: true, permisos: ['levantamientos.crear'] },
    { href: '/levantamiento/historial', label: 'Levantamientos', permisos: ['levantamientos.ver'] },
  ] },
  { grupo: 'Clientes', icono: Users, items: [
    { href: '/clientes', label: 'Clientes', permisos: ['clientes.ver'] },
  ] },
  { grupo: 'Mi empresa', icono: Building2, items: [
    { href: '/biblioteca', label: 'Biblioteca de precios', permisos: ['biblioteca.ver'] },
    { href: '/usuarios', label: 'Usuarios', permisos: ['usuarios.ver', 'usuarios.gestionar'] },
    { href: '/roles', label: 'Roles y permisos', permisos: ['roles.gestionar'] },
    { href: '/auditoria', label: 'Auditoría', permisos: ['auditoria.ver'] },
    { href: '/configuracion', label: 'Configuración', permisos: ['configuracion.gestionar'] },
  ] },
];

const esActivo = (pathname: string, it: Item) =>
  it.exacto ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + '/');

export default function AppShell({ userName, userId, onLogout, children }: {
  userName: string;
  userId?: string | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil, roles, cargando, error, sinMigracion, puedeAlguno, recargar } = usePermisos();
  // Una sola suscripción a los avisos, aunque la campana aparezca en tres lugares.
  const avisos = useAvisos(userId && !sinMigracion && !cargando ? userId : null);

  // Menú filtrado por permisos: un grupo sin ítems visibles no se muestra.
  const menu = useMemo(() => MENU
    .map(g => ({ ...g, items: g.items.filter(it => !it.permisos || puedeAlguno(it.permisos)) }))
    .filter(g => g.items.length > 0), [puedeAlguno]);
  const primeraPermitida = menu[0]?.items[0]?.href || null;
  const requeridos = permisosDeRuta(pathname);
  const sinAccesoARuta = !cargando && !!requeridos && !puedeAlguno(requeridos);

  // El inicio por omisión es el Dashboard: quien no lo ve entra a su primera pantalla.
  useEffect(() => {
    if (sinAccesoARuta && pathname === '/dashboard' && primeraPermitida && primeraPermitida !== '/dashboard') {
      router.replace(primeraPermitida);
    }
  }, [sinAccesoARuta, pathname, primeraPermitida, router]);
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

  const nombreVisible = perfil?.nombre || userName;
  const iniciales = nombreVisible.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'IV';
  const rolVisible = sinMigracion ? 'Administrador' : (roles.length ? roles.join(' · ') : 'Sin rol asignado');

  const marca = (
    <Link href={primeraPermitida || '/dashboard'} onClick={e => guardia(e, primeraPermitida || '/dashboard')} className="flex items-center px-5 py-4" aria-label="InnVolt — inicio">
      <LogoImg height={34} />
    </Link>
  );

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 px-3 py-1">
      {menu.map(g => (
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

  const campana = userId && !sinMigracion ? <CampanaAvisos datos={avisos} /> : null;

  const aviso = (titulo: string, texto: string, accion?: React.ReactNode) => (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
      <Lock size={28} className="mx-auto mb-3 text-content-muted" />
      <h1 className="mb-1 text-lg font-semibold text-content">{titulo}</h1>
      <p className="text-sm text-content-muted">{texto}</p>
      {accion && <div className="mt-4 flex justify-center gap-2">{accion}</div>}
    </div>
  );

  let contenido: React.ReactNode = children;
  if (cargando) {
    contenido = <div className="flex justify-center py-16 text-content-muted"><Loader2 size={22} className="iv-spin" /></div>;
  } else if (error) {
    contenido = aviso('No se pudieron cargar tus permisos', error,
      <button className="btn btn-primary" onClick={() => recargar()}>Reintentar</button>);
  } else if (!sinMigracion && perfil && !perfil.activo) {
    contenido = aviso('Tu usuario está desactivado', 'Pídele al administrador que lo active de nuevo.',
      <button className="btn btn-ghost" onClick={onLogout}>Cerrar sesión</button>);
  } else if (!sinMigracion && menu.length === 0) {
    contenido = aviso('Aún no tienes permisos', 'Tu usuario está creado, pero falta que el administrador te asigne un rol (Mi empresa → Usuarios).',
      <><button className="btn btn-ghost" onClick={() => recargar()}>Revisar de nuevo</button><button className="btn btn-ghost" onClick={onLogout}>Cerrar sesión</button></>);
  } else if (sinAccesoARuta) {
    contenido = aviso('Sin acceso a esta sección', 'Tu rol no incluye este permiso. Si lo necesitas, pídeselo al administrador.',
      primeraPermitida ? <Link href={primeraPermitida} className="btn btn-primary">Ir a mi inicio</Link> : undefined);
  }

  const pie = (
    <div className="border-t border-line p-3">
      <div className="mb-3 flex items-center gap-3 rounded-lg p-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-innvolt text-sm font-bold text-innvolt-ink">{iniciales}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-content">{nombreVisible}</span>
          <span className="block truncate text-xs text-content-muted" title={rolVisible}>{rolVisible}</span>
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
          <span className="flex items-center gap-0.5">
            {campana}
            <button onClick={alternar} title="Ocultar menú" aria-label="Ocultar menú"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted hover:bg-surface-3 hover:text-content">
              <PanelLeftClose size={17} />
            </button>
          </span>
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
          {campana}
        </div>
      )}

      {/* Columna de contenido */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Barra superior (solo celular) */}
        <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden"
          style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
          <Link href={primeraPermitida || '/dashboard'} onClick={e => guardia(e, primeraPermitida || '/dashboard')} aria-label="InnVolt — inicio"><LogoImg height={30} /></Link>
          <span className="flex items-center gap-1">
            {campana}
            <button onClick={() => setAbierto(true)} aria-label="Abrir menú"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-content hover:bg-surface-3">
              <Menu size={22} />
            </button>
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div style={{
            maxWidth: 1440, margin: '0 auto',
            padding: 'var(--page-px)',
            paddingBottom: 'calc(var(--page-pb) + env(safe-area-inset-bottom, 0px))',
          }}>
            {sinMigracion && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-content">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-accent" />
                <span>Para activar usuarios, roles, auditoría y avisos falta ejecutar en Supabase el archivo <b>supabase_fase1_usuarios_permisos.sql</b>. Mientras tanto, todo funciona como antes.</span>
              </div>
            )}
            {contenido}
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
