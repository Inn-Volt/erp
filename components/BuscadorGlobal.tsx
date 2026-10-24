'use client';

/**
 * Buscador global (Ctrl+K o «/» desde cualquier pantalla): busca clientes, cotizaciones,
 * solicitudes y proyectos, salta a cualquier sección del menú y crea lo más común
 * (cotización, solicitud, visita, cliente, gasto, compra, tarea) sin pasar por el menú.
 * Se maneja con el teclado: ↑ ↓ para moverse, Enter para abrir, Esc para cerrar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, FolderKanban, Inbox, Loader2, Plus, Search, User, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePermisos } from '@/hooks/usePermisos';
import { confirmarSalida } from '@/hooks/useSinGuardar';

export interface PaginaBuscable { href: string; label: string; grupo: string }
interface Resultado { clave: string; titulo: string; detalle?: string; href: string; tipo: 'pagina' | 'crear' | 'cliente' | 'cotizacion' | 'solicitud' | 'proyecto' }

const CREAR: { titulo: string; href: string; permisos: string[]; claves: string }[] = [
  { titulo: 'Nueva cotización', href: '/cotizador', permisos: ['cotizaciones.crear'], claves: 'cotizar presupuesto' },
  { titulo: 'Nueva solicitud', href: '/solicitudes?nueva=1', permisos: ['solicitudes.crear'], claves: 'requerimiento pedido lead' },
  { titulo: 'Agendar visita', href: '/agenda?nueva=1', permisos: ['agenda.gestionar'], claves: 'cita agenda terreno' },
  { titulo: 'Nuevo cliente', href: '/clientes?nuevo=1', permisos: ['clientes.crear'], claves: 'empresa contacto' },
  { titulo: 'Rendir gasto', href: '/gastos?nuevo=1', permisos: ['gastos.crear'], claves: 'boleta rendicion' },
  { titulo: 'Ingresar compra a proveedor', href: '/compras?nueva=1', permisos: ['compras.gestionar'], claves: 'factura proveedor' },
  { titulo: 'Nueva tarea', href: '/tareas?nueva=1', permisos: [], claves: 'pendiente recordatorio' },
];

const ICONO: Record<Resultado['tipo'], React.ElementType> = {
  pagina: ArrowRight, crear: Plus, cliente: User, cotizacion: FileText, solicitud: Inbox, proyecto: FolderKanban,
};
const GRUPO: Record<Resultado['tipo'], string> = {
  crear: 'Crear', cliente: 'Clientes', cotizacion: 'Cotizaciones', solicitud: 'Solicitudes', proyecto: 'Proyectos', pagina: 'Ir a',
};
const ORDEN: Resultado['tipo'][] = ['cotizacion', 'cliente', 'solicitud', 'proyecto', 'crear', 'pagina'];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Texto seguro para un filtro ilike de PostgREST (sin comodines ni separadores). */
const limpio = (s: string) => s.replace(/[%_,()*\\]/g, ' ').trim();
const folioDe = (q: string) => { const m = q.match(/^(?:iv|sol|pr)?[-\s#]*0*(\d{1,6})$/i); return m ? Number(m[1]) : null; };

export default function BuscadorGlobal({ paginas }: { paginas: PaginaBuscable[] }) {
  const router = useRouter();
  const { puede, puedeAlguno } = usePermisos();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [datos, setDatos] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  // Ctrl+K / Cmd+K desde cualquier parte; «/» si no se está escribiendo en un campo.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(a => !a); }
      else if (e.key === '/' && !escribiendo && !document.querySelector('.modal-overlay')) { e.preventDefault(); setAbierto(true); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => { if (!abierto) { setQ(''); setDatos([]); setSel(0); } }, [abierto]);

  // Búsqueda en la base (con una pausa corta para no consultar en cada tecla).
  useEffect(() => {
    const t = limpio(q);
    if (t.length < 2) { setDatos([]); setBuscando(false); return; }
    setBuscando(true);
    let vigente = true;
    const id = setTimeout(async () => {
      const folio = folioDe(t);
      const like = `%${t}%`;
      const pedidos: Promise<Resultado[]>[] = [];
      // Clientes, y las cotizaciones por N°, por título o de esos clientes.
      pedidos.push((async () => {
        type Cli = { id: string; nombre_cliente: string; empresa: string | null; rut: string | null; telefono: string | null };
        type Cot = { id: string; folio: number; titulo: string | null; estado: string; clientes?: { nombre_cliente: string } | null };
        const clis: Cli[] = puede('clientes.ver')
          ? ((await supabase.from('clientes').select('id, nombre_cliente, empresa, rut, telefono')
            .or(`nombre_cliente.ilike.${like},empresa.ilike.${like},rut.ilike.${like},telefono.ilike.${like}`).order('nombre_cliente').limit(6)).data || []) as Cli[]
          : [];
        let cots: Cot[] = [];
        if (puede('cotizaciones.ver')) {
          const sel = 'id, folio, titulo, estado, clientes(nombre_cliente)';
          const [porTexto, deClientes] = await Promise.all([
            supabase.from('cotizaciones').select(sel).or(folio ? `folio.eq.${folio},titulo.ilike.${like}` : `titulo.ilike.${like}`).order('folio', { ascending: false }).limit(6),
            clis.length ? supabase.from('cotizaciones').select(sel).in('cliente_id', clis.map(c => c.id)).order('folio', { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
          ]);
          const vistas = new Set<string>();
          cots = [...((porTexto.data || []) as unknown as Cot[]), ...((deClientes.data || []) as unknown as Cot[])]
            .filter(c => !vistas.has(c.id) && !!vistas.add(c.id)).slice(0, 8);
        }
        return [
          ...cots.map(c => ({ clave: `c${c.id}`, tipo: 'cotizacion' as const, titulo: `IV-${String(c.folio).padStart(4, '0')} · ${c.titulo || 'Cotización'}`, detalle: [c.clientes?.nombre_cliente, c.estado].filter(Boolean).join(' · '), href: `/cotizador?edit=${c.id}` })),
          ...clis.map(c => ({ clave: `k${c.id}`, tipo: 'cliente' as const, titulo: c.nombre_cliente, detalle: [c.empresa, c.rut, c.telefono].filter(Boolean).join(' · '), href: `/clientes?ver=${c.id}` })),
        ];
      })());
      if (puede('solicitudes.ver')) pedidos.push((async () => {
        const { data } = await supabase.from('solicitudes').select('id, folio, descripcion, estado, clientes(nombre_cliente)')
          .or(folio ? `folio.eq.${folio},descripcion.ilike.${like}` : `descripcion.ilike.${like}`).order('created_at', { ascending: false }).limit(4);
        return ((data || []) as unknown as { id: string; folio: number; descripcion: string; estado: string; clientes?: { nombre_cliente: string } | null }[])
          .map(s => ({ clave: `s${s.id}`, tipo: 'solicitud' as const, titulo: `SOL-${String(s.folio).padStart(4, '0')} · ${s.descripcion.slice(0, 70)}`, detalle: s.clientes?.nombre_cliente || '', href: `/solicitudes?ver=${s.id}` }));
      })());
      if (puedeAlguno(['proyectos.ver', 'proyectos.gestionar'])) pedidos.push((async () => {
        const { data } = await supabase.from('proyectos').select('id, folio, nombre').ilike('nombre', like).limit(4);
        return ((data || []) as { id: string; folio: number; nombre: string }[])
          .map(p => ({ clave: `p${p.id}`, tipo: 'proyecto' as const, titulo: `PR-${String(p.folio).padStart(4, '0')} · ${p.nombre}`, href: `/proyectos/${p.id}` }));
      })());
      const r = (await Promise.all(pedidos.map(p => p.catch(() => [] as Resultado[])))).flat();
      if (vigente) { setDatos(r); setBuscando(false); }
    }, 220);
    return () => { vigente = false; clearTimeout(id); };
  }, [q, puede, puedeAlguno]);

  // Secciones del menú y acciones de crear, filtradas por lo escrito (sin tildes).
  const locales = useMemo<Resultado[]>(() => {
    const t = sinTildes(q.trim());
    const crear = CREAR.filter(c => !c.permisos.length || puedeAlguno(c.permisos))
      .filter(c => !t || sinTildes(`${c.titulo} ${c.claves}`).includes(t))
      .map(c => ({ clave: `n${c.href}`, tipo: 'crear' as const, titulo: c.titulo, href: c.href }));
    const pags = paginas.filter(p => !t || sinTildes(`${p.label} ${p.grupo}`).includes(t))
      .map(p => ({ clave: `g${p.href}`, tipo: 'pagina' as const, titulo: p.label, detalle: p.grupo, href: p.href }));
    // Sin texto: solo los accesos para crear; escribiendo, también las secciones.
    return [...crear, ...(t ? pags : [])];
  }, [q, paginas, puedeAlguno]);

  const resultados = useMemo(() => {
    const todos = [...datos, ...locales];
    return ORDEN.flatMap(tipo => todos.filter(r => r.tipo === tipo));
  }, [datos, locales]);
  useEffect(() => { setSel(0); }, [resultados.length, q]);

  const ir = useCallback((r: Resultado) => {
    if (!confirmarSalida()) return;
    setAbierto(false);
    router.push(r.href);
  }, [router]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && resultados[sel]) { e.preventDefault(); ir(resultados[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAbierto(false); }
  };

  const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return <>
    <button type="button" onClick={() => setAbierto(true)} aria-label="Buscar (Ctrl+K)" title={`Buscar clientes, cotizaciones… (${esMac ? '⌘' : 'Ctrl'}+K)`}
      className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-sm text-content-muted transition hover:bg-surface-3 hover:text-content">
      <Search size={16} />
      <span className="hidden lg:inline">Buscar…</span>
      <kbd className="hidden rounded border border-line px-1.5 text-[11px] lg:inline">{esMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>

    {abierto && (
      <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/45 px-3 pt-[8vh]" onMouseDown={() => setAbierto(false)}>
        <div role="dialog" aria-modal="true" aria-label="Buscar" onMouseDown={e => e.stopPropagation()}
          className="flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={17} className="shrink-0 text-content-muted" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={alTeclear} aria-label="Qué buscas"
              role="combobox" aria-expanded={resultados.length > 0} aria-controls="buscador-resultados" aria-activedescendant={resultados[sel] ? `bg-${sel}` : undefined}
              placeholder="Cliente, N° de cotización, solicitud, sección o «nueva…»"
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-content outline-none placeholder:text-content-muted" />
            {buscando && <Loader2 size={15} className="iv-spin shrink-0 text-content-muted" />}
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="rounded p-1 text-content-muted hover:text-content"><X size={16} /></button>
          </div>
          <div id="buscador-resultados" role="listbox" ref={lista} className="overflow-y-auto p-1.5">
            {resultados.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-content-muted">
                {q.trim().length < 2 ? 'Escribe al menos 2 letras, o un N° (IV-12, SOL-3).' : buscando ? 'Buscando…' : 'Sin resultados.'}</p>
            )}
            {resultados.map((r, i) => {
              const Icono = ICONO[r.tipo];
              const titulo = i === 0 || resultados[i - 1].tipo !== r.tipo ? GRUPO[r.tipo] : null;
              return (
                <div key={r.clave}>
                  {titulo && <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-content-muted">{titulo}</p>}
                  <button type="button" id={`bg-${i}`} data-i={i} role="option" aria-selected={i === sel}
                    onMouseMove={() => setSel(i)} onClick={() => ir(r)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${i === sel ? 'bg-surface-3' : ''}`}>
                    <Icono size={16} className={`shrink-0 ${r.tipo === 'crear' ? 'text-accent' : 'text-content-muted'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-content">{r.titulo}</span>
                      {r.detalle && <span className="block truncate text-xs text-content-muted">{r.detalle}</span>}
                    </span>
                    {i === sel && <span className="hidden text-[11px] text-content-muted sm:inline">Enter</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="hidden border-t border-line px-3 py-1.5 text-[11px] text-content-muted sm:block">↑ ↓ para moverte · Enter para abrir · Esc para cerrar · «/» también abre el buscador</p>
        </div>
      </div>
    )}
  </>;
}
