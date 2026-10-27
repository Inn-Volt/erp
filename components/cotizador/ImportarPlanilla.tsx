'use client';

/**
 * Importar planilla: una cotización armada en Excel (partidas, ítems con su costo, textos y
 * plan de ejecución) entra al cotizador. Se revisa antes de crear las partidas.
 * El formato lo explica lib/cotizador/planilla.ts; «Descargar planilla de ejemplo» lo trae listo.
 */

import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { leerPlanilla, introduccionDePlanilla, duracionPlan, PLANILLA_EJEMPLO, type PlanillaLeida } from '@/lib/cotizador/planilla';
import { formatMonto } from '@/lib/cotizador/calculo';
import type { VistaPrevia } from '@/components/cotizador/CotizarIAConversa';
import type { Moneda } from '@/lib/cotizador/tipos';
import type { PartidaIAResuelta } from '@/types';

export interface TextosPlanilla { titulo: string; introduccion: string }

export default function ImportarPlanilla({ moneda, previsualizar, onInsertar, onClose }: {
  moneda: Moneda;
  previsualizar: (p: PartidaIAResuelta[]) => VistaPrevia;
  onInsertar: (partidas: PartidaIAResuelta[], textos: TextosPlanilla | null) => void;
  onClose: () => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [p, setP] = useState<PlanillaLeida | null>(null);
  const [error, setError] = useState('');
  const [pasarTextos, setPasarTextos] = useState(true);

  const leer = async (f: File) => {
    setLeyendo(true); setError(''); setNombre(f.name);
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const hojas = libro.SheetNames.map(n => ({
        nombre: n, filas: XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[n], { header: 1, defval: '', raw: true }),
      }));
      setP(leerPlanilla(hojas));
    } catch (e) {
      setP(null); setError(e instanceof Error ? `No se pudo leer el archivo: ${e.message}` : 'No se pudo leer el archivo.');
    } finally { setLeyendo(false); }
  };

  const ejemplo = async () => {
    const XLSX = await import('xlsx');
    const libro = XLSX.utils.book_new();
    for (const h of PLANILLA_EJEMPLO) {
      const ws = XLSX.utils.aoa_to_sheet(h.filas);
      ws['!cols'] = h.filas[0].map((_, i) => ({ wch: Math.min(50, Math.max(...h.filas.map(f => String(f[i] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(libro, ws, h.nombre);
    }
    XLSX.writeFile(libro, 'Planilla_cotizacion_InnVolt.xlsx');
  };

  const vista = p?.partidas.length ? previsualizar(p.partidas) : null;
  const lineas = p?.partidas.reduce((s, x) => s + x.componentes.length, 0) || 0;
  const intro = p ? introduccionDePlanilla(p) : '';
  const hayTextos = !!(p && (p.titulo || intro));

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 860, width: 'min(96vw, 860px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><FileSpreadsheet size={14} /> Importar planilla</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
            Sube un Excel con una fila por ítem: <b>Partida · Tipo · Ítem · Unidad · Cantidad · Costo unitario neto</b> (y si quieres Utilidad %, Imprevistos %, Código).
            Opcional: una hoja <b>Textos</b> (Campo · Texto) y una hoja <b>Plan</b> (Etapa · Inicio · Días) para la carta Gantt.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={archivo} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
            <button className="btn btn-primary" onClick={() => archivo.current?.click()} disabled={leyendo}>
              {leyendo ? <Loader2 size={14} className="iv-spin" /> : <Upload size={14} />} {nombre ? 'Elegir otro archivo' : 'Elegir planilla'}</button>
            <button className="btn btn-ghost" onClick={ejemplo}><Download size={14} /> Descargar planilla de ejemplo</button>
          </div>
          {nombre && !leyendo && <span className="label-muted">{nombre}</span>}
          {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</p>}

          {p && <>
            {p.avisos.length > 0 && (
              <div style={{ border: '1px solid rgba(217,119,6,.4)', borderRadius: 10, padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: '#d97706' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}><AlertTriangle size={14} /> Revisa</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>{p.avisos.slice(0, 10).map((a, i) => <li key={i}>{a}</li>)}</ul>
                {p.avisos.length > 10 && <span>y {p.avisos.length - 10} más.</span>}
              </div>
            )}
            {p.partidas.length > 0 && (
              <div>
                <span className="label-muted">{p.partidas.length} partida{p.partidas.length === 1 ? '' : 's'} · {lineas} línea{lineas === 1 ? '' : 's'}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {p.partidas.map((x, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', border: '1px solid var(--border2)', borderRadius: 10, padding: '0.45rem 0.65rem', fontSize: '0.84rem', color: 'var(--text)' }}>
                      <b style={{ flex: 1, minWidth: 0 }}>{x.nombre}</b>
                      <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>{x.componentes.length} línea{x.componentes.length === 1 ? '' : 's'}</span>
                      {vista && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMonto(vista.porPartida[i], moneda)}</span>}
                    </div>
                  ))}
                </div>
                {vista && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.86rem', color: 'var(--text)', textAlign: 'right' }}>
                    Neto <b>{formatMonto(vista.neto, moneda)}</b> · IVA {formatMonto(vista.iva, moneda)} · Total <b>{formatMonto(vista.total, moneda)}</b>
                    <br /><span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Con la utilidad escrita en la planilla o, si falta, la de Ajustes.</span>
                  </p>
                )}
              </div>
            )}
            {hayTextos && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.86rem', color: 'var(--text)' }}>
                <input type="checkbox" checked={pasarTextos} onChange={e => setPasarTextos(e.target.checked)} style={{ accentColor: 'var(--y-brand)', marginTop: 3 }} />
                <span>Usar los textos de la planilla
                  {p.titulo && <> · título «{p.titulo}»</>}
                  {p.textos.length > 0 && <> · {p.textos.map(t => t.titulo).join(', ')}</>}
                  {p.etapas.length > 0 && <> · plan de {p.etapas.length} etapas ({duracionPlan(p.etapas)} días hábiles)</>}
                </span>
              </label>
            )}
          </>}
        </div>

        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!p?.partidas.length}
            onClick={() => p && onInsertar(p.partidas, pasarTextos && hayTextos ? { titulo: p.titulo, introduccion: intro } : null)}>Crear partidas</button>
        </div>
      </div>
    </div>
  );
}
