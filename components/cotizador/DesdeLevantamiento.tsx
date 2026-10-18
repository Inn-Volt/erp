'use client';

/**
 * Del levantamiento a la cotización (fase 11). Lee los informes de la visita y arma un resumen
 * revisable ANTES de crear partidas:
 *   · Trabajos, materiales, equipos y servicios detectados, con la cantidad SOLO si se registró
 *     y su origen (medido, declarado, estimado o pendiente).
 *   · Para cada uno, el artículo de la biblioteca que mejor calza (si hay): se usa su precio.
 *     Si no hay, la línea queda fuera de la biblioteca y sin precio, para valorizar.
 *   · Requisitos y diagnóstico (para leer), y condiciones de montaje, exclusiones y pendientes
 *     (editables), que pueden pasar a la introducción de la cotización.
 * Nada se inventa: sin cantidad registrada, la línea entra en 0 y marcada «por confirmar».
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, Library, Loader2, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { supabase } from '@/lib/supabase';
import { antecedentesCotizacion, type AntecedentesCot, type CategoriaCot, type FilaCotizable, type InformeVisita } from '@/services/informes';
import type { ArticuloCatalogo } from '@/lib/cotizador/tipos';
import type { PartidaIAResuelta } from '@/types';
import { mejorMatchCatalogo } from '@/utils';

const CATEGORIAS: { clave: CategoriaCot; nombre: string }[] = [
  { clave: 'material', nombre: 'Material / equipo' }, { clave: 'mano_obra', nombre: 'Mano de obra' },
  { clave: 'servicio', nombre: 'Servicio' }, { clave: 'operacion', nombre: 'Operación' },
];
const COLOR_ORIGEN: Record<string, string> = {
  'Medido en terreno': 'var(--success)', 'Declarado por el cliente': 'var(--info)',
  'Estimado por el técnico': '#d97706', 'Pendiente de confirmar': 'var(--danger)',
};

export interface TextosLevantamiento { montaje: string; exclusiones: string; pendientes: string }

export default function DesdeLevantamiento({ agendaId, catalogo, onInsertar, onClose }: {
  agendaId: string; catalogo: ArticuloCatalogo[];
  onInsertar: (partidas: PartidaIAResuelta[], textos: TextosLevantamiento | null) => void; onClose: () => void;
}) {
  const [informes, setInformes] = useState<InformeVisita[] | null>(null);
  const [a, setA] = useState<AntecedentesCot | null>(null);
  const [filas, setFilas] = useState<FilaCotizable[]>([]);
  const [usarBiblio, setUsarBiblio] = useState<Record<string, boolean>>({});
  const [textos, setTextos] = useState<TextosLevantamiento>({ montaje: '', exclusiones: '', pendientes: '' });
  const [pasarTextos, setPasarTextos] = useState(true);

  useEffect(() => {
    supabase.from('informes_visita').select('*').eq('agendamiento_id', agendaId).order('folio').then(({ data }) => {
      const infs = (data || []) as InformeVisita[];
      const r = antecedentesCotizacion(infs);
      setInformes(infs); setA(r); setFilas(r.filas);
      const junta = (xs: { etiqueta: string; texto: string }[]) => xs.map(x => `- ${x.etiqueta}: ${x.texto}`).join('\n');
      setTextos({ montaje: junta(r.montaje), exclusiones: junta(r.exclusiones), pendientes: junta(r.pendientes) });
    });
  }, [agendaId]);

  const cat = useMemo(() => catalogo.map(x => ({ ...x, familia: x.familia || undefined })), [catalogo]);
  const matches = useMemo(() => Object.fromEntries(filas.map(f => [f.id, f.categoria === 'servicio' ? null
    : mejorMatchCatalogo(f.descripcion, f.categoria === 'mano_obra' ? 'mano_obra' : 'material', cat)])), [filas, cat]);

  const set = (id: string, patch: Partial<FilaCotizable>) => setFilas(fs => fs.map(f => (f.id === id ? { ...f, ...patch } : f)));
  const incluidas = filas.filter(f => f.incluir && f.descripcion.trim());
  const sinCantidad = incluidas.filter(f => f.cantidad === null).length;
  const borradores = (informes || []).filter(i => i.estado === 'borrador').length;

  const crear = () => {
    const componente = (f: FilaCotizable) => {
      const m = usarBiblio[f.id] !== false ? matches[f.id] : null;
      const extra = [f.especificacion, f.marca ? `marca/modelo: ${f.marca}` : null].filter(Boolean).join(' · ');
      const base = m ? m.descripcion : `${f.descripcion}${extra ? ` (${extra})` : ''}`;
      return {
        descripcion: f.cantidad === null ? `${base} · cantidad por confirmar` : base,
        categoria: f.categoria, unidad: m?.unidad || f.unidad || 'un',
        cantidad: f.cantidad ?? 0, costo: m ? m.costo : 0,
        codigo: m?.codigo || undefined, matched: !!m,
      };
    };
    const obras = incluidas.filter(f => f.categoria !== 'servicio');
    const servicios = incluidas.filter(f => f.categoria === 'servicio');
    const partidas: PartidaIAResuelta[] = [];
    if (obras.length) partidas.push({ nombre: 'Trabajos según levantamiento', descripcion: '', cantidad: 1, unidad: 'global', componentes: obras.map(componente) });
    if (servicios.length) partidas.push({ nombre: 'Servicios adicionales', descripcion: '', cantidad: 1, unidad: 'global', componentes: servicios.map(componente) });
    onInsertar(partidas, pasarTextos ? textos : null);
  };

  const bloqueLectura = (titulo: string, xs: { etiqueta: string; texto: string }[]) => xs.length ? (
    <div>
      <span className="label-muted">{titulo}</span>
      <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem', fontSize: '0.84rem', color: 'var(--text)' }}>
        {xs.map((x, i) => <li key={i}><b>{x.etiqueta}:</b> {x.texto}</li>)}
      </ul>
    </div>
  ) : null;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 980, width: 'min(96vw, 980px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><ClipboardList size={14} /> Del levantamiento a la cotización</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!a ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)' }}><Loader2 size={15} className="iv-spin" /> Leyendo los informes…</div>
            : !informes?.length ? <p style={{ margin: 0, color: 'var(--muted)' }}>Esta visita no tiene informes.</p> : <>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
                {informes.length} informe{informes.length === 1 ? '' : 's'}: {informes.map(i => i.plantilla_nombre).join(', ')}. Revisa, corrige y elige qué entra.
                Lo que tenga artículo en la biblioteca toma su precio; lo demás queda sin precio para valorizar.
              </p>
              {borradores > 0 && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#d97706', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <AlertTriangle size={14} /> {borradores} informe{borradores === 1 ? ' está' : 's están'} en borrador: puede faltar información.</p>
              )}
              {bloqueLectura('Lo que pide el cliente', a.requisitos)}
              {bloqueLectura('Diagnóstico y hallazgos', a.diagnostico)}

              <div>
                <span className="label-muted">Trabajos, materiales, equipos y servicios detectados ({filas.length})</span>
                {!filas.length && <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>Los informes no traen ítems para cotizar.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {filas.map(f => {
                    const m = matches[f.id];
                    return (
                      <div key={f.id} style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '0.5rem 0.6rem', opacity: f.incluir ? 1 : 0.5, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 8 }}>
                        <input type="checkbox" checked={f.incluir} onChange={e => set(f.id, { incluir: e.target.checked })} aria-label="Incluir" style={{ accentColor: 'var(--y-brand)', width: 18, height: 18, marginTop: 8 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 6 }}>
                            <input className="input" style={{ gridColumn: 'span 3', minWidth: 0 }} value={f.descripcion} onChange={e => set(f.id, { descripcion: e.target.value })} aria-label="Descripción" />
                            <NumeroInput className="input" value={f.cantidad} decimales={2} mostrarCero onChange={n => set(f.id, { cantidad: n })} onVacio={() => set(f.id, { cantidad: null })} sufijo={f.unidad} />
                            <select className="input" value={f.categoria} onChange={e => set(f.id, { categoria: e.target.value as CategoriaCot })} aria-label="Categoría">
                              {CATEGORIAS.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</select>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.74rem' }}>
                            <span style={{ color: COLOR_ORIGEN[f.origen] || 'var(--muted)', fontWeight: 600 }}>● {f.cantidad === null ? 'Sin cantidad: por confirmar' : f.origen}</span>
                            <span style={{ color: 'var(--muted)' }}>· {f.informe}</span>
                            {f.especificacion && <span style={{ color: 'var(--muted)' }}>· {f.especificacion}</span>}
                            {f.marca && <span style={{ color: 'var(--muted)' }}>· {f.marca}</span>}
                            {f.validacion && f.validacion !== 'Validado con el cliente' && <span style={{ color: '#d97706' }}>· {f.validacion}</span>}
                            {m ? (
                              <label style={{ display: 'flex', gap: 4, alignItems: 'center', color: 'var(--text)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={usarBiblio[f.id] !== false} onChange={e => setUsarBiblio(u => ({ ...u, [f.id]: e.target.checked }))} style={{ accentColor: 'var(--y-brand)' }} />
                                <Library size={12} /> Biblioteca: {m.descripcion}</label>
                            ) : <span style={{ color: 'var(--muted)' }}>· Sin artículo en la biblioteca: queda sin precio</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
                {([['montaje', 'Condiciones de montaje'], ['exclusiones', 'Exclusiones y limitaciones'], ['pendientes', 'Pendiente de confirmar']] as [keyof TextosLevantamiento, string][]).map(([k, t]) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="label-muted">{t}</span>
                    <textarea className="input" rows={4} value={textos[k]} onChange={e => setTextos(x => ({ ...x, [k]: e.target.value }))} style={{ resize: 'vertical' }} />
                  </label>
                ))}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)' }}>
                <input type="checkbox" checked={pasarTextos} onChange={e => setPasarTextos(e.target.checked)} style={{ accentColor: 'var(--y-brand)' }} />
                Agregar montaje, exclusiones y pendientes a la introducción de la cotización</label>
            </>}
        </div>

        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--muted)', minWidth: 180 }}>
            {incluidas.length} ítem{incluidas.length === 1 ? '' : 's'}{sinCantidad ? ` · ${sinCantidad} sin cantidad (entran en 0, por confirmar)` : ''}</span>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!incluidas.length && !pasarTextos} onClick={crear}>Crear partidas</button>
        </div>
      </div>
    </div>
  );
}
