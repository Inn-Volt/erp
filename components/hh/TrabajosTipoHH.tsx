'use client';

/**
 * Trabajos tipo (hh.configurar): agrupados por categoría, con sus HH de referencia de mercado, el
 * cargo principal, el apoyo, el tipo de tarea sugerido y las notas. En la calculadora, partir de
 * uno precarga todo eso.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatoHoras } from '@/lib/hh/calculo';
import { hhService, mensajeHH, type TrabajoTipoHH } from '@/services/hh';
import { Campo, Interruptor, type PropsPestana } from './comun';

type Borrador = Omit<TrabajoTipoHH, 'id'> & { id?: string };

const vacio = (categoria: string, cargo: string, orden: number): Borrador => ({
  categoria, nombre: '', unidad: '', hh_referencia: 0, cargo_principal_id: cargo, cargo_apoyo_id: null, hh_apoyo: 0,
  tipo_tarea_clave: null, precio_mercado_ref: null, duracion_equipo: null, notas: null, activo: true, orden,
});

export default function TrabajosTipoHH({ cat, onCambio }: PropsPestana) {
  const { success, error: toastError } = useToast();
  const [abierto, setAbierto] = useState<string | null>(null);   // id del trabajo, o 'nuevo'
  const [nuevo, setNuevo] = useState<Borrador | null>(null);
  const [busca, setBusca] = useState('');
  const cargo = useMemo(() => new Map(cat.cargos.map(c => [c.id, c])), [cat.cargos]);
  const tipo = useMemo(() => new Map(cat.tipos.map(t => [t.clave, t])), [cat.tipos]);
  const filtrados = cat.trabajos.filter(t => !busca.trim() || `${t.categoria} ${t.nombre}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const categorias = [...new Set(filtrados.map(t => t.categoria))];

  const guardar = async (b: Borrador) => {
    try {
      await hhService.guardarTrabajo({
        ...b, categoria: b.categoria.trim(), nombre: b.nombre.trim(), unidad: b.unidad?.trim() || null, notas: b.notas?.trim() || null,
        precio_mercado_ref: b.precio_mercado_ref?.trim() || null, duracion_equipo: b.duracion_equipo?.trim() || null,
        hh_apoyo: b.cargo_apoyo_id ? b.hh_apoyo : 0,
      });
      success(b.id ? 'Trabajo tipo guardado.' : 'Trabajo tipo creado.');
      setAbierto(null); setNuevo(null);
      await onCambio();
    } catch (e) { toastError(mensajeHH(e)); }
  };
  const activar = async (t: TrabajoTipoHH) => {
    try { await hhService.guardarTrabajo({ id: t.id, activo: !t.activo }); await onCambio(); }
    catch (e) { toastError(mensajeHH(e)); }
  };
  const borrar = async (t: TrabajoTipoHH) => {
    if (!confirm(`¿Borrar «${t.nombre}»? Los cálculos guardados que lo usan no cambian.`)) return;
    try { await hhService.eliminarTrabajo(t.id); success('Trabajo tipo borrado.'); setAbierto(null); await onCambio(); }
    catch (e) { toastError(mensajeHH(e, 'No se pudo borrar.')); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel" style={{ padding: '0.75rem 1rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} aria-hidden />
          <input className="input input-sm" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar trabajo o categoría…" style={{ paddingLeft: '2.2rem' }} aria-label="Buscar trabajos tipo" />
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{cat.trabajos.length} trabajos · en software las HH son horas equivalentes sin IA</span>
        <button className="btn btn-primary btn-sm" disabled={!!nuevo || !cat.cargos.length}
          onClick={() => { setNuevo(vacio(categorias[0] || 'General', cat.cargos.find(c => c.activo)?.id || '', cat.trabajos.length + 1)); setAbierto('nuevo'); }}>
          <Plus size={13} /> Nuevo trabajo tipo
        </button>
      </div>

      {nuevo && abierto === 'nuevo' && (
        <div className="panel-y" style={{ padding: '0.9rem 1rem' }}>
          <p className="section-label" style={{ marginTop: 0 }}>Nuevo trabajo tipo</p>
          <Editor inicial={nuevo} cat={cat} onGuardar={guardar} onCancelar={() => { setNuevo(null); setAbierto(null); }} />
        </div>
      )}

      {categorias.map(cat_ => (
        <div key={cat_} className="panel-y">
          <p className="section-label" style={{ margin: 0, padding: '0.75rem 1rem', borderBottom: '1px solid var(--border2)' }}>{cat_}</p>
          {filtrados.filter(t => t.categoria === cat_).map(t => {
            const ab = abierto === t.id;
            const ap = t.cargo_apoyo_id ? cargo.get(t.cargo_apoyo_id) : undefined;
            return (
              <div key={t.id} style={{ borderTop: '1px solid var(--border2)', opacity: t.activo ? 1 : 0.55 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0.55rem 1rem', flexWrap: 'wrap' }}>
                  <Interruptor activo={t.activo} etiqueta={`${t.nombre} activo`} onChange={() => activar(t)} />
                  <button type="button" onClick={() => setAbierto(ab ? null : t.id)} aria-expanded={ab}
                    style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', gap: 6, alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                    {ab ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                    <span style={{ minWidth: 0 }}>
                      <b>{t.nombre}</b>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {formatoHoras(t.hh_referencia)} HH por {t.unidad || 'unidad'} · {cargo.get(t.cargo_principal_id)?.nombre ?? '—'}
                        {ap ? ` + ${ap.nombre} (${formatoHoras(t.hh_apoyo)} HH)` : ''}
                        {t.tipo_tarea_clave ? ` · ${tipo.get(t.tipo_tarea_clave)?.nombre ?? t.tipo_tarea_clave}` : ''}
                      </span>
                    </span>
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => borrar(t)} aria-label={`Borrar ${t.nombre}`}><Trash2 size={12} /></button>
                </div>
                {ab && <div style={{ padding: '0 1rem 0.9rem' }}><Editor inicial={t} cat={cat} onGuardar={guardar} onCancelar={() => setAbierto(null)} /></div>}
              </div>
            );
          })}
        </div>
      ))}
      {categorias.length === 0 && <p className="panel" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>{cat.trabajos.length ? 'Nada con esa búsqueda.' : 'Aún no hay trabajos tipo.'}</p>}
    </div>
  );
}

function Editor({ inicial, cat, onGuardar, onCancelar }: {
  inicial: Borrador; cat: PropsPestana['cat']; onGuardar: (b: Borrador) => Promise<void>; onCancelar: () => void;
}) {
  const { warning } = useToast();
  const [b, setB] = useState<Borrador>(inicial);
  const [ocupado, setOcupado] = useState(false);
  const categorias = [...new Set(cat.trabajos.map(t => t.categoria))];
  const cargos = cat.cargos.filter(c => c.activo || c.id === b.cargo_principal_id || c.id === b.cargo_apoyo_id);
  const texto = (k: 'unidad' | 'precio_mercado_ref' | 'duracion_equipo' | 'notas') => ({
    value: b[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setB({ ...b, [k]: e.target.value }),
  });
  const guardar = async () => {
    if (!b.categoria.trim() || !b.nombre.trim()) { warning('Categoría y nombre.'); return; }
    if (!b.cargo_principal_id) { warning('Elige el cargo principal.'); return; }
    setOcupado(true);
    await onGuardar(b);
    setOcupado(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
        <Campo etiqueta="Categoría">
          <input className="input input-sm" list="hh-categorias" value={b.categoria} onChange={e => setB({ ...b, categoria: e.target.value })} />
          <datalist id="hh-categorias">{categorias.map(c => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo etiqueta="Trabajo"><input className="input input-sm" value={b.nombre} onChange={e => setB({ ...b, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Unidad"><input className="input input-sm" {...texto('unidad')} placeholder="punto, proyecto…" /></Campo>
        <Campo etiqueta="HH de referencia (por unidad)">
          <NumeroInput className="input input-sm" value={b.hh_referencia} decimales={2} min={0} onChange={v => setB({ ...b, hh_referencia: v })} mostrarCero ariaLabel="HH de referencia" />
        </Campo>
        <Campo etiqueta="Cargo principal">
          <select className="input input-sm" value={b.cargo_principal_id} onChange={e => setB({ ...b, cargo_principal_id: e.target.value })}>
            <option value="" disabled>Elige…</option>
            {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de tarea sugerido">
          <select className="input input-sm" value={b.tipo_tarea_clave ?? ''} onChange={e => setB({ ...b, tipo_tarea_clave: e.target.value || null })}>
            <option value="">— Sin tipo —</option>
            {cat.tipos.map(t => <option key={t.clave} value={t.clave}>{t.nombre} (× {String(t.multiplicador).replace('.', ',')})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Apoyo">
          <select className="input input-sm" value={b.cargo_apoyo_id ?? ''} onChange={e => setB({ ...b, cargo_apoyo_id: e.target.value || null })}>
            <option value="">— Sin apoyo —</option>
            {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="HH de apoyo (por unidad)">
          <NumeroInput className="input input-sm" value={b.hh_apoyo} decimales={2} min={0} disabled={!b.cargo_apoyo_id} onChange={v => setB({ ...b, hh_apoyo: v })} ariaLabel="HH de apoyo" />
        </Campo>
        <Campo etiqueta="Referencia de mercado"><input className="input input-sm" {...texto('precio_mercado_ref')} placeholder="$… (fuente)" /></Campo>
        <Campo etiqueta="Duración / equipo"><input className="input input-sm" {...texto('duracion_equipo')} placeholder="1 técnico, 2 días…" /></Campo>
        <Campo etiqueta="Orden">
          <NumeroInput className="input input-sm" value={b.orden} decimales={0} mostrarCero onChange={v => setB({ ...b, orden: Math.round(v) })} ariaLabel="Orden" />
        </Campo>
      </div>
      <Campo etiqueta="Notas"><input className="input input-sm" {...texto('notas')} /></Campo>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={guardar}>Guardar</button>
      </div>
    </div>
  );
}
