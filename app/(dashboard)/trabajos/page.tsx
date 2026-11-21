'use client';

/**
 * Seguimiento → Trabajos (fase 7): cada cotización aprobada es un trabajo. Aquí se ven todos,
 * por estado (por iniciar, en ejecución, terminados), con lo cobrado y, para quien ve costos, el
 * tablero de presupuesto vs real: lo cotizado contra lo gastado (gastos, compras y mano de obra) de
 * cada trabajo con su semáforo, y el margen proyectado. Iniciar y terminar se hace desde aquí o
 * desde la cotización; el detalle por partida está en el control de proyecto de cada trabajo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Play, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import { ChipTrabajo, margenPct } from '@/components/trabajos/TrabajoPanel';
import { ChipEstado } from '@/components/trabajos/ControlPresupuesto';
import { estadoControl } from '@/lib/controlProyecto';
import { costoReal, faltaFase7, trabajosService, type Trabajo } from '@/services/trabajos';
import { useIniciarTrabajo } from '@/components/trabajos/IniciarTrabajo';
import { ESTADOS_TRABAJO, type EstadoTrabajo } from '@/lib/cotizador/tipos';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate, formatFolio } from '@/utils';

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')} %`);
const estadoDe = (t: Trabajo) => estadoControl(Number(t.resultado?.costo_cotizado || 0), costoReal(t.resultado));
/** Un trabajo activo que ya gastó el 90 % de lo cotizado (o más, o sin presupuesto). */
const enAlerta = (t: Trabajo) => t.trabajo_estado !== 'terminado' && estadoDe(t) !== 'ok';

