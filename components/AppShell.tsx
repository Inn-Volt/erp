'use client';

/**
 * Armazón de la aplicación (lenguaje TecApp · marca InnVolt).
 * ─────────────────────────────────────────────────────────────────────────────
 *  · El menú se agrupa por la pregunta que responde cada sección —qué vendemos
 *    (Comercial), qué hacemos en terreno (Operación), a quién (Clientes), con qué
 *    (Mi empresa)— en vez de una lista plana de 10 ítems.
 *  · Menú en acordeón: abierto solo el grupo de la pantalla actual; las
 *    subopciones (Cotizaciones → Nueva, Plantillas, Ajustes) cuelgan con sangría.
 *  · Barra superior en todos los tamaños: dónde se está a la izquierda y, arriba
 *    a la derecha, los avisos, el cambio de tema y la cuenta.
 *  · Escritorio: menú fijo a la altura de la pantalla, plegable.
 *  · Celular: la misma barra con el botón del cajón lateral.
 *  · Salir de una sección pregunta si hay cambios sin guardar (cotizador).
 */

import { encendido, rutaApagada } from '@/lib/modulos';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardCheck, Home, TrendingUp, Building2, LogOut, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Menu, X, Lock, Loader2, AlertTriangle, Wallet,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { LogoImg } from '@/components/Logo';
import CampanaAvisos from '@/components/CampanaAvisos';
import { useAvisos } from '@/hooks/useAvisos';
import { confirmarSalida } from '@/hooks/useSinGuardar';
import { usePermisos } from '@/hooks/usePermisos';
import { permisosDeRuta } from '@/lib/permisos';

/**
 * `permisos`: basta con tener uno para ver el ítem (sin lista = siempre visible).
 * `sub`: vive dentro de la opción de arriba (Cotizaciones → Nueva, Plantillas, Ajustes):
 * va con sangría bajo ella y solo se ve estando en esa sección, o al abrirla con la flecha.
 */
type Item = { href: string; label: string; exacto?: boolean; permisos?: string[]; sub?: boolean; modulo?: string };
const MENU: { grupo: string; icono: React.ElementType; items: Item[] }[] = [
  { grupo: 'Inicio', icono: Home, items: [
    { href: '/inicio', label: 'Mi día' },
    { href: '/dashboard', label: 'Dashboard', permisos: ['dashboard.ver'] },
  ] },
  // El flujo, en orden: llega la solicitud → se coordina la visita → se cotiza → se sigue el trabajo.
  { grupo: 'Comercial', icono: TrendingUp, items: [
    { href: '/solicitudes', label: 'Solicitudes', permisos: ['solicitudes.ver'] },
    { href: '/agenda', label: 'Agenda y visitas', permisos: ['agenda.ver'] },
    { href: '/cotizador/historial', label: 'Cotizaciones', permisos: ['cotizaciones.ver'] },
    { href: '/cotizador', label: 'Nueva cotización', exacto: true, permisos: ['cotizaciones.crear'], sub: true },
    { href: '/cotizador/plantillas', label: 'Plantillas', permisos: ['cotizaciones.aprobar'], sub: true },
    { href: '/cotizador/ajustes', label: 'Ajustes', permisos: ['cotizaciones.aprobar'], sub: true },
    { href: '/clientes', label: 'Clientes', permisos: ['clientes.ver'] },
    { href: '/traslados', label: 'Traslados', permisos: ['traslados.ver', 'traslados.gestionar'] },
  ] },
  { grupo: 'Seguimiento', icono: ClipboardCheck, items: [
    { href: '/trabajos', label: 'Trabajos', permisos: ['cotizaciones.ver'] },
    { href: '/proyectos', label: 'Proyectos', permisos: ['proyectos.ver', 'proyectos.gestionar'] },
    { href: '/tareas', label: 'Tareas' },
    // Apagados (lib/modulos.ts): siguen aquí para encenderlos sin tocar el menú.
    { href: '/mis-ot', label: 'Mis OT', permisos: ['ot.ejecutar'], modulo: 'ot' },
    { href: '/ordenes', label: 'Órdenes de trabajo', permisos: ['ot.ver', 'ot.ejecutar'], modulo: 'ot' },
    { href: '/bodega', label: 'Bodega', permisos: ['bodega.ver', 'bodega.mover'], modulo: 'bodega' },
  ] },
  { grupo: 'Finanzas', icono: Wallet, items: [
    { href: '/facturacion', label: 'Facturación y cobranza', permisos: ['facturacion.ver', 'facturacion.gestionar'] },
    { href: '/gastos', label: 'Gastos y anticipos', permisos: ['gastos.crear', 'gastos.ver_todos', 'gastos.aprobar'] },
  ] },
  { grupo: 'Mi empresa', icono: Building2, items: [
    { href: '/biblioteca', label: 'Biblioteca de precios', permisos: ['biblioteca.ver'] },
    { href: '/usuarios', label: 'Usuarios', permisos: ['usuarios.ver', 'usuarios.gestionar'] },
    { href: '/roles', label: 'Roles y permisos', permisos: ['roles.gestionar'] },
    { href: '/plantillas-informe', label: 'Plantillas de informe', permisos: ['cotizaciones.aprobar', 'configuracion.gestionar'] },
    { href: '/personas', label: 'Personas y competencias', permisos: ['personas.ver', 'personas.gestionar'], modulo: 'personas' },
    { href: '/auditoria', label: 'Auditoría', permisos: ['auditoria.ver'] },
    { href: '/configuracion', label: 'Configuración', permisos: ['configuracion.gestionar'] },
  ] },
];

