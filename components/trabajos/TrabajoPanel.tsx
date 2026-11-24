'use client';

/**
 * El trabajo de una cotización aprobada (fase 7): su estado (por iniciar → en ejecución →
 * terminado), los cobros del plan (cada hito cae solo en «Por facturar» cuando corresponde), los
 * materiales en obra y el acta de entrega. Los costos tienen un solo punto de entrada (fase 22):
 *   · quien ve costos: el «Análisis de proyecto» (presupuesto vs real, materiales, mano de obra,
 *     servicios, operación y flujo de caja; ahí se registran compras, días, horas y gastos);
 *   · el técnico: «Mis horas» y sus gastos rendidos, sin ver costos.
 */

import { entregasService, folioActa, informeDesde, plantillasInformeServicio, type EntregaTrabajo } from '@/services/informes';
import ActaEntrega from '@/components/trabajos/ActaEntrega';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Check, ClipboardCheck, Loader2, Play, Plus, Receipt, RotateCcw } from 'lucide-react';
import NuevoGasto, { type InicialGasto } from '@/components/gastos/NuevoGasto';
import { trabajosService, type ResultadoTrabajo } from '@/services/trabajos';
import { useIniciarTrabajo } from '@/components/trabajos/IniciarTrabajo';
import MaterialesTrabajo from '@/components/trabajos/MaterialesTrabajo';
import MisHoras from '@/components/trabajos/MisHoras';
import { useFase } from '@/lib/fases';
import { anticiposService, type Anticipo } from '@/services/fase5';
import { CATEGORIAS_GASTO, ETAPAS_COBRO, type Gasto, type PorFacturar } from '@/services/operacion';
import { cobroPagado } from '@/lib/cobros';
import { detalleHito, enMonedaExtranjera, hitoActivo } from '@/lib/cotizador/planCobro';
import { indicadoresDelDia } from '@/hooks/useValoresDia';
import { CUANDO_COBRO, estadoTrabajo, type EstadoTrabajo, type HitoCobro } from '@/lib/cotizador/tipos';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate } from '@/utils';

// Se carga solo cuando se muestra (no pesa en el cotizador).
const AnalisisProyecto = dynamic(() => import('@/components/trabajos/AnalisisProyecto'), {
  ssr: false, loading: () => <div className="skeleton" style={{ height: 140 }} />,
});

export function ChipTrabajo({ estado }: { estado?: string | null }) {
  const e = estadoTrabajo(estado);
  return <span className="badge" style={{ background: e.color + '1f', color: e.color, fontWeight: 700 }}>{e.nombre}</span>;
}

/** Margen sobre la venta neta, en %. */
export const margenPct = (venta: number, costo: number) => (venta > 0 ? ((venta - costo) / venta) * 100 : null);