export default function TrabajosPage() {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<Trabajo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [filtro, setFiltro] = useState<'activos' | EstadoTrabajo | 'todos' | 'alertas'>('activos');
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const verCostos = puede('cotizaciones.ver_costos');
  const mueve = puede('cotizaciones.crear');

  const cargar = useCallback(async () => {
    try { setLista(await trabajosService.listar()); }
    catch (e) { if (faltaFase7(e)) setFalta(true); else toastError('No se pudieron cargar los trabajos: ' + (e instanceof Error ? e.message : '')); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);
  // Iniciar pide el motivo si el anticipo no está pagado (fase 15).
  const { iniciar, modal: modalAnticipo, ocupado: iniciando } = useIniciarTrabajo(cargar);

  const mover = async (t: Trabajo, e: EstadoTrabajo) => {
    if (e === 'terminado' && !confirm(`¿Marcar IV-${String(t.folio).padStart(4, '0')} como terminado? Los cobros «al terminar» pasan a Por facturar.`)) return;
    setOcupado(t.id);
    try { await trabajosService.cambiarEstado(t.id, e); success('Trabajo actualizado'); await cargar(); }
    catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); }
    finally { setOcupado(null); }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista
      .filter(t => filtro === 'todos' ? true : filtro === 'activos' ? t.trabajo_estado !== 'terminado'
        : filtro === 'alertas' ? enAlerta(t) : (t.trabajo_estado || 'por_iniciar') === filtro)
      .filter(t => !q || `${formatFolio(t.folio)} ${t.titulo || ''} ${t.clientes?.nombre_cliente || ''}`.toLowerCase().includes(q));
  }, [lista, filtro, busca]);

  const cuenta = (e: EstadoTrabajo) => lista.filter(t => (t.trabajo_estado || 'por_iniciar') === e).length;
  // Tablero presupuesto vs real (los trabajos activos): lo proyectado es el mayor entre lo cotizado y lo real.
  const activos = lista.filter(t => t.trabajo_estado !== 'terminado');
  const cotizadoAct = activos.reduce((s, t) => s + Number(t.resultado?.costo_cotizado || 0), 0);
  const realAct = activos.reduce((s, t) => s + costoReal(t.resultado), 0);
  const ventaAct = activos.reduce((s, t) => s + Number(t.resultado?.venta_neta || 0), 0);
  const proyectadoAct = activos.reduce((s, t) => s + Math.max(Number(t.resultado?.costo_cotizado || 0), costoReal(t.resultado)), 0);
  const alertas = lista.filter(enAlerta).length;
  const porCobrar = lista.reduce((s, t) => s + Math.max(0, Number(t.total_clp ?? t.total ?? 0) - Number(t.resultado?.cobrado || 0)), 0);
  // El margen de todos se calcula solo con los trabajos que ya tienen costos cargados
  // (sin costos, el margen saldría 100 % y engaña).
  const conCostos = lista.filter(t => costoReal(t.resultado) > 0);
  const ventaTot = conCostos.reduce((s, t) => s + Number(t.resultado?.venta_neta || 0), 0);
  const gastosTot = conCostos.reduce((s, t) => s + costoReal(t.resultado), 0);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Seguimiento" title="Trabajos" /><FaltaSQL archivo="supabase_fase7_flujo.sql" /></div>;

  return (
    <div className="anim-in">
      {modalAnticipo}
      <PageHeader eyebrow="Seguimiento" title="Trabajos"
        subtitle="Cada cotización aprobada es un trabajo: síguelo hasta terminarlo y cobrarlo, con sus gastos reales." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8, marginBottom: 12 }}>
        {ESTADOS_TRABAJO.map(e => (
          <button key={e.clave} type="button" className="kpi-card" onClick={() => setFiltro(e.clave)} style={{ textAlign: 'left', cursor: 'pointer', borderColor: filtro === e.clave ? e.color : undefined }}>
            <p className="label-muted">{e.nombre}</p><p className="kpi-value" style={{ color: e.color }}>{cuenta(e.clave)}</p>
          </button>
        ))}
        <div className="kpi-card"><p className="label-muted">Por cobrar</p><p className="kpi-value">{formatCLP(porCobrar)}</p></div>
        {verCostos && <div className="kpi-card" title="Solo los trabajos con gastos, compras o mano de obra cargados"><p className="label-muted">Margen real ({conCostos.length} con costos)</p><p className="kpi-value">{pct(margenPct(ventaTot, gastosTot))}</p></div>}
      </div>

      {verCostos && activos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8, marginBottom: 12 }}>
          <div className="kpi-card"><p className="label-muted">Presupuesto de los activos</p><p className="kpi-value">{formatCLP(cotizadoAct)}</p></div>
          <div className="kpi-card"><p className="label-muted">Gastado real</p>
            <p className="kpi-value" style={{ color: realAct > cotizadoAct && cotizadoAct > 0 ? 'var(--danger)' : undefined }}>{formatCLP(realAct)}</p>
            <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{cotizadoAct > 0 ? `${pct((realAct / cotizadoAct) * 100)} de lo cotizado` : ''}</span></div>
          <div className="kpi-card" title="Venta neta − el mayor entre lo cotizado y lo real de cada trabajo"><p className="label-muted">Margen proyectado</p>
            <p className="kpi-value" style={{ color: ventaAct - proyectadoAct < 0 ? 'var(--danger)' : 'var(--success)' }}>{pct(margenPct(ventaAct, proyectadoAct))}</p>
            <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{formatCLP(ventaAct - proyectadoAct)}</span></div>
          <button type="button" className="kpi-card" onClick={() => setFiltro('alertas')} disabled={!alertas}
            style={{ textAlign: 'left', cursor: alertas ? 'pointer' : 'default', borderColor: filtro === 'alertas' ? 'var(--danger)' : undefined }}>
            <p className="label-muted">Con alertas</p><p className="kpi-value" style={{ color: alertas ? 'var(--danger)' : 'var(--success)' }}>{alertas}</p>
            <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>desde el 90 % de lo cotizado</span></button>
        </div>
      )}

      <div className="panel-y">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {([['activos', 'Activos'], ...ESTADOS_TRABAJO.map(e => [e.clave, e.nombre]), ['todos', 'Todos'], ...(verCostos ? [['alertas', 'Con alertas']] : [])] as [typeof filtro, string][]).map(([k, t]) => (
              <button key={k} className="btn btn-sm" onClick={() => setFiltro(k)} style={{ background: filtro === k ? 'var(--y-brand)' : 'var(--bg3)', color: filtro === k ? '#111' : 'var(--muted)' }}>{t}</button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: '2rem' }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por N°, título o cliente…" />
          </div>
        </div>

        {cargando ? <div style={{ padding: '1.5rem' }}><div className="skeleton" style={{ height: 160 }} /></div>
          : filtrados.length === 0 ? <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>
              {lista.length ? 'No hay trabajos en esta vista.' : 'Aún no hay cotizaciones aprobadas. Cuando el cliente apruebe una, aparece aquí como trabajo.'}</p>
          : filtrados.map(t => {
            const r = t.resultado;
            const total = Number(t.total_clp ?? t.total ?? 0);
            const cobrado = Number(r?.cobrado || 0);
            const venta = Number(r?.venta_neta || 0), cotizado = Number(r?.costo_cotizado || 0), real = costoReal(r);
            const estado = t.trabajo_estado || 'por_iniciar';
            return (
              <div key={t.id} style={{ display: 'flex', gap: 12, padding: '0.85rem 1rem', borderTop: '1px solid var(--border2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href={`/cotizador?edit=${t.id}`} style={{ flex: 1, minWidth: 240, textDecoration: 'none' }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ color: 'var(--text)' }}>{formatFolio(t.folio)}</b><ChipTrabajo estado={estado} />
                  </span>
                  <span style={{ display: 'block', color: 'var(--text)', fontSize: '0.9rem', marginTop: 2 }}>{t.titulo || 'Cotización'}</span>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.78rem' }}>
                    {t.clientes?.nombre_cliente || 'Sin cliente'}{t.aceptada_at ? ` · aprobada ${formatDate(t.aceptada_at)}` : ''}
                    {t.trabajo_inicio ? ` · inició ${formatDate(t.trabajo_inicio)}` : ''}{t.trabajo_termino ? ` · terminó ${formatDate(t.trabajo_termino)}` : ''}
                  </span>
                </Link>
                <span style={{ minWidth: 150, fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <span style={{ display: 'block', color: 'var(--text)', fontWeight: 700, fontSize: '0.92rem', fontVariantNumeric: 'tabular-nums' }}>{formatCLP(total)}</span>
                  cobrado {formatCLP(cobrado)}
                  <span style={{ display: 'block', height: 4, background: 'var(--bg3)', borderRadius: 4, marginTop: 4 }}>
                    <span style={{ display: 'block', height: 4, width: `${total > 0 ? Math.min(100, (cobrado / total) * 100) : 0}%`, background: 'var(--success)', borderRadius: 4 }} />
                  </span>
                </span>
                {verCostos && (
                  <span style={{ minWidth: 190, fontSize: '0.8rem', color: 'var(--muted)' }}
                    title={`Margen sobre la venta neta. Costo real = gastos ${formatCLP(Number(r?.gastos || 0))} + compras ${formatCLP(Number(r?.compras || 0))} + mano de obra ${formatCLP(Number(r?.mano_obra || 0) + Number(r?.costo_horas || 0))}`}>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      gastado {formatCLP(real)}{cotizado > 0 ? ` de ${formatCLP(cotizado)}` : ''}{estadoDe(t) !== 'ok' && <ChipEstado estado={estadoDe(t)} />}
                    </span>
                    {cotizado > 0 && (
                      <span style={{ display: 'block', height: 4, background: 'var(--bg3)', borderRadius: 4, margin: '4px 0 2px' }}>
                        <span style={{ display: 'block', height: 4, width: `${Math.min(100, (real / cotizado) * 100)}%`, borderRadius: 4,
                          background: estadoDe(t) === 'ok' ? 'var(--success)' : estadoDe(t) === 'alerta' ? 'var(--y-brand)' : 'var(--danger)' }} />
                      </span>
                    )}
                    {real > 0
                      ? <span style={{ display: 'block', color: real > cotizado && cotizado > 0 ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>
                          margen {pct(margenPct(venta, real))} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(cotizado {pct(margenPct(venta, cotizado))})</span>
                        </span>
                      : <span style={{ display: 'block', color: estado === 'por_iniciar' ? 'var(--muted)' : 'var(--y)' }}>
                          sin costos cargados <span style={{ color: 'var(--muted)' }}>(cotizado {pct(margenPct(venta, cotizado))})</span>
                        </span>}
                  </span>
                )}
                {mueve && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    {estado === 'por_iniciar' && <button className="btn btn-ghost btn-sm" disabled={ocupado === t.id || iniciando === t.id} onClick={() => iniciar(t)}><Play size={13} /> Iniciar</button>}
                    {estado === 'en_ejecucion' && <button className="btn btn-ghost btn-sm" disabled={ocupado === t.id} onClick={() => mover(t, 'terminado')}><Check size={13} /> Terminar</button>}
                    {(ocupado === t.id || iniciando === t.id) && <Loader2 size={14} className="iv-spin" />}
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
