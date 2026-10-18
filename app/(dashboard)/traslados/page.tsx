'use client';

/**
 * Comercial → Traslados (TecApp): cuánto se cobra por ir a atender una comuna.
 *   · Una fila por comuna y base de salida, con los km (solo ida) o un valor propio.
 *   · Sin valor propio: km × 2 (ida y vuelta) × valor por km; dentro de la zona de su base no
 *     se cobra aparte (va en los gastos operacionales).
 *   · Si el técnico sale de otra base, se cobra ese traslado con el recargo por otra base.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import { faltaFase5, trasladosService, type BaseSalida, type CotizacionTraslado, type Tarifa, type Traslado } from '@/services/fase5';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';

export default function TrasladosPage() {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const edita = puede('traslados.gestionar');
  const [bases, setBases] = useState<BaseSalida[]>([]);
  const [lista, setLista] = useState<Traslado[]>([]);
  const [tarifa, setTarifa] = useState<Tarifa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [busca, setBusca] = useState('');
  const [nueva, setNueva] = useState({ comuna: '', base_id: '', km: '', valor_propio: '' });
  const [prueba, setPrueba] = useState({ comuna: '', base: '' });
  const [res, setRes] = useState<CotizacionTraslado | null>(null);
  const [errPrueba, setErrPrueba] = useState('');

  const cargar = useCallback(async () => {
    try {
      const t = await trasladosService.todo();
      setBases(t.bases); setLista(t.traslados); setTarifa(t.tarifa);
      setNueva(n => ({ ...n, base_id: n.base_id || t.bases.find(b => b.casa_matriz)?.id || t.bases[0]?.id || '' }));
    } catch (e) { if (faltaFase5(e)) setFalta(true); else toastError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombreBase = (id: string) => bases.find(b => b.id === id)?.nombre || '—';
  const valorDe = (t: Traslado) => {
    const b = bases.find(x => x.id === t.base_id);
    if (t.valor_propio !== null && t.valor_propio !== undefined) return { v: Number(t.valor_propio), det: 'valor propio' };
    if (b && Number(t.km) <= Number(b.zona_km)) return { v: 0, det: `dentro de la zona de ${b.nombre}` };
    return { v: Math.round(Number(t.km) * 2 * Number(tarifa?.valor_por_km || 0)), det: `${t.km} km × 2 × ${tarifa?.valor_por_km || 0}` };
  };
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(t => !q || t.comuna.toLowerCase().includes(q));
  }, [lista, busca]);

  const agregar = async () => {
    if (!nueva.comuna.trim() || !nueva.base_id || nueva.km === '') { toastError('Comuna, base y km'); return; }
    try {
      await trasladosService.guardarTraslado({ comuna: nueva.comuna.trim(), base_id: nueva.base_id, km: Number(nueva.km), valor_propio: nueva.valor_propio === '' ? null : Number(nueva.valor_propio) });
      setNueva({ ...nueva, comuna: '', km: '', valor_propio: '' }); cargar();
    } catch (e) { toastError(e instanceof Error ? (/duplicate|unique/i.test(e.message) ? 'Esa comuna ya está desde esa base.' : e.message) : 'No se pudo'); }
  };

  const probar = async () => {
    setRes(null); setErrPrueba('');
    try { setRes(await trasladosService.cotizar(prueba.comuna, prueba.base || null)); }
    catch (e) { setErrPrueba(e instanceof Error ? e.message : 'No se pudo'); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Comercial" title="Traslados" /><FaltaSQL /></div>;
  if (cargando) return <div className="skeleton" style={{ height: 240 }} />;

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Comercial" title="Traslados" subtitle="Lo que se cobra por ir a cada comuna. En el cotizador: ⋯ de la partida → «Agregar traslado»." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="section-label" style={{ margin: 0 }}><Car size={15} /> Tarifa</p>
          {tarifa && <fieldset disabled={!edita} style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label><span className="label-muted">Valor por km</span><NumeroInput className="input" prefijo="$" value={Number(tarifa.valor_por_km)} onChange={v => setTarifa({ ...tarifa, valor_por_km: v })} /></label>
            <label><span className="label-muted">Recargo si sale de otra base</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <NumeroInput className="input" min={0} value={tarifa.recargo_otra_base} onChange={v => setTarifa({ ...tarifa, recargo_otra_base: v })} />
                <select className="input" style={{ width: 90 }} value={tarifa.tipo_recargo} onChange={e => setTarifa({ ...tarifa, tipo_recargo: e.target.value as Tarifa['tipo_recargo'] })}>
                  <option value="porcentaje">%</option><option value="monto">$</option></select>
              </div></label>
            {edita && <button className="btn btn-primary btn-sm" style={{ gridColumn: '1 / -1', justifySelf: 'end' }} onClick={async () => {
              try { await trasladosService.guardarTarifa(tarifa); success('Tarifa guardada'); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
            }}><Save size={13} /> Guardar tarifa</button>}
          </fieldset>}
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>Un promedio que ya incluye combustible, desgaste y estacionamiento.</p>
        </div>

        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="section-label" style={{ margin: 0 }}>Bases de salida</p>
          {bases.map(b => (
            <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}>
              <b style={{ flex: 1, color: 'var(--text)' }}>{b.nombre}{b.casa_matriz ? ' · casa matriz' : ''}</b>
              <span style={{ color: 'var(--muted)' }}>zona sin cobro</span>
              <input className="input" type="number" min={0} disabled={!edita} defaultValue={b.zona_km} style={{ width: 80 }}
                onBlur={async e => { const v = Number(e.target.value) || 0; if (v === Number(b.zona_km)) return;
                  try { await trasladosService.guardarBase({ id: b.id, zona_km: v }); cargar(); } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); } }} /> km
            </div>
          ))}
          {edita && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            const n = prompt('Nombre de la base (una sucursal propia): «Sucursal Rancagua»'); if (!n?.trim()) return;
            try { await trasladosService.guardarBase({ nombre: n.trim(), zona_km: 10 }); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
          }}><Plus size={13} /> Base</button>}
        </div>

        <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="section-label" style={{ margin: 0 }}>Probar</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" list="comunas-lista" value={prueba.comuna} onChange={e => setPrueba({ ...prueba, comuna: e.target.value })} placeholder="Comuna" />
            <select className="input" style={{ width: 150 }} value={prueba.base} onChange={e => setPrueba({ ...prueba, base: e.target.value })}>
              <option value="">Base habitual</option>{bases.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
            <button className="btn btn-primary btn-sm" onClick={probar} disabled={!prueba.comuna.trim()}>Calcular</button>
          </div>
          {res && <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}><b>{formatCLP(res.total)}</b> por visita · {res.detalle}{res.recargo ? ` + recargo ${formatCLP(res.recargo)}` : ''}</p>}
          {errPrueba && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--danger)' }}>{errPrueba}</p>}
          <datalist id="comunas-lista">{Array.from(new Set(lista.map(t => t.comuna))).map(c => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar comuna…" style={{ paddingLeft: '2.2rem' }} />
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{lista.length} filas</span>
        </div>
        {edita && (
          <div style={{ padding: '0.7rem 1rem', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)' }}>
            <input className="input" style={{ flex: 1, minWidth: 150 }} value={nueva.comuna} onChange={e => setNueva({ ...nueva, comuna: e.target.value })} placeholder="Comuna" />
            <select className="input" style={{ width: 160 }} value={nueva.base_id} onChange={e => setNueva({ ...nueva, base_id: e.target.value })}>{bases.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
            <NumeroInput className="input" envoltura={{ width: 90 }} min={0} decimales={1} value={nueva.km === '' ? null : Number(String(nueva.km).replace(',', '.'))}
              onChange={v => setNueva({ ...nueva, km: String(v) })} onVacio={() => setNueva({ ...nueva, km: '' })} placeholder="km ida" />
            <NumeroInput className="input" envoltura={{ width: 130 }} min={0} prefijo="$" value={nueva.valor_propio === '' ? null : Number(String(nueva.valor_propio).replace(',', '.'))}
              onChange={v => setNueva({ ...nueva, valor_propio: String(v) })} onVacio={() => setNueva({ ...nueva, valor_propio: '' })} placeholder="Valor propio (opc.)" />
            <button className="btn btn-primary btn-sm" onClick={agregar}><Plus size={13} /> Agregar</button>
          </div>
        )}
        {filtrados.length === 0 ? <p style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>{lista.length ? 'Nada con esa búsqueda.' : 'Aún no hay comunas en la lista.'}</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr>{['Comuna', 'Sale desde', 'Km (ida)', 'Se cobra', ''].map(h => <th key={h} style={{ padding: '0.55rem 1rem', textAlign: h === 'Se cobra' ? 'right' : 'left', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{filtrados.map(t => { const v = valorDe(t); return (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border2)', opacity: t.activo ? 1 : 0.5 }}>
                  <td style={{ padding: '0.5rem 1rem', fontWeight: 600, color: 'var(--text)' }}>{t.comuna}</td>
                  <td style={{ padding: '0.5rem 1rem', color: 'var(--muted)' }}>{nombreBase(t.base_id)}</td>
                  <td style={{ padding: '0.5rem 1rem' }}>{edita
                    ? <input className="input" type="number" min={0} step="0.1" defaultValue={t.km} style={{ width: 90 }} onBlur={async e => { const k = Number(e.target.value); if (k === Number(t.km)) return;
                        try { await trasladosService.guardarTraslado({ id: t.id, km: k }); cargar(); } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); } }} />
                    : t.km}</td>
                  <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}><b>{formatCLP(v.v)}</b><span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>{v.det}</span></td>
                  <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{edita && <button className="btn btn-ghost btn-xs" aria-label="Quitar" onClick={async () => {
                    if (!confirm(`¿Quitar ${t.comuna} desde ${nombreBase(t.base_id)}?`)) return;
                    try { await trasladosService.eliminarTraslado(t.id); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
                  }}><Trash2 size={12} /></button>}</td>
                </tr>); })}</tbody>
            </table>
          </div>
        )}
      </div>
      {!tarifa && <Loader2 className="iv-spin" />}
    </div>
  );
}
