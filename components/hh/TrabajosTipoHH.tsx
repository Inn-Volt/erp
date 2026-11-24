'use client';

/**
 * Trabajos tipo (hh.configurar): agrupados por categoría, con las horas de mercado por unidad, el
 * cargo, el ayudante, el tipo de tarea sugerido y las notas. En la calculadora, elegir uno precarga
 * todo eso.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatoHoras } from '@/lib/hh/calculo';
import { hhService, mensajeHH, type TrabajoTipoHH } from '@/services/hh';
import { Campo, Interruptor, Vacio, type PropsPestana } from './comun';
import s from './hh.module.css';

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
  const q = busca.trim().toLowerCase();
  const filtrados = cat.trabajos.filter(t => !q || `${t.categoria} ${t.nombre}`.toLowerCase().includes(q));
  const categorias = [...new Set(filtrados.map(t => t.categoria))];

  const guardar = async (b: Borrador) => {
    try {
      await hhService.guardarTrabajo({
        id: b.id, categoria: b.categoria.trim(), nombre: b.nombre.trim(), unidad: b.unidad?.trim() || null, hh_referencia: b.hh_referencia,
        cargo_principal_id: b.cargo_principal_id, cargo_apoyo_id: b.cargo_apoyo_id, hh_apoyo: b.cargo_apoyo_id ? b.hh_apoyo : 0,
        tipo_tarea_clave: b.tipo_tarea_clave, precio_mercado_ref: b.precio_mercado_ref?.trim() || null,
        duracion_equipo: b.duracion_equipo?.trim() || null, notas: b.notas?.trim() || null, activo: b.activo, orden: b.orden,
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
    <div className={s.tarjetas}>
      <div className={`panel ${s.barraHerramientas}`}>
        <div className={s.buscar}>
          <Search size={15} aria-hidden />
          <input className="input input-sm" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar trabajo o categoría…" aria-label="Buscar trabajos tipo" />
        </div>
        <button className="btn btn-primary btn-sm" disabled={!!nuevo || !cat.cargos.length}
          onClick={() => { setNuevo(vacio(categorias[0] || 'General', cat.cargos.find(c => c.activo)?.id || '', cat.trabajos.length + 1)); setAbierto('nuevo'); }}>
          <Plus size={13} /> Nuevo trabajo tipo
        </button>
        <p className={s.ayuda} style={{ flexBasis: '100%' }}>
          {cat.trabajos.length} trabajos. Las horas son las de mercado por unidad; en software, las equivalentes sin IA (el tipo de tarea pone el multiplicador).
        </p>
      </div>

      {nuevo && abierto === 'nuevo' && (
        <div className={`panel-y ${s.tarjeta}`}>
          <p className="section-label" style={{ margin: 0 }}>Nuevo trabajo tipo</p>
          <Editor inicial={nuevo} cat={cat} onGuardar={guardar} onCancelar={() => { setNuevo(null); setAbierto(null); }} />
        </div>
      )}

      {categorias.map(cat_ => (
        <div key={cat_} className="panel-y">
          <p className="section-label" style={{ margin: 0, padding: '10px 14px', borderBottom: '1px solid var(--border2)' }}>{cat_}</p>
          {filtrados.filter(t => t.categoria === cat_).map(t => {
            const ab = abierto === t.id;
            const ap = t.cargo_apoyo_id ? cargo.get(t.cargo_apoyo_id) : undefined;
            return (
              <div key={t.id} style={{ borderTop: '1px solid var(--border2)', opacity: t.activo ? 1 : 0.55 }}>
                <div className={s.tarjetaCabeza} style={{ padding: '10px 14px' }}>
                  <button type="button" className={s.expandir} onClick={() => setAbierto(ab ? null : t.id)} aria-expanded={ab}>
                    {ab ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    <span className={s.tarjetaTitulo}>
                      <b style={{ fontSize: '0.9rem' }}>{t.nombre}</b>
                      <small>
                        {formatoHoras(t.hh_referencia)} h por {t.unidad || 'unidad'} · {cargo.get(t.cargo_principal_id)?.nombre ?? '—'}
                        {ap ? ` + ${ap.nombre} (${formatoHoras(t.hh_apoyo)} h)` : ''}
                        {t.tipo_tarea_clave ? ` · ${tipo.get(t.tipo_tarea_clave)?.nombre ?? t.tipo_tarea_clave}` : ''}
                      </small>
                    </span>
                  </button>
                  <Interruptor activo={t.activo} etiqueta={`${t.nombre} activo`} onChange={() => activar(t)} />
                </div>
                {ab && (
                  <div style={{ padding: '0 14px 14px' }}>
                    <Editor inicial={t} cat={cat} onGuardar={guardar} onCancelar={() => setAbierto(null)} onBorrar={() => borrar(t)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {categorias.length === 0 && <Vacio>{cat.trabajos.length ? 'Nada con esa búsqueda.' : 'Aún no hay trabajos tipo.'}</Vacio>}
    </div>
  );
}

function Editor({ inicial, cat, onGuardar, onCancelar, onBorrar }: {
  inicial: Borrador; cat: PropsPestana['cat']; onGuardar: (b: Borrador) => Promise<void>; onCancelar: () => void; onBorrar?: () => void;
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
    if (!b.categoria.trim() || !b.nombre.trim()) { warning('Escribe la categoría y el nombre.'); return; }
    if (!b.cargo_principal_id) { warning('Elige el cargo.'); return; }
    setOcupado(true);
    await onGuardar(b);
    setOcupado(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={s.rejilla}>
        <Campo etiqueta="Categoría">
          <input className="input input-sm" list="hh-categorias" value={b.categoria} onChange={e => setB({ ...b, categoria: e.target.value })} />
          <datalist id="hh-categorias">{categorias.map(c => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo etiqueta="Trabajo"><input className="input input-sm" value={b.nombre} onChange={e => setB({ ...b, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Unidad"><input className="input input-sm" {...texto('unidad')} placeholder="punto, proyecto…" /></Campo>
        <Campo etiqueta="Horas de mercado por unidad">
          <NumeroInput className="input input-sm" value={b.hh_referencia} decimales={2} min={0} sufijo="h" onChange={v => setB({ ...b, hh_referencia: v })} mostrarCero ariaLabel="Horas de mercado" />
        </Campo>
        <Campo etiqueta="Cargo que lo hace">
          <select className="input input-sm" value={b.cargo_principal_id} onChange={e => setB({ ...b, cargo_principal_id: e.target.value })}>
            <option value="" disabled>Elige…</option>
            {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de tarea">
          <select className="input input-sm" value={b.tipo_tarea_clave ?? ''} onChange={e => setB({ ...b, tipo_tarea_clave: e.target.value || null })}>
            <option value="">Sin tipo (× 1)</option>
            {cat.tipos.map(t => <option key={t.clave} value={t.clave}>{t.nombre} (× {String(t.multiplicador).replace('.', ',')})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Ayudante">
          <select className="input input-sm" value={b.cargo_apoyo_id ?? ''} onChange={e => setB({ ...b, cargo_apoyo_id: e.target.value || null })}>
            <option value="">Sin ayudante</option>
            {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Horas del ayudante por unidad">
          <NumeroInput className="input input-sm" value={b.hh_apoyo} decimales={2} min={0} sufijo="h" disabled={!b.cargo_apoyo_id} onChange={v => setB({ ...b, hh_apoyo: v })} ariaLabel="Horas del ayudante" />
        </Campo>
        <Campo etiqueta="Precio de mercado (referencia)"><input className="input input-sm" {...texto('precio_mercado_ref')} placeholder="$… (fuente)" /></Campo>
        <Campo etiqueta="Duración / equipo"><input className="input input-sm" {...texto('duracion_equipo')} placeholder="1 técnico, 2 días…" /></Campo>
        <Campo etiqueta="Orden">
          <NumeroInput className="input input-sm" value={b.orden} decimales={0} mostrarCero onChange={v => setB({ ...b, orden: Math.round(v) })} ariaLabel="Orden" />
        </Campo>
      </div>
      <Campo etiqueta="Notas"><input className="input input-sm" {...texto('notas')} /></Campo>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {onBorrar && <button className="btn btn-ghost btn-sm" onClick={onBorrar} style={{ marginRight: 'auto' }}><Trash2 size={13} /> Borrar</button>}
        <button className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={guardar}><Check size={13} /> Guardar</button>
      </div>
    </div>
  );
}