const VERSION = '2.0.0';

const calza = (pathname: string, it: Item) =>
  it.exacto ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + '/');

/** La opción más precisa para esta dirección: en `/cotizador/plantillas`, Plantillas y no Nueva cotización. */
function laMasPrecisa(items: Item[], pathname: string): Item | null {
  let mejor: Item | null = null;
  for (const it of items) if (calza(pathname, it) && (!mejor || it.href.length > mejor.href.length)) mejor = it;
  return mejor;
}

/** Las subopciones que cuelgan de la opción `idx` (las que la siguen con `sub`). */
function hijosDe(items: Item[], idx: number): Item[] {
  const hijos: Item[] = [];
  for (const it of items.slice(idx + 1)) { if (!it.sub) break; hijos.push(it); }
  return hijos;
}

export default function AppShell({ userName, userId, onLogout, children }: {
  userName: string;
  userId?: string | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil, roles, permisos, cargando, error, sinMigracion, puedeAlguno, recargar } = usePermisos();
  const avisos = useAvisos(userId && !sinMigracion && !cargando ? userId : null);

  // Menú filtrado por permisos: un grupo sin ítems visibles no se muestra.
  const menu = useMemo(() => MENU
    .map(g => ({ ...g, items: g.items.filter(it => (!it.modulo || encendido(it.modulo)) && (!it.permisos || puedeAlguno(it.permisos))) }))
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

  // Dónde se está: el grupo y la opción más precisa (gana la dirección más larga).
  const { grupoDeLaPantalla, marcada } = useMemo(() => {
    let mejor: { grupo: string; item: Item } | null = null;
    for (const g of menu) {
      const it = laMasPrecisa(g.items, pathname);
      if (it && (!mejor || it.href.length > mejor.item.href.length)) mejor = { grupo: g.grupo, item: it };
    }
    return { grupoDeLaPantalla: mejor?.grupo ?? null, marcada: mejor?.item ?? null };
  }, [menu, pathname]);

  // Menú en acordeón (como TecApp): abierto solo el grupo de la pantalla en que se está;
  // un clic en un título lo abre para mirar y cierra el otro.
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(grupoDeLaPantalla);
  useEffect(() => { setGrupoAbierto(grupoDeLaPantalla); }, [grupoDeLaPantalla]);
  // Subopciones abiertas o cerradas a mano con la flecha (mandan mientras dure la sesión).
  const [subsElegidas, setSubsElegidas] = useState<Record<string, boolean>>({});

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
  const inicio = primeraPermitida || '/dashboard';

  const marca = (
    <Link href={inicio} onClick={e => guardia(e, inicio)} className="flex items-center px-5 py-4" aria-label="InnVolt — inicio">
      <LogoImg height={34} />
    </Link>
  );

  /** ¿Se ven las subopciones de esta opción? Dentro de su sección, sí; la flecha manda si se tocó. */
  const subsVisibles = (it: Item, hijos: Item[]) =>
    subsElegidas[it.href] ?? [it, ...hijos].some(x => calza(pathname, x));

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 px-3 py-1">
      {menu.map(g => {
        const cerrado = grupoAbierto !== g.grupo;
        const aquiEstas = g.grupo === grupoDeLaPantalla;
        const idLista = `menu-${g.grupo.toLowerCase().replace(/\s+/g, '-')}`;
        return (
          <div key={g.grupo} className="flex flex-col">
            {/* Cabecera del grupo: ícono + rótulo + línea; un clic lo abre o lo cierra */}
            <button type="button" onClick={() => setGrupoAbierto(a => (a === g.grupo ? null : g.grupo))}
              aria-expanded={!cerrado} aria-controls={idLista} title={cerrado ? `Mostrar ${g.grupo}` : `Ocultar ${g.grupo}`}
              className="group mb-1 flex w-full items-center gap-2 rounded-md px-3 py-0.5 text-left hover:bg-surface-3/60">
              <g.icono size={13} className="text-accent" aria-hidden />
              <span className={`text-[11px] font-bold uppercase tracking-wider ${cerrado && aquiEstas ? 'text-content' : 'text-content-muted group-hover:text-content'}`}>{g.grupo}</span>
              {cerrado && aquiEstas && <><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-innvolt" /><span className="sr-only">(aquí estás)</span></>}
              <span className="h-px flex-1 bg-line" />
              <ChevronDown size={13} aria-hidden className={`text-content-muted transition-transform group-hover:text-content motion-reduce:transition-none ${cerrado ? '-rotate-90' : ''}`} />
            </button>
            {/* Se pliega con una transición de alto; cerrado queda `inert` (fuera del tabulador) */}
            <div id={idLista} inert={cerrado}
              className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${cerrado ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
              <div className="overflow-hidden">
                {/* Los ítems cuelgan de un riel, para que se lea la jerarquía */}
                <div className="ml-[18px] flex flex-col gap-0.5 border-l border-line pl-2">
                  {g.items.map((it, idx) => {
                    if (it.sub) {
                      const padre = g.items.slice(0, idx).reverse().find(x => !x.sub);
                      if (padre && !subsVisibles(padre, hijosDe(g.items, g.items.indexOf(padre)))) return null;
                    }
                    const hijos = it.sub ? [] : hijosDe(g.items, idx);
                    const activo = marcada === it;
                    const enlace = (
                      <Link key={it.href} href={it.href} onClick={e => guardia(e, it.href)} aria-current={activo ? 'page' : undefined}
                        className={`relative rounded-lg transition ${it.sub ? 'ml-3 px-3 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${
                          activo ? 'bg-surface-3 font-medium text-content' : 'text-content-muted hover:bg-surface-3 hover:text-content'}`}>
                        {activo && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-innvolt" />}
                        {it.sub && <span aria-hidden className="mr-1.5 text-content-muted">↳</span>}
                        {it.label}
                      </Link>
                    );
                    if (hijos.length === 0) return enlace;
                    const abiertas = subsVisibles(it, hijos);
                    const nombres = hijos.map(h => h.label).join(' y ');
                    return (
                      <div key={it.href} className="flex items-center gap-0.5">
                        <div className="flex min-w-0 flex-1 flex-col">{enlace}</div>
                        <button type="button" onClick={() => setSubsElegidas(e => ({ ...e, [it.href]: !abiertas }))}
                          aria-expanded={abiertas} aria-label={`${abiertas ? 'Ocultar' : 'Mostrar'} ${nombres}`} title={`${abiertas ? 'Ocultar' : 'Mostrar'} ${nombres}`}
                          className="shrink-0 rounded-md px-2 py-2 text-content-muted hover:bg-surface-3 hover:text-content">
                          <ChevronDown size={13} aria-hidden className={`transition-transform motion-reduce:transition-none ${abiertas ? '' : '-rotate-90'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );

  const campana = userId && !sinMigracion ? <CampanaAvisos datos={avisos} /> : null;

  const aviso = (titulo: string, texto: string, accion?: React.ReactNode) => (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
      <Lock size={28} className="mx-auto mb-3 text-content-muted" />
      <h1 className="mb-1 font-display text-lg font-bold text-content">{titulo}</h1>
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
  } else if (!sinMigracion && permisos.length === 0) {
    contenido = aviso('Aún no tienes permisos', 'Tu usuario está creado, pero falta que el administrador te asigne un rol (Mi empresa → Usuarios).',
      <><button className="btn btn-ghost" onClick={() => recargar()}>Revisar de nuevo</button><button className="btn btn-ghost" onClick={onLogout}>Cerrar sesión</button></>);
  } else if (rutaApagada(pathname)) {
    contenido = aviso('Este módulo está apagado', 'No se usa por ahora en InnVolt. Si lo necesitas, pídele al administrador que lo encienda.',
      primeraPermitida ? <Link href={primeraPermitida} className="btn btn-primary">Ir a mi inicio</Link> : undefined);
  } else if (sinAccesoARuta) {
    contenido = aviso('Sin acceso a esta sección', 'Tu rol no incluye este permiso. Si lo necesitas, pídeselo al administrador.',
      primeraPermitida ? <Link href={primeraPermitida} className="btn btn-primary">Ir a mi inicio</Link> : undefined);
  }

  const pie = (
    <div className="border-t border-line p-3">
      <Link href="/mi-cuenta" onClick={e => guardia(e, '/mi-cuenta')} className="mb-2 flex items-center gap-3 rounded-lg p-2 hover:bg-surface-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-innvolt text-sm font-bold text-innvolt-ink">{iniciales}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-content">{nombreVisible}</span>
          <span className="block truncate text-xs text-content-muted" title={rolVisible}>{rolVisible}</span>
        </span>
      </Link>
      <button onClick={() => { if (confirmarSalida()) onLogout(); }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content-muted transition hover:bg-surface-3 hover:text-content">
        <LogOut size={15} /> Cerrar sesión
      </button>
      <p className="mt-2 px-1 text-[11px] text-content-muted">InnVolt ERP v{VERSION}</p>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-2">
      {/* Menú lateral (escritorio): fijo a la altura de la pantalla; solo el contenido hace scroll */}
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

      {/* Columna de contenido */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Barra superior: dónde se está a la izquierda; avisos, tema y cuenta arriba a la derecha */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 md:px-5"
          style={{ minHeight: 56, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setAbierto(true)} aria-label="Abrir menú"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-content hover:bg-surface-3 md:hidden">
              <Menu size={22} />
            </button>
            {plegado && (
              <button onClick={alternar} title="Mostrar menú" aria-label="Mostrar menú"
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-content-muted hover:bg-surface-3 hover:text-content md:flex">
                <PanelLeftOpen size={17} />
              </button>
            )}
            <Link href={inicio} onClick={e => guardia(e, inicio)} aria-label="InnVolt — inicio" className={`shrink-0 ${plegado ? '' : 'md:hidden'}`}>
              <LogoImg height={28} />
            </Link>
            {grupoDeLaPantalla && marcada && (
              <p className="hidden min-w-0 truncate text-sm md:block">
                <span className="text-content-muted">{grupoDeLaPantalla}</span>
                <span className="mx-2 text-content-muted">/</span>
                <span className="font-medium text-content">{marcada.label}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {campana}
            <ThemeToggle />
            <Link href="/mi-cuenta" onClick={e => guardia(e, '/mi-cuenta')} title={`${nombreVisible} · Mi cuenta`} aria-label="Mi cuenta"
              className="ml-1 hidden h-9 w-9 items-center justify-center rounded-full bg-innvolt text-xs font-bold text-innvolt-ink transition hover:brightness-95 sm:flex">
              {iniciales}
            </Link>
          </div>
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
