'use client';

/**
 * Finanzas → Gastos y rendiciones (traído de TecApp).
 * Cada uno registra sus gastos con foto de la boleta; quien aprueba los revisa y
 * marca reembolsados. La rendición es el total aprobado por persona pendiente de pago.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, Loader2, Plus, Receipt, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NumeroInput from '@/components/NumeroInput';
import {
  archivosOT, CATEGORIAS_GASTO, faltaFase2, folioOT, gastosService, otService,
  type CategoriaGasto, type Gasto, type OrdenTrabajo,
} from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';
import type { Vendedor } from '@/types';

const ESTADOS: Record<Gasto['estado'], { nombre: string; color: string }> = {
  pendiente: { nombre: 'Pendiente', color: '#d97706' },
  aprobado: { nombre: 'Aprobado', color: '#2563eb' },
  rechazado: { nombre: 'Rechazado', color: '#dc2626' },
  reembolsado: { nombre: 'Reembolsado', color: '#16a34a' },
};
const categoria = (c: string) => CATEGORIAS_GASTO.find(x => x.clave === c)?.nombre || c;

function NuevoGasto({ ots, otInicial, onClose, onListo }: { ots: OrdenTrabajo[]; otInicial: string; onClose: () => void; onListo: () => void }) {
  const { success, error: toastError } = useToast();
  const [f, setF] = useState({ fecha: fechaLocal(), monto: 0, categoria: 'combustible' as CategoriaGasto, descripcion: '', ot_id: otInicial });
  const [boleta, setBoleta] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const lbl = { display: 'block', marginBottom: 6 } as const;

  const guardar = async () => {
    if (!(f.monto > 0)) { toastError('Ingresa el monto'); return; }
    setGuardando(true);
    try {
      const boleta_path = boleta ? await archivosOT.subir('gastos', boleta) : null;
      await gastosService.crear({ ...f, descripcion: f.descripcion.trim() || null, ot_id: f.ot_id || null, boleta_path });
      success('Gasto registrado'); onListo();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo registrar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><Receipt size={16} /> Nuevo gasto</p>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label-muted" style={lbl}>Monto *</label><NumeroInput className="input" prefijo="$" value={f.monto} onChange={v => setF({ ...f, monto: v })} /></div>
            <div><label className="label-muted" style={lbl}>Fecha</label><input className="input" type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></div>
          </div>
          <div><label className="label-muted" style={lbl}>Categoría</label>
            <select className="input" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value as CategoriaGasto })}>
              {CATEGORIAS_GASTO.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</select></div>
          <div><label className="label-muted" style={lbl}>Detalle</label><input className="input" value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Bencina camioneta, peaje Ruta 68…" /></div>
          <div><label className="label-muted" style={lbl}>OT asociada</label>
            <select className="input" value={f.ot_id} onChange={e => setF({ ...f, ot_id: e.target.value })}>
              <option value="">Sin OT (gasto general)</option>
              {ots.map(o => <option key={o.id} value={o.id}>{folioOT(o.folio)} · {o.titulo}</option>)}
            </select></div>
          <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
            <Camera size={14} /> {boleta ? boleta.name : 'Foto de la boleta'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={e => setBoleta(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={14} className="iv-spin" /> : <Plus size={14} />} Registrar</button>
        </div>
      </div>
    </div>
  );
}

export default function GastosPage() {
  const { perfil, puede, puedeAlguno } = usePermisos();
  const { success, error: toastError } = useToast();
  const verTodos = puedeAlguno(['gastos.ver_todos', 'gastos.aprobar']);
  const aprueba = puede('gastos.aprobar');
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [vista, setVista] = useState<'mios' | 'revisar' | 'todos'>('mios');
  const [persona, setPersona] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [otInicial, setOtInicial] = useState('');
  const [urlBoleta, setUrlBoleta] = useState<string | null>(null);

  useEffect(() => {
    // /gastos?ot=<id> (desde el detalle de una OT) abre el formulario con esa OT.
    const ot = new URLSearchParams(window.location.search).get('ot');
    if (ot) { setOtInicial(ot); setNuevo(true); }
  }, []);
  useEffect(() => { if (aprueba) setVista('revisar'); }, [aprueba]);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    try {
      const [g, e] = await Promise.all([gastosService.listar(verTodos ? null : perfil.id), vendedoresService.mapa()]);
      setGastos(g); setEquipo(e);
      otService.listar().then(o => setOts(o.filter(x => !['cerrada', 'anulada'].includes(x.estado)))).catch(() => {});
    } catch (err) { if (faltaFase2(err)) setFalta(true); else toastError('No se pudieron cargar los gastos: ' + (err instanceof Error ? err.message : '')); }
    finally { setCargando(false); }
  }, [perfil, verTodos, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => gastos
    .filter(g => vista === 'mios' ? g.usuario_id === perfil?.id : vista === 'revisar' ? g.estado === 'pendiente' : true)
    .filter(g => !persona || g.usuario_id === persona), [gastos, vista, persona, perfil]);

  // Rendición: aprobado y aún no reembolsado, por persona.
  const rendicion = useMemo(() => {
    const m: Record<string, number> = {};
    gastos.filter(g => g.estado === 'aprobado').forEach(g => { m[g.usuario_id] = (m[g.usuario_id] || 0) + Number(g.monto); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gastos]);

  const mios = gastos.filter(g => g.usuario_id === perfil?.id);
  const suma = (arr: Gasto[]) => arr.reduce((s, g) => s + Number(g.monto), 0);

  const revisar = async (g: Gasto, estado: Gasto['estado']) => {
    let motivo_rechazo: string | null = null;
    if (estado === 'rechazado') { motivo_rechazo = prompt('¿Por qué se rechaza?')?.trim() || null; if (!motivo_rechazo) return; }
    try { await gastosService.actualizar(g.id, { estado, motivo_rechazo }); success(`Gasto ${ESTADOS[estado].nombre.toLowerCase()}`); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo actualizar'); }
  };

  const reembolsarTodo = async (uid: string) => {
    const ids = gastos.filter(g => g.usuario_id === uid && g.estado === 'aprobado');
    if (!confirm(`¿Marcar como reembolsados ${ids.length} gastos de ${equipo[uid]?.nombre || 'esta persona'} por ${formatCLP(suma(ids))}?`)) return;
    try { for (const g of ids) await gastosService.actualizar(g.id, { estado: 'reembolsado' }); success('Rendición pagada'); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo actualizar'); }
  };

  const eliminar = async (g: Gasto) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    try { await gastosService.eliminar(g.id); if (g.boleta_path) archivosOT.eliminar(g.boleta_path); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo eliminar'); }
  };

  const verBoleta = async (path: string) => {
    const u = await archivosOT.urls([path]);
    if (u[path]) setUrlBoleta(u[path]); else toastError('No se pudo abrir la boleta');
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Gastos y rendiciones" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      {nuevo && <NuevoGasto ots={ots} otInicial={otInicial} onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); cargar(); }} />}
      {urlBoleta && (
        <div className="modal-overlay" onClick={() => setUrlBoleta(null)}>
          <img src={urlBoleta} alt="Boleta" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 8 }} />
        </div>
      )}
      <PageHeader eyebrow="Finanzas" title="Gastos y rendiciones" subtitle="Registra lo que pagaste con la foto de la boleta. Se aprueba y se reembolsa."
        actions={puede('gastos.crear') ? <button className="btn btn-primary" onClick={() => { setOtInicial(''); setNuevo(true); }}><Plus size={14} /> Nuevo gasto</button> : null} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="kpi-card"><p className="label-muted">Mis pendientes</p><p className="kpi-value" style={{ color: '#d97706' }}>{formatCLP(suma(mios.filter(g => g.estado === 'pendiente')))}</p></div>
        <div className="kpi-card"><p className="label-muted">Me deben (aprobado)</p><p className="kpi-value" style={{ color: '#2563eb' }}>{formatCLP(suma(mios.filter(g => g.estado === 'aprobado')))}</p></div>
        {aprueba && <div className="kpi-card"><p className="label-muted">Por revisar</p><p className="kpi-value">{gastos.filter(g => g.estado === 'pendiente').length}</p></div>}
      </div>

      {aprueba && rendicion.length > 0 && (
        <div className="panel-y" style={{ marginBottom: 12 }}>
          <p className="section-label" style={{ margin: 0, padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)' }}>Rendiciones por pagar</p>
          {rendicion.map(([uid, monto]) => (
            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 1rem', borderTop: '1px solid var(--border2)' }}>
              <span style={{ flex: 1, color: 'var(--text)' }}>{equipo[uid]?.nombre || 'Usuario'}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(monto)}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => reembolsarTodo(uid)}><Check size={13} /> Pagado</button>
            </div>
          ))}
        </div>
      )}

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['mios', 'Mis gastos'], ...(aprueba ? [['revisar', 'Por revisar']] : []), ...(verTodos ? [['todos', 'Todos']] : [])] as [typeof vista, string][]).map(([k, t]) => (
              <button key={k} className="btn btn-sm" onClick={() => setVista(k)} style={{ background: vista === k ? 'var(--y-brand)' : 'var(--bg3)', color: vista === k ? '#111' : 'var(--muted)' }}>{t}</button>
            ))}
          </div>
          {verTodos && vista !== 'mios' && (
            <select className="input" style={{ maxWidth: 200 }} value={persona} onChange={e => setPersona(e.target.value)}>
              <option value="">Todas las personas</option>{Object.values(equipo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : lista.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>No hay gastos en esta vista.</p>
          : lista.map(g => (
            <div key={g.id} style={{ display: 'flex', gap: 10, padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{categoria(g.categoria)}{g.descripcion ? ` · ${g.descripcion}` : ''}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {formatDate(g.fecha)}{g.usuario_id !== perfil?.id ? ` · ${equipo[g.usuario_id]?.nombre || ''}` : ''}
                  {g.ot_id ? <> · <Link href={`/ordenes/${g.ot_id}`}>{folioOT(g.ordenes_trabajo?.folio)}</Link></> : null}
                  {g.motivo_rechazo ? ` · ${g.motivo_rechazo}` : ''}
                </span>
              </span>
              {g.boleta_path && <button className="btn btn-ghost btn-sm" onClick={() => verBoleta(g.boleta_path!)}><Camera size={13} /> Boleta</button>}
              <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{formatCLP(Number(g.monto))}</strong>
              <span className="badge" style={{ background: ESTADOS[g.estado].color, color: '#fff', fontSize: '0.7rem' }}>{ESTADOS[g.estado].nombre}</span>
              {aprueba && g.estado === 'pendiente' && <>
                <button className="btn btn-primary btn-sm" onClick={() => revisar(g, 'aprobado')}><Check size={13} /> Aprobar</button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => revisar(g, 'rechazado')}><X size={13} /> Rechazar</button>
              </>}
              {g.usuario_id === perfil?.id && g.estado === 'pendiente' && <button className="btn btn-ghost btn-sm" onClick={() => eliminar(g)} aria-label="Eliminar"><Trash2 size={13} /></button>}
            </div>
          ))}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>{lista.length} gastos · {formatCLP(suma(lista))}</div>
      </div>
    </div>
  );
}
