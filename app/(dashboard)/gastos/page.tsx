'use client';

/**
 * Finanzas → Gastos y anticipos (sin aprobar ni rechazar).
 * Cada uno rinde sus gastos con la foto de la boleta, siempre en un trabajo (cotización
 * aprobada) o un proyecto: el gasto suma al costo real y se compara con lo cotizado. Lo
 * pagado de su bolsillo (sin anticipo) se le reembolsa: quien paga lo marca «Pagado».
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFase } from '@/lib/fases';
import { Camera, Check, Plus, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import NuevoGasto, { type DestinoGasto } from '@/components/gastos/NuevoGasto';
import { trabajosService } from '@/services/trabajos';
import {
  archivosOT, CATEGORIAS_GASTO, faltaFase2, folioOT, gastosService,
  type Gasto,
} from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import Anticipos from '@/components/gastos/Anticipos';
import { anticiposService, folioProyecto, proyectosService, type Anticipo } from '@/services/fase5';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';
import type { Vendedor } from '@/types';

const ESTADOS: Record<Gasto['estado'], { nombre: string; color: string }> = {
  rendido: { nombre: 'Rendido', color: '#2563eb' },
  reembolsado: { nombre: 'Reembolsado', color: '#16a34a' },
  // De antes de la fase 6:
  pendiente: { nombre: 'Rendido', color: '#2563eb' },
  aprobado: { nombre: 'Rendido', color: '#2563eb' },
  rechazado: { nombre: 'Rechazado', color: '#dc2626' },
};
const categoria = (c: string) => CATEGORIAS_GASTO.find(x => x.clave === c)?.nombre || c;
const destinoDe = (g: Gasto) => (g.cotizacion_id ? `cot:${g.cotizacion_id}` : g.proyecto_id ? `proy:${g.proyecto_id}` : g.ot_id ? `ot:${g.ot_id}` : '');
const porPagar = (g: Gasto) => ['rendido', 'aprobado', 'pendiente'].includes(g.estado) && !g.anticipo_id;

export default function GastosPage() {
  const { perfil, puede, puedeAlguno } = usePermisos();
  const fase15 = useFase(15);
  const { success, error: toastError } = useToast();
  const verTodos = puedeAlguno(['gastos.ver_todos', 'gastos.aprobar']);
  const paga = puede('gastos.aprobar');
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [destinos, setDestinos] = useState<DestinoGasto[]>([]);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [vista, setVista] = useState<'mios' | 'todos'>('mios');
  const [persona, setPersona] = useState('');
  const [destinoFiltro, setDestinoFiltro] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [destinoInicial, setDestinoInicial] = useState('');
  const [urlBoleta, setUrlBoleta] = useState<string | null>(null);
  const [anticipos, setAnticipos] = useState<Anticipo[]>([]);

  useEffect(() => {
    // /gastos?cotizacion=<id> o ?proyecto=<id> (desde un trabajo o un proyecto) abre el formulario con ese destino.
    const q = new URLSearchParams(window.location.search);
    const d = q.get('cotizacion') ? `cot:${q.get('cotizacion')}` : q.get('proyecto') ? `proy:${q.get('proyecto')}` : q.get('ot') ? `ot:${q.get('ot')}` : '';
    if (d) { setDestinoInicial(d); setNuevo(true); }
    else if (q.get('nuevo') === '1') { setNuevo(true); window.history.replaceState(null, '', '/gastos'); }
  }, []);
  useEffect(() => { if (paga) setVista('todos'); }, [paga]);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    try {
      const [g, e] = await Promise.all([gastosService.listar(verTodos ? null : perfil.id), vendedoresService.mapa()]);
      setGastos(g); setEquipo(e);
      Promise.all([trabajosService.listar().catch(() => []), proyectosService.listar().catch(() => [])]).then(([t, p]) => setDestinos([
        ...t.map(x => ({ valor: `cot:${x.id}`, etiqueta: `IV-${String(x.folio).padStart(4, '0')} · ${x.titulo || 'Cotización'}${x.clientes?.nombre_cliente ? ` · ${x.clientes.nombre_cliente}` : ''}`, grupo: 'Trabajos' as const })),
        ...p.filter(x => !['terminado', 'cancelado'].includes(x.estado)).map(x => ({ valor: `proy:${x.id}`, etiqueta: `${folioProyecto(x.folio)} · ${x.nombre}`, grupo: 'Proyectos' as const })),
      ]));
      anticiposService.listar(verTodos ? null : perfil.id).then(setAnticipos).catch(() => setAnticipos([]));
    } catch (err) { if (faltaFase2(err)) setFalta(true); else toastError('No se pudieron cargar las rendiciones: ' + (err instanceof Error ? err.message : '')); }
    finally { setCargando(false); }
  }, [perfil, verTodos, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => gastos
    .filter(g => vista === 'mios' ? g.usuario_id === perfil?.id : true)
    .filter(g => !persona || g.usuario_id === persona)
    .filter(g => !destinoFiltro || destinoDe(g) === destinoFiltro), [gastos, vista, persona, destinoFiltro, perfil]);

  // Por pagar: lo rendido de su bolsillo (sin anticipo) que aún no se reembolsa, por persona.
  const rendicion = useMemo(() => {
    const m: Record<string, number> = {};
    gastos.filter(porPagar).forEach(g => { m[g.usuario_id] = (m[g.usuario_id] || 0) + Number(g.monto); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gastos]);

  const mios = gastos.filter(g => g.usuario_id === perfil?.id);
  const suma = (arr: Gasto[]) => arr.reduce((s, g) => s + Number(g.monto), 0);
  const mes = fechaLocal().slice(0, 7);

  const pagar = async (uid: string) => {
    const ids = gastos.filter(g => g.usuario_id === uid && porPagar(g));
    if (!confirm(`¿Marcar como pagados ${ids.length} gastos de ${equipo[uid]?.nombre || 'esta persona'} por ${formatCLP(suma(ids))}?`)) return;
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

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Finanzas" title="Rendiciones" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      {nuevo && <NuevoGasto destinos={destinos} destinoInicial={destinoInicial} anticipos={anticipos.filter(a => a.usuario_id === perfil?.id)}
        onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); cargar(); }} />}
      {urlBoleta && (
        <div className="modal-overlay" onClick={() => setUrlBoleta(null)}>
          <img src={urlBoleta} alt="Boleta" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 8 }} />
        </div>
      )}
      <PageHeader eyebrow="Finanzas" title="Gastos y anticipos" subtitle="Rinde cada gasto con su boleta en el trabajo o el proyecto: suma al costo real y se compara con lo cotizado."
        actions={puede('gastos.crear') ? <button className="btn btn-primary" onClick={() => { setDestinoInicial(''); setNuevo(true); }}><Plus size={14} /> Rendir gasto</button> : null} />
      {fase15 && (puede('compras.gestionar') || puede('compras.ver')) && (
        <p style={{ margin: '-4px 0 12px', fontSize: '0.8rem', color: 'var(--muted)' }}>
          ¿Es una <b>factura</b> de un proveedor (no una boleta)? Ingrésala en <Link href="/compras">Compras a proveedores</Link>: así se recupera el IVA y queda en el libro de compras.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="kpi-card"><p className="label-muted">Rendí este mes</p><p className="kpi-value">{formatCLP(suma(mios.filter(g => g.fecha.startsWith(mes))))}</p></div>
        <div className="kpi-card"><p className="label-muted">Me deben</p><p className="kpi-value" style={{ color: '#2563eb' }}>{formatCLP(suma(mios.filter(porPagar)))}</p></div>
        {paga && <div className="kpi-card"><p className="label-muted">Por pagar a todos</p><p className="kpi-value">{formatCLP(rendicion.reduce((s, [, m]) => s + m, 0))}</p></div>}
      </div>

      <Anticipos anticipos={anticipos} equipo={equipo} destinos={destinos} aprueba={paga} yo={perfil?.id} onCambio={cargar} />

      {paga && rendicion.length > 0 && (
        <div className="panel-y" style={{ marginBottom: 12 }}>
          <p className="section-label" style={{ margin: 0, padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)' }}>Rendiciones por pagar</p>
          {rendicion.map(([uid, monto]) => (
            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 1rem', borderTop: '1px solid var(--border2)' }}>
              <span style={{ flex: 1, color: 'var(--text)' }}>{equipo[uid]?.nombre || 'Usuario'}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(monto)}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => pagar(uid)}><Check size={13} /> Pagado</button>
            </div>
          ))}
        </div>
      )}

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {verTodos && <div style={{ display: 'flex', gap: 4 }}>
            {([['mios', 'Mis rendiciones'], ['todos', 'Todas']] as [typeof vista, string][]).map(([k, t]) => (
              <button key={k} className="btn btn-sm" onClick={() => setVista(k)} style={{ background: vista === k ? 'var(--y-brand)' : 'var(--bg3)', color: vista === k ? '#111' : 'var(--muted)' }}>{t}</button>
            ))}
          </div>}
          {verTodos && vista !== 'mios' && (
            <select className="input" style={{ maxWidth: 200 }} value={persona} onChange={e => setPersona(e.target.value)}>
              <option value="">Todas las personas</option>{Object.values(equipo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          <select className="input" style={{ maxWidth: 300 }} value={destinoFiltro} onChange={e => setDestinoFiltro(e.target.value)}>
            <option value="">Todos los trabajos y proyectos</option>{destinos.map(d => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
          </select>
        </div>
        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 120 }} /></div>
          : lista.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>No hay rendiciones en esta vista.</p>
          : lista.map(g => (
            <div key={g.id} style={{ display: 'flex', gap: 10, padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{categoria(g.categoria)}{g.descripcion ? ` · ${g.descripcion}` : ''}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {formatDate(g.fecha)}{g.usuario_id !== perfil?.id ? ` · ${equipo[g.usuario_id]?.nombre || ''}` : ''}
                  {g.cotizacion_id ? <> · <Link href={`/cotizador?edit=${g.cotizacion_id}`}>IV-{String(g.cotizaciones?.folio ?? '').padStart(4, '0')}</Link></>
                    : g.proyecto_id ? <> · <Link href={`/proyectos/${g.proyecto_id}`}>{folioProyecto(g.proyectos?.folio ?? 0)}</Link></>
                    : g.ot_id ? <> · {folioOT(g.ordenes_trabajo?.folio)}</> : ''}
                  {g.anticipo_id ? ' · contra anticipo' : ''}
                </span>
              </span>
              {g.boleta_path && <button className="btn btn-ghost btn-sm" onClick={() => verBoleta(g.boleta_path!)}><Camera size={13} /> Boleta</button>}
              <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{formatCLP(Number(g.monto))}</strong>
              <span className="badge" style={{ background: ESTADOS[g.estado].color, color: '#fff', fontSize: '0.7rem' }}>{ESTADOS[g.estado].nombre}</span>
              {g.usuario_id === perfil?.id && g.estado === 'rendido' && <button className="btn btn-ghost btn-sm" onClick={() => eliminar(g)} aria-label="Eliminar"><Trash2 size={13} /></button>}
            </div>
          ))}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.78rem' }}>{lista.length} gastos · {formatCLP(suma(lista))}</div>
      </div>
    </div>
  );
}