export default function TrabajoPanel({ cot, plan, onCambio, cliente, responsable }: {
  cot: { id: string; folio: number; titulo: string; total: number; trabajo_estado?: EstadoTrabajo | null; trabajo_inicio?: string | null; trabajo_termino?: string | null;
    /** Fase 15: por qué se partió sin el anticipo pagado. */
    inicio_sin_anticipo?: string | null };
  plan: HitoCobro[];
  onCambio: () => void;
  /** Para el acta de entrega y su PDF. */
  cliente?: { nombre: string; rut?: string | null; direccion?: string | null };
  responsable?: string | null;
}) {
  const { perfil, puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const [cobros, setCobros] = useState<PorFacturar[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [res, setRes] = useState<ResultadoTrabajo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rindiendo, setRindiendo] = useState<{ inicial?: InicialGasto } | null>(null);
  const [misAnticipos, setMisAnticipos] = useState<Anticipo[]>([]);
  const verCostos = puede('cotizaciones.ver_costos');
  const mueve = puede('cotizaciones.crear');
  const estado = cot.trabajo_estado || 'por_iniciar';

  // Fase 8: actas de entrega (al firmar una, el trabajo queda terminado).
  const [actas, setActas] = useState<EntregaTrabajo[]>([]);
  const [actaAbierta, setActaAbierta] = useState<EntregaTrabajo | null>(null);
  const nuevaActa = async () => {
    try {
      const plantillas = await plantillasInformeServicio.listar({ tipo: 'entrega' }).catch(() => []);
      setActaAbierta(await entregasService.crear(cot.id, informeDesde(plantillas.length === 1 ? plantillas[0] : null)));
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo crear el acta'); }
  };
  // Cambia cada vez que se registra algo (el análisis vuelve a leer).
  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => {
    setVersion(v => v + 1);
    trabajosService.cobros(cot.id).then(setCobros);
    trabajosService.gastos({ cotizacionId: cot.id }).then(setGastos);
    trabajosService.resultado(cot.id).then(setRes);
    entregasService.deCotizacion(cot.id).then(setActas);
  }, [cot.id]);
  useEffect(() => { cargar(); }, [cargar]);
  // Fase 15: iniciar pide el motivo si el anticipo no está pagado; materiales.
  const fase15 = useFase(15);
  const { iniciar, modal: modalAnticipo, ocupado: iniciando } = useIniciarTrabajo(() => { onCambio(); cargar(); });

  const rendirGasto = (inicial?: InicialGasto) => {
    if (perfil) anticiposService.listar(perfil.id).then(setMisAnticipos).catch(() => setMisAnticipos([]));
    setRindiendo({ inicial });
  };

  const mover = async (e: EstadoTrabajo) => {
    if (e === 'terminado' && !confirm('¿Marcar el trabajo como terminado? Los cobros «al terminar» pasan a Por facturar.')) return;
    setOcupado(true);
    if (e === 'terminado' && plan.some(h => h.cuando === 'terminar' && enMonedaExtranjera(h))) await indicadoresDelDia(true);
    try { await trabajosService.cambiarEstado(cot.id, e); success(`Trabajo: ${estadoTrabajo(e).nombre.toLowerCase()}`); onCambio(); cargar(); }
    catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); }
    finally { setOcupado(false); }
  };

  // Hitos del plan que aún no caen en «Por facturar» (los «al terminar» antes de terminar).
  const pendientes = plan.filter(h => hitoActivo(h) && !cobros.some(c => c.hito === h.nombre));
  const cobrado = cobros.reduce((s, c) => s + Number(c.monto_pagado || 0), 0);
  const gastado = gastos.filter(g => g.estado !== 'rechazado').reduce((s, g) => s + Number(g.monto || 0), 0);

  return (
    <section className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14, borderLeft: `4px solid ${estadoTrabajo(estado).color}` }}>
      {modalAnticipo}
      {actaAbierta && <ActaEntrega cot={{ id: cot.id, folio: cot.folio, titulo: cot.titulo, cliente }} acta={actaAbierta} responsable={responsable || null}
        onCerrar={() => setActaAbierta(null)} onCambio={() => { cargar(); onCambio(); }} />}
      {rindiendo && <NuevoGasto destinos={[{ valor: `cot:${cot.id}`, etiqueta: `IV-${String(cot.folio).padStart(4, '0')} · ${cot.titulo}`, grupo: 'Trabajos' }]}
        destinoInicial={`cot:${cot.id}`} anticipos={misAnticipos} inicial={rindiendo.inicial}
        onClose={() => setRindiendo(null)} onListo={() => { setRindiendo(null); cargar(); }} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0 }}><ClipboardCheck size={15} /> Trabajo</p>
        <ChipTrabajo estado={estado} />
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {cot.trabajo_inicio ? `inició ${formatDate(cot.trabajo_inicio)}` : ''}{cot.trabajo_termino ? ` · terminó ${formatDate(cot.trabajo_termino)}` : ''}</span>
        <span style={{ flex: 1 }} />
        {mueve && estado === 'por_iniciar' && <button className="btn btn-primary btn-sm" disabled={ocupado || !!iniciando} onClick={() => iniciar(cot)}><Play size={13} /> Iniciar</button>}
        {mueve && estado === 'en_ejecucion' && <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => mover('terminado')}><Check size={13} /> Marcar terminado</button>}
        {mueve && estado === 'terminado' && <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => mover('en_ejecucion')}><RotateCcw size={13} /> Volver a ejecución</button>}
        {(ocupado || iniciando) && <Loader2 size={14} className="iv-spin" />}
      </div>
      {cot.inicio_sin_anticipo && (
        <p style={{ margin: '-6px 0 0', fontSize: '0.8rem', color: 'var(--y)' }}>Partió sin el anticipo pagado: {cot.inicio_sin_anticipo}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
        {/* Cobros */}
        <div>
          <p className="label-muted" style={{ marginBottom: 6 }}>Cobros · {formatCLP(cobrado)} cobrado de {formatCLP(cot.total)}</p>
          {cobros.map(c => {
            const e = ETAPAS_COBRO.find(x => x.clave === c.etapa);
            const pagado = cobroPagado(c);
            return (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' }}>
                <span style={{ flex: 1 }}>{c.hito || 'Cobro'}{c.moneda && c.monto_moneda ? ` · ${detalleHito({ nombre: '', porcentaje: 0, cuando: 'aprobar', tipo: c.moneda, valor: Number(c.monto_moneda) })}` : c.porcentaje ? ` · ${String(c.porcentaje).replace('.', ',')} %` : ''}{c.numero_factura ? <span style={{ color: 'var(--muted)' }}> · fact. {c.numero_factura}</span> : null}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(c.monto))}</b>
                <span className="badge" style={{ background: (pagado ? '#16a34a' : e?.color || '#64748b') + '1f', color: pagado ? '#16a34a' : e?.color, fontSize: '0.7rem' }}>{pagado ? 'Pagado' : e?.nombre}</span>
              </div>
            );
          })}
          {pendientes.map(h => (
            <div key={h.nombre} style={{ display: 'flex', gap: 8, fontSize: '0.84rem', padding: '0.35rem 0', borderBottom: '1px dashed var(--border2)', color: 'var(--muted)' }}>
              <span style={{ flex: 1 }}>{h.nombre} · {detalleHito(h)}</span><span>{CUANDO_COBRO[h.cuando]}</span>
            </div>
          ))}
          {puede('facturacion.ver') && <Link href="/facturacion" style={{ fontSize: '0.8rem' }}>Ir a facturación y cobranza</Link>}
        </div>

        {/* Gastos rendidos (quien ve costos los tiene en el análisis, en «Operación»). */}
        {!verCostos && <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <p className="label-muted" style={{ margin: 0, flex: 1 }}>Gastos rendidos · {formatCLP(gastado)}</p>
            {puede('gastos.crear') && <button className="btn btn-ghost btn-xs" onClick={() => rendirGasto()}><Plus size={12} /> Rendir gasto</button>}
          </div>
          {gastos.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Sin gastos todavía. Rinde aquí lo que se compra o se paga para este trabajo.</p>
            : gastos.map(g => (
              <div key={g.id} style={{ display: 'flex', gap: 8, fontSize: '0.84rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border2)', color: 'var(--text)' }}>
                <Receipt size={13} style={{ marginTop: 3, color: 'var(--muted)' }} />
                <span style={{ flex: 1 }}>{CATEGORIAS_GASTO.find(c => c.clave === g.categoria)?.nombre}{g.descripcion ? ` · ${g.descripcion}` : ''} <span style={{ color: 'var(--muted)' }}>· {formatDate(g.fecha)}</span></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(g.monto))}</span>
              </div>
            ))}
          {fase15 && puede('compras.ver') && (
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              <Link href={`/compras?trabajo=${cot.id}`}>{puede('compras.gestionar') ? 'Ingresar o ver las facturas del trabajo' : 'Ver las facturas del trabajo'}</Link></p>
          )}
        </div>}
      </div>

      {fase15 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
          {!verCostos && <MisHoras cotId={cot.id} />}
          <MaterialesTrabajo cotId={cot.id} editable={mueve || puede('gastos.crear') || puede('agenda.gestionar')} />
        </div>
      )}

      {/* Actas de entrega */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
          <p className="label-muted" style={{ margin: 0, flex: 1 }}>Acta de entrega (recepción conforme del cliente)</p>
          {mueve && estado !== 'por_iniciar' && <button className="btn btn-ghost btn-xs" onClick={nuevaActa}><Plus size={12} /> Nueva acta</button>}
        </div>
        {actas.length === 0
          ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>{estado === 'por_iniciar' ? 'Al iniciar el trabajo podrás hacer el acta.' : 'Al terminar, haz el acta con la firma del cliente: el trabajo queda terminado solo.'}</p>
          : actas.map(a => (
            <button key={a.id} type="button" onClick={() => setActaAbierta(a)}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', padding: '0.4rem 0', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', cursor: 'pointer', textAlign: 'left', fontSize: '0.86rem', color: 'var(--text)' }}>
              <b>{folioActa(a.folio)}</b>
              <span style={{ flex: 1, color: 'var(--muted)' }}>{a.plantilla_nombre || 'Sin plantilla'}{a.trabajos ? ` · ${a.trabajos.slice(0, 60)}` : ''}</span>
              <span className="badge" style={{ background: a.estado === 'firmado' ? 'var(--success-soft)' : 'var(--y-soft)', color: a.estado === 'firmado' ? 'var(--success)' : 'var(--text)', fontSize: '0.7rem' }}>
                {a.estado === 'firmado' ? `Firmada ${formatDate(a.firmado_at)}` : 'Borrador'}</span>
            </button>
          ))}
      </div>

      {/* Análisis de proyecto: el único lugar de los costos del trabajo */}
      {verCostos && (
        <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 12 }}>
          <AnalisisProyecto cotId={cot.id} folio={cot.folio} plan={plan} resultado={res} version={version}
            editaPresupuesto={mueve || puede('gastos.aprobar')} editaFlujo={mueve} registraOtros={mueve || puede('gastos.aprobar')}
            puedeComprar={puede('compras.gestionar')} onRendirGasto={puede('gastos.crear') ? rendirGasto : undefined} onCambio={cargar} />
        </div>
      )}
    </section>
  );
}
