'use client';

import { useState } from 'react';
import { Sparkles, X, Loader2, Wand2, PackagePlus, AlertTriangle } from 'lucide-react';
import { formatCLP } from '@/utils';
import { catalogoService } from '@/services/catalogo';
import { CATEGORIA_LABELS, CATEGORIA_COLORS } from '@/types';
import type { BorradorIA, PartidaIAResuelta, CategoriaItem, Moneda } from '@/types';

// ── Matcheo contra la biblioteca sincronizada ────────────────────────────────
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 3);

/** Devuelve el mejor ítem del catálogo para un componente, o null si no hay match confiable. */
function matchCatalogo(
  desc: string, categoria: CategoriaItem,
  catalogo: Array<{ descripcion: string; categoria: CategoriaItem; unidad: string; costo: number; codigo?: string; familia?: string }>,
) {
  const at = tokens(desc);
  if (at.length === 0) return null;
  let best: typeof catalogo[number] | null = null;
  let bestScore = 0;
  for (const it of catalogo) {
    if (it.categoria !== categoria) continue;
    const ct = new Set(tokens(`${it.descripcion} ${it.familia || ''}`));
    let shared = 0;
    for (const t of at) if (ct.has(t)) shared++;
    const score = shared / at.length; // cobertura de los términos de la IA
    if (shared >= 2 && score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 0.5 ? best : null;
}

const EJEMPLOS = [
  'Habilitación eléctrica de 3 locales comerciales: tablero por local, iluminación LED, 6 enchufes y certificación SEC.',
  'Instalación de 20 puntos de red de datos cat 6 en oficina, con canalización y patch panel.',
  'Suministro y montaje de 12 luminarias LED de alumbrado público en poste existente.',
];

export default function CotizarIAModal({
  moneda, onInsertar, onClose,
}: {
  moneda: Moneda;
  onInsertar: (partidas: PartidaIAResuelta[]) => void;
  onClose: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState('');
  const [resueltas, setResueltas] = useState<PartidaIAResuelta[] | null>(null);

  async function generar() {
    if (descripcion.trim().length < 10) { setError('Describe el proyecto con un poco más de detalle.'); return; }
    setCargando(true);
    setError(null);
    setResueltas(null);
    try {
      const res = await fetch('/api/cotizar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion: descripcion.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'No se pudo generar la cotización.'); return; }

      const borrador = data.borrador as BorradorIA;

      // Precios reales desde la biblioteca sincronizada (best-effort).
      let catalogo: Awaited<ReturnType<typeof catalogoService.getAll>> = [];
      try { catalogo = await catalogoService.getAll(false); } catch { /* sin catálogo: usa estimados */ }

      const resolved: PartidaIAResuelta[] = borrador.partidas.map(p => ({
        nombre: p.nombre,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        unidad: p.unidad,
        componentes: p.componentes.map(c => {
          const m = catalogo.length ? matchCatalogo(c.descripcion, c.categoria, catalogo) : null;
          return m
            ? { descripcion: m.descripcion, categoria: c.categoria, unidad: m.unidad || c.unidad, cantidad: c.cantidad, costo: m.costo, codigo: m.codigo, matched: true }
            : { descripcion: c.descripcion, categoria: c.categoria, unidad: c.unidad, cantidad: c.cantidad, costo: c.costoUnitario, matched: false };
        }),
      }));

      setResumen(borrador.resumen || '');
      setResueltas(resolved);
    } catch {
      setError('Error de conexión al generar la cotización.');
    } finally {
      setCargando(false);
    }
  }

  const costoTotal = (resueltas || []).reduce(
    (acc, p) => acc + p.componentes.reduce((a, c) => a + c.costo * c.cantidad, 0), 0,
  );
  const totalComponentes = (resueltas || []).reduce((acc, p) => acc + p.componentes.length, 0);
  const totalMatched = (resueltas || []).reduce(
    (acc, p) => acc + p.componentes.filter(c => c.matched).length, 0,
  );

  const chip = (cat: CategoriaItem) => (
    <span style={{
      fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: CATEGORIA_COLORS[cat], border: `1px solid ${CATEGORIA_COLORS[cat]}44`,
      padding: '0.05rem 0.3rem', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
    }}>{CATEGORIA_LABELS[cat]}</span>
  );

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 720, width: '94%', margin: '0 auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Encabezado */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--y)' }}>
            <Sparkles size={14} /> Cotizar con IA
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '1.25rem 1.4rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

          {/* Entrada */}
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
              Describe el proyecto en lenguaje natural. La IA lo estructura en partidas con materiales, mano de obra y servicios, y usa los precios reales de tu biblioteca cuando encuentra coincidencias.
            </p>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Ej: Habilitación eléctrica de una bodega de 200 m²: tablero general, 8 circuitos, iluminación LED industrial, canalización y puesta a tierra…"
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: 'var(--r)', padding: '0.7rem', outline: 'none', fontSize: '0.88rem', lineHeight: 1.5, resize: 'vertical', fontFamily: 'var(--font-body)' }}
            />
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {EJEMPLOS.map((ej, i) => (
                <button key={i} onClick={() => setDescripcion(ej)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.62rem', padding: '0.25rem 0.5rem', borderRadius: 'var(--r-sm)', textAlign: 'left', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ej}>
                  {ej}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--danger)', padding: '0.6rem 0.75rem', borderRadius: 'var(--r-sm)', fontSize: '0.78rem' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
            </div>
          )}

          {/* Vista previa del borrador */}
          {resueltas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {resumen && (
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic', borderLeft: '2px solid var(--y-brand)', paddingLeft: '0.6rem' }}>{resumen}</p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.62rem', color: 'var(--muted)' }}>
                <span>{resueltas.length} partidas</span>·
                <span>{totalComponentes} ítems</span>·
                <span style={{ color: 'var(--success)' }}>{totalMatched} con precio de catálogo</span>
              </div>

              {resueltas.map((p, pi) => {
                const sub = p.componentes.reduce((a, c) => a + c.costo * c.cantidad, 0);
                return (
                  <div key={pi} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderLeft: '3px solid var(--y-brand)', borderRadius: 'var(--r)', padding: '0.7rem 0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>{p.nombre}</span>
                      <span style={{ fontSize: '0.66rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{p.cantidad} {p.unidad}</span>
                    </div>
                    {p.descripcion && <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0.2rem 0 0.4rem', lineHeight: 1.4 }}>{p.descripcion}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {p.componentes.map((c, ci) => (
                        <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.74rem', padding: '0.2rem 0' }}>
                          {chip(c.categoria)}
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={c.descripcion}>
                            {c.descripcion}
                            {c.matched && c.codigo && <span style={{ color: 'var(--y)', fontFamily: 'monospace', marginLeft: 4 }}>· {c.codigo}</span>}
                          </span>
                          <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.cantidad} {c.unidad}</span>
                          <span style={{ color: c.matched ? 'var(--success)' : 'var(--faint)', whiteSpace: 'nowrap', minWidth: 68, textAlign: 'right' }} title={c.matched ? 'Precio de la biblioteca' : 'Costo estimado por la IA'}>
                            {formatCLP(c.costo)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px dashed var(--border2)', marginTop: '0.4rem', paddingTop: '0.35rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                      costo partida ≈ <span style={{ color: 'var(--text)', fontWeight: 700, marginLeft: 4 }}>{formatCLP(sub)}</span>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,198,0,0.07)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.5rem 0.7rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                <AlertTriangle size={13} style={{ color: 'var(--y)', flexShrink: 0 }} />
                Borrador generado por IA — revísalo y ajústalo. Los montos son <b style={{ color: 'var(--text)' }}>costos netos</b>; el margen y el IVA se aplican al insertar según tus supuestos.
                {moneda === 'UF' && ' Los costos en CLP se convertirán a UF con el valor cargado.'}
              </div>
            </div>
          )}
        </div>

        {/* Pie de acciones */}
        <div style={{ padding: '1rem 1.4rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {resueltas && (
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Costo total estimado ≈ <b style={{ color: 'var(--text)' }}>{formatCLP(costoTotal)}</b>
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={generar}
              disabled={cargando}
              style={{ background: resueltas ? 'var(--bg3)' : 'var(--y-brand)', color: resueltas ? 'var(--muted)' : 'var(--on-accent)', border: resueltas ? '1px solid var(--border2)' : 'none', cursor: cargando ? 'not-allowed' : 'pointer', height: 40, borderRadius: 'var(--r)', padding: '0 1rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: cargando ? 0.6 : 1 }}
            >
              {cargando ? <Loader2 size={13} className="iv-spin" /> : <Wand2 size={13} />}
              {cargando ? 'Generando…' : (resueltas ? 'Regenerar' : 'Generar')}
            </button>
            {resueltas && (
              <button
                onClick={() => { onInsertar(resueltas); }}
                style={{ background: 'var(--success)', color: '#04210f', border: 'none', cursor: 'pointer', height: 40, borderRadius: 'var(--r)', padding: '0 1rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <PackagePlus size={14} /> Insertar en la cotización
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
