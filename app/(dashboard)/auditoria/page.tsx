'use client';

/**
 * Mi empresa → Auditoría (portada de TecApp).
 * Quién creó, cambió o eliminó qué, y cuándo. La escribe la base de datos sola
 * (trigger `auditar`), así que nadie la puede saltar ni editar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, ChevronDown, Settings2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';

interface Evento {
  id: number;
  tabla: string;
  registro_id: string | null;
  accion: 'crear' | 'editar' | 'eliminar';
  cambios: Record<string, unknown> | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

const pad = (n: unknown) => String(n ?? '').padStart(4, '0');

/** Cómo se llama y cómo se identifica cada registro de cada tabla. */
const TABLAS: Record<string, { nombre: string; select?: string; etiqueta?: (r: Record<string, unknown>) => string; url?: (id: string) => string }> = {
  cotizaciones: { nombre: 'Cotización', select: 'id, folio', etiqueta: r => (r.folio ? `IV-${pad(r.folio)}` : ''), url: id => `/cotizador?edit=${id}` },
  clientes: { nombre: 'Cliente', select: 'id, nombre_cliente', etiqueta: r => String(r.nombre_cliente || '') },
  solicitudes: { nombre: 'Solicitud', select: 'id, folio', etiqueta: r => (r.folio ? `SOL #${pad(r.folio)}` : '') },
  agendamientos: { nombre: 'Cita de agenda', select: 'id, titulo, fecha', etiqueta: r => [r.titulo, r.fecha].filter(Boolean).join(' · ') },
  levantamientos: { nombre: 'Levantamiento', select: 'id, folio', etiqueta: r => (r.folio ? `LV-${pad(r.folio)}` : '') },
  catalogo_items: { nombre: 'Ítem de la biblioteca', select: 'id, descripcion', etiqueta: r => String(r.descripcion || '') },
  recetas: { nombre: 'Receta', select: 'id, nombre', etiqueta: r => String(r.nombre || '') },
  receta_componentes: { nombre: 'Componente de receta', select: 'id, descripcion', etiqueta: r => String(r.descripcion || '') },
  empresas: { nombre: 'Empresa emisora', select: 'id, nombre', etiqueta: r => String(r.nombre || '') },
  configuracion_empresa: { nombre: 'Configuración' },
  plantillas_cotizacion: { nombre: 'Plantilla de cotización', select: 'id, nombre', etiqueta: r => String(r.nombre || '') },
  profiles: { nombre: 'Usuario', select: 'id, nombre, email', etiqueta: r => String(r.nombre || r.email || '') },
  roles: { nombre: 'Rol', select: 'id, nombre', etiqueta: r => String(r.nombre || '') },
  usuario_roles: { nombre: 'Rol de un usuario' },
};

const CAMPOS: Record<string, string> = {
  estado: 'Estado', total: 'Total', subtotal: 'Subtotal', iva: 'IVA', total_clp: 'Total en pesos', items: 'Ítems',
  partidas: 'Partidas', supuestos: 'Supuestos', descripcion_general: 'Descripción', condiciones_servicio: 'Garantía',
  condiciones_comerciales: 'Condiciones', nombre_cliente: 'Nombre', cliente_id: 'Cliente', nombre: 'Nombre', email: 'Correo',
  telefono: 'Teléfono', cargo: 'Cargo', activo: 'Activo', permisos: 'Permisos', descripcion: 'Descripción', vista_at: 'Vista por el cliente',
  respondida_at: 'Respondida en línea', respondida_por: 'Respondida por', aceptada_at: 'Fecha de aceptación', enviada_at: 'Enviada',
  motivo_perdida: 'Motivo de pérdida', fecha: 'Fecha', hora_inicio: 'Hora de inicio', hora_fin: 'Hora de término',
  responsable: 'Responsable', titulo: 'Título', costo: 'Costo', codigo: 'Código', folio: 'Folio', rol_id: 'Rol', usuario_id: 'Usuario',
  moneda: 'Moneda', valor_uf: 'Valor UF', descuento_global: 'Descuento', data: 'Datos', seguimientos: 'Seguimientos',
  seguimiento_at: 'Último seguimiento', direccion: 'Dirección', rut: 'RUT', notas: 'Notas', prioridad: 'Prioridad',
};
const campo = (k: string) => CAMPOS[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (v === '[contenido extenso]') return 'contenido extenso (cambió)';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return new Date(s).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
  return s;
}

