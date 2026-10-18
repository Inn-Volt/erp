'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, X, Loader2, Wand2, PackagePlus, AlertTriangle, RotateCcw } from 'lucide-react';
import { formatCLP, resolverBorradorIA, dividirPedidoIA, type PedidoIA } from '@/utils';
import { catalogoService } from '@/services/catalogo';
import { CATEGORIA_LABELS, CATEGORIA_COLORS } from '@/types';
import type { BorradorIA, PartidaIAResuelta, CategoriaItem, Moneda, CatalogoItem } from '@/types';
import { fetchConSesion } from '@/lib/fetchConSesion';

const EJEMPLOS = [
  'Habilitación eléctrica de 3 locales comerciales: tablero por local, iluminación LED, 6 enchufes y certificación SEC.',
  'Instalación de 20 puntos de red de datos cat 6 en oficina, con canalización y patch panel.',
  'Suministro y montaje de 12 luminarias LED de alumbrado público en poste existente.',
];

export default function CotizarIAModal({
  moneda, onInsertar, onClose, descripcionInicial = '',
}: {
  moneda: Moneda;
  onInsertar: (partidas: PartidaIAResuelta[]) => void;
  onClose: () => void;
  /** Texto precargado (ej. al venir desde una Solicitud). El usuario lo revisa y genera. */
  descripcionInicial?: string;
}) {
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  const [cargando, setCargando] = useState(false);
  const autoRan = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [resumenes, setResumenes] = useState<string[]>([]);
  const [resueltas, setResueltas] = useState<PartidaIAResuelta[] | null>(null);
  const [progreso, setProgreso] = useState('');
  /** Partes que fallaron (se pueden reintentar sin perder las que sí salieron). */
  const [pendientes, setPendientes] = useState<PedidoIA[]>([]);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  // Un proyecto grande (varios bloques "GENERA SOLO ESTAS PARTIDAS") se genera en partes
  // chicas: cada respuesta tiene que llegar en ~10 s (límite del servidor en Netlify).
  const partes = useMemo(() => dividirPedidoIA(descripcion), [descripcion]);

  async function pedirBorrador(texto: string): Promise<BorradorIA> {
    const res = await fetchConSesion('/api/cotizar-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion: texto }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.borrador) throw new Error(data?.error || 'No se pudo generar la cotización.');
    return data.borrador as BorradorIA;
  }

  const corto = (t: string) => (t.length > 40 ? t.slice(0, 40) + '…' : t);

  /**
   * Genera las partes UNA TRAS OTRA (en paralelo agotarían el cupo por minuto de la IA).
   * Cada parte se reintenta una vez; lo que sale bien se muestra al tiro y se conserva.
   */
  async function ejecutar(pedidos: PedidoIA[], acumular: boolean) {
    setCargando(true);
    setError(null);
    setPendientes([]);
    if (!acumular) { setResueltas(null); setResumenes([]); }

    // Precios reales desde la biblioteca sincronizada (best-effort).
    let catalogo: CatalogoItem[] = [];
    try { catalogo = await catalogoService.getAll(false); } catch { /* sin catálogo: usa estimados */ }

    const fallidos: PedidoIA[] = [];
    let ultimoError = '';
    for (let i = 0; i < pedidos.length; i++) {
      if (!vivo.current) return;
      const p = pedidos[i];
      setProgreso(pedidos.length > 1
        ? `Parte ${i + 1} de ${pedidos.length}${p.partidas.length ? ': ' + p.partidas.map(corto).join(' · ') : ''}`
        : '');
      let listo = false;
      for (let intento = 0; intento < 2 && !listo; intento++) {
        try {
          if (intento > 0) await new Promise(r => setTimeout(r, 1500));
          const b = await pedirBorrador(p.texto);
          if (!vivo.current) return;
          const nuevas = resolverBorradorIA(b, catalogo);
          setResueltas(prev => [...(prev || []), ...nuevas]);
          if (b.resumen) setResumenes(prev => [...prev, b.resumen]);
          listo = true;
        } catch (e) {
          ultimoError = e instanceof Error ? e.message : 'Error de conexión al generar la cotización.';
        }
      }
      if (!listo) fallidos.push(p);
    }
    if (!vivo.current) return;
    setProgreso('');
    setCargando(false);
    if (fallidos.length) {
      setPendientes(fallidos);
      const nombres = fallidos.flatMap(f => f.partidas);
      setError(pedidos.length === 1
        ? ultimoError
        : `Faltaron ${nombres.length ? `${nombres.length} partida(s): ${nombres.map(corto).join(' · ')}` : `${fallidos.length} parte(s)`}. Las demás ya están listas. (${ultimoError})`);
    }
  }

  function generar() {
    if (descripcion.trim().length < 10) { setError('Describe el proyecto con un poco más de detalle.'); return; }
    ejecutar(partes, false);
  }

  // Al venir desde una Solicitud (descripcionInicial precargada), genera el
  // borrador automáticamente: el usuario solo revisa e inserta, sin volver a
  // pulsar "Generar".
  useEffect(() => {
    if (!autoRan.current && descripcionInicial.trim().length >= 10) {
      autoRan.current = true;
      generar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descripcionInicial]);

  const costoTotal = (resueltas || []).reduce(
    (acc, p) => acc + p.componentes.reduce((a, c) => a + c.costo * c.cantidad, 0), 0,
  );
  const totalComponentes = (resueltas || []).reduce((acc, p) => acc + p.componentes.length, 0);
  const totalMatched = (resueltas || []).reduce(
    (acc, p) => acc + p.componentes.filter(c => c.matched).length, 0,
  );

  const chip = (cat: CategoriaItem) => (
    <span style={{
      fontSize: '0.72rem', fontWeight: 700,
      color: CATEGORIA_COLORS[cat], border: `1px solid ${CATEGORIA_COLORS[cat]}44`,
      padding: '0.05rem 0.3rem', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
    }}>{CATEGORIA_LABELS[cat]}</span>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 720, width: '94%', margin: '0 auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Encabezado */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--y)' }}>
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
            {partes.length > 1 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                Proyecto grande: se generará en <b style={{ color: 'var(--text)' }}>{partes.length} partes</b> de hasta 2 partidas, una tras otra (≈ {partes.length * 6} s).
              </p>
            )}
          </div>

          {cargando && progreso && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text)', background: 'var(--bg3)', borderRadius: 'var(--r-sm)', padding: '0.55rem 0.75rem' }}>
              <Loader2 size={14} className="iv-spin" style={{ flexShrink: 0 }} /> <span>{progreso}</span>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--danger)', padding: '0.6rem 0.75rem', borderRadius: 'var(--r-sm)', fontSize: '0.78rem' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{error}</span>
              {pendientes.length > 0 && !cargando && (
                <button onClick={() => ejecutar(pendientes, true)} className="btn btn-ghost btn-xs" style={{ flexShrink: 0 }}>
                  <RotateCcw size={12} /> Reintentar lo que faltó
                </button>
              )}
            </div>
          )}

          {/* Vista previa del borrador */}
          {resueltas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {resumenes.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic', borderLeft: '2px solid var(--y-brand)', paddingLeft: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {resumenes.map((r, i) => <p key={i}>{r}</p>)}
                </div>
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
              style={{ background: resueltas ? 'var(--bg3)' : 'var(--y-brand)', color: resueltas ? 'var(--muted)' : 'var(--on-accent)', border: resueltas ? '1px solid var(--border2)' : 'none', cursor: cargando ? 'not-allowed' : 'pointer', height: 40, borderRadius: 'var(--r)', padding: '0 1rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: cargando ? 0.6 : 1 }}
            >
              {cargando ? <Loader2 size={13} className="iv-spin" /> : <Wand2 size={13} />}
              {cargando ? 'Generando…' : (resueltas ? 'Regenerar' : 'Generar')}
            </button>
            {resueltas && resueltas.length > 0 && (
              <button
                onClick={() => { onInsertar(resueltas); }}
                disabled={cargando}
                title={cargando ? 'Espera a que terminen todas las partes' : undefined}
                style={{ background: 'var(--success)', color: '#04210f', border: 'none', cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.5 : 1, height: 40, borderRadius: 'var(--r)', padding: '0 1rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
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
