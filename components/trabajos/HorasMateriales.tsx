'use client';

/**
 * Horas y materiales de un trabajo (fase 15).
 * - Horas: quién trabajó, cuánto y cuándo; su costo (el de la persona o el general de los
 *   ajustes) suma al costo real del trabajo.
 * - Materiales: se arman solos con las líneas de material de la cotización, para seguir qué
 *   está por comprar, comprado, en obra o instalado, y lo que sobró.
 */

import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, Package, Plus, Trash2 } from 'lucide-react';
import {
  ESTADOS_MATERIAL, trabajosService, type EstadoMaterial, type HoraTrabajo, type MaterialTrabajo,
} from '@/services/trabajos';
import { vendedoresService } from '@/services/vendedores';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' };

export function HorasTrabajo({ cotId, verCostos, onCambio }: { cotId: string; verCostos: boolean; onCambio: () => void }) {
  const { perfil, puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<HoraTrabajo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fechaLocal());
  const [horas, setHoras] = useState('');
  const [nota, setNota] = useState('');
  const [usuario, setUsuario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const todos = puede('gastos.aprobar');
  const registra = todos || puede('gastos.crear') || puede('agenda.gestionar') || puede('cotizaciones.crear');

  const cargar = useCallback(() => { trabajosService.horas(cotId).then(setLista); }, [cotId]);
  useEffect(() => {
    cargar();
    vendedoresService.mapa().then(m => setNombres(Object.fromEntries(Object.entries(m).filter(([, v]) => v.activo !== false).map(([k, v]) => [k, v.nombre]))));
  }, [cargar]);

  const guardar = async () => {
    const h = Number(horas.replace(',', '.'));
    if (!(h > 0 && h <= 24)) { toastError('Indica las horas trabajadas (entre 0,25 y 24).'); return; }
    setGuardando(true);
    try {
      await trabajosService.registrarHoras({ cotizacion_id: cotId, fecha, horas: h, nota, ...(todos && usuario ? { usuario_id: usuario } : {}) });
      success('Horas registradas');
      setHoras(''); setNota(''); setAbierto(false);
      cargar(); onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudieron registrar las horas'); }
    finally { setGuardando(false); }
  };
  const borrar = async (h: HoraTrabajo) => {
    if (!confirm(`¿Quitar ${num(Number(h.horas))} h del ${formatDate(h.fecha)}?`)) return;
    try { await trabajosService.eliminarHoras(h.id); cargar(); onCambio(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo quitar'); }
  };

  const total = lista.reduce((s, h) => s + Number(h.horas), 0);
  const costo = lista.reduce((s, h) => s + Number(h.horas) * Number(h.costo_hora), 0);
  const sinCosto = lista.some(h => !Number(h.costo_hora));
  const semana = Date.now() - 7 * 864e5;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <p className="label-muted" style={{ margin: 0, flex: 1 }}>Horas · {num(total)} h{verCostos && costo > 0 ? ` · ${formatCLP(costo)}` : ''}</p>
        {registra && !abierto && <button className="btn btn-ghost btn-xs" onClick={() => setAbierto(true)}><Plus size={12} /> Registrar horas</button>}
      </div>
      {abierto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 8, padding: '0.6rem', background: 'var(--bg3)', borderRadius: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Fecha</span>
            <input className="input" type="date" value={fecha} max={fechaLocal()} onChange={e => setFecha(e.target.value)} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Horas</span>
            <input className="input" inputMode="decimal" autoFocus value={horas} onChange={e => setHoras(e.target.value)} placeholder="4,5"
              onKeyDown={e => { if (e.key === 'Enter') guardar(); }} /></label>
          {todos && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="label-muted">Quién</span>
              <select className="input" value={usuario} onChange={e => setUsuario(e.target.value)}>
                <option value="">Yo</option>
                {Object.entries(nombres).filter(([id]) => id !== perfil?.id).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select></label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: '1 / -1' }}><span className="label-muted">Qué se hizo (opcional)</span>
            <input className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Canalización piso 2, cableado tablero…"
              onKeyDown={e => { if (e.key === 'Enter') guardar(); }} /></label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', gridColumn: '1 / -1' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAbierto(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={13} className="iv-spin" /> : <Clock size={13} />} Guardar</button>
          </div>
        </div>
      )}
      {lista.length === 0
        ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Sin horas todavía. Registrarlas muestra cuánto costó de verdad el trabajo.</p>
        : lista.map(h => (
          <div key={h.id} style={fila}>
            <Clock size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{nombres[h.usuario_id] || 'Usuario'} <span style={{ color: 'var(--muted)' }}>· {formatDate(h.fecha)}{h.nota ? ` · ${h.nota}` : ''}</span></span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{num(Number(h.horas))} h</b>
            {verCostos && <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>{formatCLP(Number(h.horas) * Number(h.costo_hora))}</span>}
            {(todos || (h.usuario_id === perfil?.id && new Date(h.created_at).getTime() > semana)) &&
              <button className="btn btn-ghost btn-xs" onClick={() => borrar(h)} aria-label="Quitar horas"><Trash2 size={12} /></button>}
          </div>
        ))}
      {verCostos && sinCosto && <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--y)' }}>Hay horas sin costo: fija el costo por hora en Usuarios o en los ajustes del cotizador.</p>}
    </div>
  );
}

export function MaterialesTrabajo({ cotId, editable }: { cotId: string; editable: boolean }) {
  const { error: toastError } = useToast();
  const [lista, setLista] = useState<MaterialTrabajo[] | null>(null);
  const [todos, setTodos] = useState(false);
  useEffect(() => { trabajosService.materiales(cotId).then(setLista); }, [cotId]);

  const cambiar = async (m: MaterialTrabajo, patch: Partial<Pick<MaterialTrabajo, 'estado' | 'sobrante'>>) => {
    setLista(x => (x || []).map(y => (y.id === m.id ? { ...y, ...patch } : y)));
    try { await trabajosService.actualizarMaterial(m.id, patch); }
    catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo guardar');
      trabajosService.materiales(cotId).then(setLista);
    }
  };

  if (lista === null) return <div className="skeleton" style={{ height: 60 }} />;
  const instalados = lista.filter(m => m.estado === 'instalado').length;
  const porComprar = lista.filter(m => m.estado === 'pendiente').length;
  const visibles = todos ? lista : lista.slice(0, 8);

  return (
    <div>
      <p className="label-muted" style={{ margin: '0 0 6px' }}>
        Materiales · {instalados} de {lista.length} instalados{porComprar ? ` · ${porComprar} por comprar` : ''}</p>
      {lista.length === 0
        ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>La cotización no tiene líneas de material.</p>
        : visibles.map(m => {
          const e = ESTADOS_MATERIAL.find(x => x.clave === m.estado) || ESTADOS_MATERIAL[0];
          return (
            <div key={m.id} style={{ ...fila, flexWrap: 'wrap' }}>
              <Package size={13} style={{ color: e.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 160 }}>{m.descripcion} <span style={{ color: 'var(--muted)' }}>· {num(Number(m.cantidad))} {m.unidad || ''}</span></span>
              {m.estado === 'instalado' && editable && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: 'var(--muted)' }}>sobró
                  <input className="input" inputMode="decimal" defaultValue={m.sobrante ?? ''} style={{ width: 64, padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                    onBlur={ev => {
                      const v = ev.target.value.trim() === '' ? null : Number(ev.target.value.replace(',', '.'));
                      if (v !== m.sobrante && (v === null || Number.isFinite(v))) cambiar(m, { sobrante: v });
                    }} /></label>
              )}
              {editable
                ? <select className="input" value={m.estado} onChange={ev => cambiar(m, { estado: ev.target.value as EstadoMaterial })}
                    aria-label={`Estado de ${m.descripcion}`} style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.78rem', color: e.color, fontWeight: 600 }}>
                    {ESTADOS_MATERIAL.map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
                  </select>
                : <span className="badge" style={{ background: e.color + '1f', color: e.color, fontSize: '0.7rem' }}>{e.nombre}</span>}
            </div>
          );
        })}
      {lista.length > 8 && <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }} onClick={() => setTodos(x => !x)}>{todos ? 'Ver menos' : `Ver los ${lista.length}`}</button>}
    </div>
  );
}