const VERBO = { crear: 'creó', editar: 'editó', eliminar: 'eliminó' } as const;
const COLOR = { crear: 'var(--success)', editar: 'var(--info)', eliminar: 'var(--danger)' } as const;

function etiquetaDia(iso: string) {
  const d = new Date(iso); const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

const POR_PAGINA = 80;

export default function AuditoriaPage() {
  const { error: toastError } = useToast();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [tabla, setTabla] = useState('');
  const [persona, setPersona] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, string>>({});
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('id, nombre, email').order('nombre'),
        supabase.from('roles').select('id, nombre'),
      ]);
      setPersonas((p.data || []).map(x => ({ id: x.id as string, nombre: (x.nombre || x.email) as string })));
      setRolesMap(Object.fromEntries((r.data || []).map(x => [x.id as string, x.nombre as string])));
    })();
  }, []);

  const cargar = useCallback(async (desdeFila: number) => {
    setCargando(true);
    try {
      let q = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).range(desdeFila, desdeFila + POR_PAGINA - 1);
      if (tabla) q = q.eq('tabla', tabla);
      if (persona === 'sistema') q = q.is('usuario_id', null);
      else if (persona) q = q.eq('usuario_id', persona);
      if (desde) q = q.gte('created_at', new Date(desde + 'T00:00:00').toISOString());
      if (hasta) q = q.lte('created_at', new Date(hasta + 'T23:59:59').toISOString());
      const { data, error } = await q;
      if (error) throw error;
      const nuevos = (data || []) as Evento[];
      setEventos(prev => (desdeFila === 0 ? nuevos : [...prev, ...nuevos]));
      setHayMas(nuevos.length === POR_PAGINA);

      // Nombres de los registros (folio, nombre…) para que se entienda qué cambió.
      const porTabla: Record<string, Set<string>> = {};
      for (const e of nuevos) if (e.registro_id && TABLAS[e.tabla]?.select) (porTabla[e.tabla] ||= new Set()).add(e.registro_id);
      const pares = await Promise.all(Object.entries(porTabla).map(async ([t, ids]) => {
        const { data: filas } = await supabase.from(t).select(TABLAS[t].select!).in('id', [...ids]);
        return ((filas || []) as unknown as Record<string, unknown>[]).map(f => [`${t}:${f.id}`, TABLAS[t].etiqueta!(f)] as const);
      }));
      setEtiquetas(prev => ({ ...prev, ...Object.fromEntries(pares.flat()) }));
    } catch (e) {
      toastError('No se pudo cargar la auditoría: ' + (e instanceof Error ? e.message : ''));
    } finally { setCargando(false); }
  }, [tabla, persona, desde, hasta, toastError]);

  useEffect(() => { cargar(0); }, [cargar]);

  /** Qué registro es, aunque ya no exista (la auditoría guarda una copia al crear y eliminar). */
  const queEs = (e: Evento): string => {
    const t = TABLAS[e.tabla];
    if (e.tabla === 'usuario_roles') {
      const c = (e.cambios || {}) as Record<string, unknown>;
      const rol = rolesMap[String(c.rol_id || '')];
      const quien = personas.find(p => p.id === c.usuario_id)?.nombre;
      if (e.accion === 'editar' && c.activo && typeof c.activo === 'object') {
        return `un rol de un usuario (${(c.activo as { despues?: boolean }).despues ? 'activado' : 'desactivado'})`;
      }
      return `el rol${rol ? ` «${rol}»` : ''}${quien ? ` de ${quien}` : ''}`;
    }
    const conocido = e.registro_id ? etiquetas[`${e.tabla}:${e.registro_id}`] : '';
    const copia = e.accion !== 'editar' && e.cambios && t?.etiqueta ? t.etiqueta(e.cambios) : '';
    const nombre = t?.nombre?.toLowerCase() || e.tabla;
    return `${nombre}${conocido || copia ? ` ${conocido || copia}` : ''}`;
  };

  const grupos = useMemo(() => {
    const g: { dia: string; items: Evento[] }[] = [];
    for (const e of eventos) {
      const d = etiquetaDia(e.created_at);
      const ult = g[g.length - 1];
      if (ult && ult.dia === d) ult.items.push(e); else g.push({ dia: d, items: [e] });
    }
    return g;
  }, [eventos]);

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi empresa" title="Auditoría" subtitle="Quién creó, cambió o eliminó qué, y cuándo. La anota la base de datos sola y nadie la puede editar." />
      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          <select className="input" value={tabla} onChange={e => setTabla(e.target.value)} aria-label="Sección">
            <option value="">Todas las secciones</option>
            {Object.entries(TABLAS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
          <select className="input" value={persona} onChange={e => setPersona(e.target.value)} aria-label="Persona">
            <option value="">Todas las personas</option>
            <option value="sistema">Sistema o cliente (enlace)</option>
            {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} aria-label="Desde" />
          <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} aria-label="Hasta" />
        </div>

        {cargando && eventos.length === 0 ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 6 }}>{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 48 }} />)}</div>
        ) : eventos.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>
            <History size={34} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
            <p style={{ fontSize: '0.9rem' }}>Sin movimientos con estos filtros.</p>
          </div>
        ) : grupos.map(g => (
          <div key={g.dia}>
            <div style={{ padding: '0.6rem 1rem 0.4rem', background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.86rem', color: 'var(--text)', textTransform: 'capitalize' }}>{g.dia}</div>
            {g.items.map(e => {
              const n = e.accion === 'editar' ? Object.keys(e.cambios || {}).length : 0;
              const open = abierto === e.id;
              const url = e.registro_id && e.accion !== 'eliminar' ? TABLAS[e.tabla]?.url?.(e.registro_id) : undefined;
              return (
                <div key={e.id} style={{ borderTop: '1px solid var(--border2)' }}>
                  <button onClick={() => setAbierto(open ? null : e.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 1rem', background: open ? 'var(--bg3)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', width: 42, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(e.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR[e.accion], flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
                      <b style={{ fontWeight: 600 }}>{e.usuario_nombre || 'Alguien'}</b> {VERBO[e.accion]} {queEs(e)}
                      {n > 0 && <span style={{ color: 'var(--muted)' }}> · {n} {n === 1 ? 'campo' : 'campos'}</span>}
                    </span>
                    {e.usuario_id === null && <Settings2 size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} aria-label="Sistema" />}
                    <ChevronDown size={15} style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                  </button>
                  {open && (
                    <div style={{ padding: '0.25rem 1rem 0.9rem 4.4rem', background: 'var(--bg3)', overflowX: 'auto' }}>
                      <table className="iv-table" style={{ fontSize: '0.82rem' }}>
                        <thead><tr><th>Campo</th>{e.accion === 'editar' ? <><th>Antes</th><th>Después</th></> : <th>{e.accion === 'crear' ? 'Valor' : 'Valor al eliminar'}</th>}</tr></thead>
                        <tbody>
                          {Object.entries(e.cambios || {}).map(([k, v]) => {
                            const par = e.accion === 'editar' ? (v as { antes?: unknown; despues?: unknown }) : null;
                            return (
                              <tr key={k}>
                                <td style={{ fontWeight: 500 }}>{campo(k)}</td>
                                {par ? <><td style={{ color: 'var(--muted)' }}>{valor(par.antes)}</td><td>{valor(par.despues)}</td></>
                                  : <td>{valor(v)}</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {url && <a href={url} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Abrir</a>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {hayMas && (
          <div style={{ padding: '0.9rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-ghost" disabled={cargando} onClick={() => cargar(eventos.length)}>{cargando ? <Loader2 size={14} className="iv-spin" /> : null} Cargar más</button>
          </div>
        )}
      </div>
    </div>
  );
}
