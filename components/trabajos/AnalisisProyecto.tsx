'use client';

/**
 * Análisis de proyecto (fase 22): el control de costos de un trabajo en una sola pantalla, dentro
 * del panel del trabajo y solo para quien ve costos.
 *   · Arriba: para gastar (el presupuesto de ejecución), gastado, queda y margen proyectado.
 *   · Pestañas: Resumen (partidas × tipos de costo y «Para mirar») · Materiales (cotizado, comprado,
 *     pendiente; «Registrar compra (IA)») · Mano de obra (por día) · Servicios (por hora) ·
 *     Operación · Flujo de caja.
 *   · La primera vez, el presupuesto se arma solo copiando la cotización.
 *   · «Editar presupuesto»: cada pestaña edita su tabla; el «queda» se recalcula mientras se
 *     escribe y una barra fija guarda o descarta.
 *   · Exportar: Excel con el análisis, el presupuesto, el control por partida, el flujo y los movimientos.
 * Las cuentas: lib/analisisProyecto.ts y lib/controlProyecto.ts; los datos: services/controlProyecto.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, Download, Loader2, Pencil, RotateCcw, Save, X } from 'lucide-react';
import {
  control, cuadre, flujoSemanal, hojasControl, inicioPorDefecto, kpis, movimientos, nombreArchivoControl, normalizarPlan,
  opcionesDePartida, planPorDefecto, presupuesto, type FlujoPlan, type ManoObraCP, type TipoCosto,
} from '@/lib/controlProyecto';
import { analizar, hojasAnalisis, type LineaEntrada } from '@/lib/analisisProyecto';
import { ejecucionDe, totalLinea } from '@/lib/anteproyecto';
import { RETENCION_HONORARIOS } from '@/lib/manoObra';
import { controlProyectoService, type DatosControl } from '@/services/controlProyecto';
import { anteproyectoService } from '@/services/anteproyecto';
import { manoObraService, type TrabajadorElegible } from '@/services/manoObra';
import type { ResultadoTrabajo } from '@/services/trabajos';
import { CATEGORIAS_GASTO } from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import type { InicialGasto } from '@/components/gastos/NuevoGasto';
import Resumen from '@/components/trabajos/analisis/Resumen';
import Materiales from '@/components/trabajos/analisis/Materiales';
import Personas from '@/components/trabajos/analisis/Personas';
import Operacion from '@/components/trabajos/analisis/Operacion';
import { pct, Queda } from '@/components/trabajos/analisis/comun';
import type { EdicionPresupuesto } from '@/components/trabajos/analisis/tipos';
import { descargarExcel } from '@/lib/excel';
import type { HitoCobro } from '@/lib/cotizador/tipos';
import { enMonedaExtranjera } from '@/lib/cotizador/planCobro';
import { indicadoresDelDia } from '@/hooks/useValoresDia';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

const FlujoCaja = dynamic(() => import('@/components/trabajos/FlujoCaja'), { ssr: false, loading: () => <div className="skeleton" style={{ height: 160 }} /> });
const CompraMateriales = dynamic(() => import('@/components/trabajos/CompraMateriales'), { ssr: false });
const RegistrarTrabajo = dynamic(() => import('@/components/trabajos/RegistrarTrabajo'), { ssr: false });

type Vista = 'resumen' | 'materiales' | 'mano_obra' | 'servicio' | 'operacion' | 'flujo';
const VISTAS: [Vista, string][] = [
  ['resumen', 'Resumen'], ['materiales', 'Materiales'], ['mano_obra', 'Mano de obra'], ['servicio', 'Servicios'], ['operacion', 'Operación'], ['flujo', 'Flujo de caja'],
];
const CATEGORIAS = Object.fromEntries(CATEGORIAS_GASTO.map(c => [c.clave, c.nombre]));
const mensaje = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string } | null)?.message || 'No se pudo leer el trabajo');

let sec = 0;
const nuevaLinea = (tipo: TipoCosto, partida: string | null, orden: number): LineaEntrada => ({
  clave: `n${Date.now()}${sec++}`, partida_id: partida, tipo, descripcion: '', cantidad: 1, costo_unitario: 0, linea_id: null, trabajador_id: null, orden,
  unidad: tipo === 'mano_obra' ? 'día' : tipo === 'servicio' ? 'h' : 'un', personas: 1,
  modalidad: tipo === 'mano_obra' || tipo === 'servicio' ? 'externo' : null, honorarios: false, valor_liquido: null,
});
const CAMPOS_LINEA = ['descripcion', 'cantidad', 'costo_unitario', 'unidad', 'tipo', 'partida_id', 'trabajador_id', 'personas', 'modalidad', 'honorarios', 'valor_liquido'] as const;
const igual = (a: LineaEntrada, b: LineaEntrada) => CAMPOS_LINEA.every(k => (a[k] ?? null) === (b[k] ?? null));

/** Qué modal está abierto: registrar compra, o registrar/corregir días u horas. */
type Modal = { tipo: 'compra' } | { tipo: 'trabajo'; clase: 'mano_obra' | 'servicio'; registro?: ManoObraCP; base?: ManoObraCP[] } | null;

export default function AnalisisProyecto({ cotId, folio, plan, resultado, version, editaPresupuesto, editaFlujo, registraOtros, puedeComprar, onRendirGasto, onCambio }: {
  cotId: string; folio: number;
  /** El plan de cobro de la cotización (o el de los ajustes). */
  plan: HitoCobro[];
  /** cotizacion_resultado del trabajo: lo real tiene que cuadrar al peso. */
  resultado: ResultadoTrabajo | null;
  /** Cambia cuando se registra algo en el trabajo: se vuelve a leer. */
  version: number;
  /** Puede editar el presupuesto (cotizaciones.crear o gastos.aprobar) y el plan del flujo (cotizaciones.crear). */
  editaPresupuesto: boolean; editaFlujo: boolean;
  /** Registra mano de obra de todos y marca pagos. */
  registraOtros: boolean;
  /** Ingresa compras a proveedores (compras.gestionar). */
  puedeComprar: boolean;
  /** Rinde un gasto del trabajo (abre el formulario, ya llenado si viene `inicial`). */
  onRendirGasto?: (inicial?: InicialGasto) => void;
  /** Avisa que algo cambió (el panel vuelve a leer y sube `version`). */
  onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [datos, setDatos] = useState<DatosControl | null>(null);
  const [fallo, setFallo] = useState('');
  const [vista, setVista] = useState<Vista>('resumen');
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [equipo, setEquipo] = useState<TrabajadorElegible[]>([]);
  const [retencion, setRetencion] = useState(RETENCION_HONORARIOS);
  const [borrador, setBorrador] = useState<LineaEntrada[] | null>(null);
  const [quitadas, setQuitadas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const armado = useRef(false);

  const cargar = useCallback(async () => {
    try {
      let d = await controlProyectoService.datos(cotId);
      // La primera vez, el presupuesto se arma copiando la cotización.
      if (!d.presupuesto.length && editaPresupuesto && !armado.current) {
        armado.current = true;
        const lineas = await anteproyectoService.asegurar(cotId);
        if (lineas.length) d = { ...d, presupuesto: lineas };
      }
      setDatos(d); setFallo('');
    } catch (e) { setFallo(mensaje(e)); }
  }, [cotId, editaPresupuesto]);
  useEffect(() => { cargar(); }, [cargar, version]);
  useEffect(() => {
    vendedoresService.mapa().then(m => setNombres(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.nombre])))).catch(() => {});
    manoObraService.elegibles().then(setEquipo);
    manoObraService.retencion().then(v => { if (v !== null) setRetencion(v); });
  }, []);

  const guardadas = useMemo<LineaEntrada[]>(() => (datos?.presupuesto || []).map(l => ({ ...l, clave: l.id })), [datos]);
  const lineas = borrador ?? guardadas;
  const base = useMemo(() => {
    if (!datos) return null;
    const p = presupuesto(datos.cot);
    const movs = movimientos(datos);
    const cotizado = Object.fromEntries((datos.cot.items || []).map(i => [i.id, Number(i.cantidad) || 0]));
    const total = Number(datos.cot.total_clp ?? datos.cot.total ?? 0);
    const ejec = ejecucionDe(datos.presupuesto);
    const c = control(p, movs, ejec);
    const baseFlujo = planPorDefecto({ inicio: inicioPorDefecto(datos.cot.trabajo_inicio, datos.cot.aceptada_at, fechaLocal()), presupuesto: p, planCobro: plan });
    const planFlujo: FlujoPlan = datos.cot.flujo_plan ? normalizarPlan(datos.cot.flujo_plan, baseFlujo) : baseFlujo;
    return { p, movs, cotizado, total, ejec, c, baseFlujo, planFlujo, partidas: opcionesDePartida(datos.cot.partidas), dif: cuadre(c, resultado) };
  }, [datos, plan, resultado]);
  const horasDia = useMemo(() => Object.fromEntries(equipo.map(t => [t.id, t.horas_dia])), [equipo]);
  const a = useMemo(() => base && analizar({
    presupuesto: base.p, lineas, movimientos: base.movs, cotizado: base.cotizado, horasDia, categorias: CATEGORIAS, nombres,
  }), [base, lineas, horasDia, nombres]);

  // ── Editar el presupuesto ──
  const editando = borrador !== null;
  const edicion: EdicionPresupuesto = useMemo(() => ({
    activa: editando,
    cambiar: (clave, cambios) => setBorrador(b => b && b.map(l => (l.clave === clave ? { ...l, ...cambios } : l))),
    agregar: (tipo, partida) => setBorrador(b => b && [...b, nuevaLinea(tipo, partida, b.length)]),
    quitar: clave => {
      const id = borrador?.find(x => x.clave === clave)?.id;
      if (id) setQuitadas(q => (q.includes(id) ? q : [...q, id]));
      setBorrador(b => b && b.filter(x => x.clave !== clave));
    },
  }), [editando, borrador]);
  const originales = useMemo(() => new Map(guardadas.map(l => [l.clave, l])), [guardadas]);
  const cambiado = !!borrador && (quitadas.length > 0 || borrador.length !== guardadas.length || borrador.some(l => !l.id || !igual(l, originales.get(l.clave)!)));
  const empezar = () => { setBorrador(guardadas.map(l => ({ ...l }))); setQuitadas([]); };
  const descartar = () => { if (cambiado && !confirm('¿Descartar los cambios al presupuesto?')) return; setBorrador(null); setQuitadas([]); };
  const guardar = async () => {
    if (!borrador) return;
    if (borrador.some(l => !l.descripcion.trim())) { toastError('Cada línea necesita una descripción.'); return; }
    setGuardando(true);
    try {
      await anteproyectoService.guardar(cotId, {
        nuevas: borrador.filter(l => !l.id),
        cambiadas: borrador.filter(l => l.id && !igual(l, originales.get(l.clave)!)).map(l => ({ ...l, id: l.id!, cotizacion_id: cotId })),
        quitadas,
      });
      success('Presupuesto guardado');
      setBorrador(null); setQuitadas([]);
      onCambio();
    } catch (e) { toastError(mensaje(e)); }
    finally { setGuardando(false); }
  };
  const restablecer = async () => {
    if (!confirm('¿Volver a copiar la cotización? Se pierden los cambios hechos al presupuesto.')) return;
    setGuardando(true);
    try { await anteproyectoService.restablecer(cotId); success('Presupuesto copiado de nuevo desde la cotización'); setBorrador(null); setQuitadas([]); onCambio(); }
    catch (e) { toastError(mensaje(e)); }
    finally { setGuardando(false); }
  };

  // ── Mano de obra: pagos y registros ──
  const pagar = async (r: ManoObraCP) => {
    const doc = !r.pagado && r.tipo === 'externo' && r.honorarios && !r.documento ? prompt('N° de la boleta de honorarios (opcional)') : undefined;
    try { await manoObraService.marcarPagado(r.id, !r.pagado, doc ?? undefined); onCambio(); }
    catch (e) { toastError(mensaje(e)); }
  };
  const borrar = async (r: ManoObraCP) => {
    if (!confirm(`¿Quitar a ${r.nombre} del ${r.fecha.split('-').reverse().join('-')}?`)) return;
    try { await manoObraService.eliminar(r.id); onCambio(); }
    catch (e) { toastError(mensaje(e)); }
  };

  const exportar = async () => {
    if (!base || !a || !datos) return;
    try {
      const ind = plan.some(enMonedaExtranjera) ? await indicadoresDelDia() : null;
      const flujo = flujoSemanal({ plan: base.planFlujo, presupuesto: base.p, planCobro: plan, totalCotizacion: base.total, cobros: datos.cobros, movimientos: base.movs, ejecucion: base.ejec,
        valores: ind ? { uf: ind.uf.valor, usd: ind.usd.valor } : undefined });
      const etiqueta = (id: string | null) => { const p = base.partidas.find(x => x.id === id); return p ? `${p.numero}. ${p.nombre}` : 'Sin partida'; };
      await descargarExcel([
        ...hojasAnalisis(a, etiqueta),
        ...hojasControl({
          control: base.c, kpis: kpis(base.c, base.movs, datos.cobros, base.total), flujo, movimientos: base.movs, presupuesto: base.p, nombres,
          categorias: CATEGORIAS, lineasPresupuesto: Object.fromEntries(datos.presupuesto.map(l => [l.id, l.descripcion])),
        }),
      ], nombreArchivoControl(folio, fechaLocal()));
    } catch (e) { toastError(mensaje(e)); }
  };

  if (fallo) return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--danger)' }}>Análisis de proyecto: {fallo}</p>;
  if (!datos || !base || !a) return <div className="skeleton" style={{ height: 140 }} />;

  const registros = (clase: 'mano_obra' | 'servicio') => datos.manoObra.filter(r => (r.clase === 'servicio' ? 'servicio' : 'mano_obra') === clase);
  const cotizadoTotal = base.c.total.cotizado;
  const tarjetas: [string, React.ReactNode, string?][] = [
    ['Para gastar', formatCLP(a.paraGastar), a.paraGastar !== cotizadoTotal ? `cotizado ${formatCLP(cotizadoTotal)}` : 'igual a lo cotizado'],
    ['Gastado', formatCLP(a.gastado), a.paraGastar > 0 ? `${pct((a.gastado / a.paraGastar) * 100)} del presupuesto` : undefined],
    ['Queda', <Queda key="q" v={a.queda} />, a.queda < 0 ? 'se pasó del presupuesto' : 'para terminar'],
    ['Margen proyectado', <span key="m" style={{ color: a.margenProyectado < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatCLP(a.margenProyectado)}</span>,
      `${pct(a.margenProyectadoPct)} de la venta ${formatCLP(a.venta)}`],
  ];
  const props = { a, partidas: base.partidas, edicion };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {modal?.tipo === 'compra' && (
        <CompraMateriales cotId={cotId} folio={folio} analisis={a} partidas={base.partidas} puedeComprar={puedeComprar}
          puedeRendir={!!onRendirGasto} onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); onCambio(); }}
          onRendir={inicial => { setModal(null); onRendirGasto?.(inicial); }} />
      )}
      {modal?.tipo === 'trabajo' && (
        <RegistrarTrabajo cotId={cotId} clase={modal.clase} lineas={a.lineas.filter(x => x.linea.tipo === modal.clase && x.linea.id).map(x => x.linea)}
          partidas={base.partidas} equipo={equipo} retencion={retencion} registro={modal.registro} base={modal.base}
          onCerrar={() => setModal(null)} onListo={() => { setModal(null); onCambio(); }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0 }}><BarChart3 size={15} /> Análisis de proyecto</p>
        <span style={{ flex: 1 }} />
        {editaPresupuesto && !editando && <button className="btn btn-ghost btn-sm" onClick={empezar}><Pencil size={13} /> Editar presupuesto</button>}
        <button className="btn btn-ghost btn-sm" onClick={exportar}><Download size={13} /> Exportar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 8 }}>
        {tarjetas.map(([t, v, sub]) => (
          <div key={t} className="kpi-card"><p className="label-muted">{t}</p><p className="kpi-value" style={{ fontSize: '1.05rem' }}>{v}</p>
            {sub && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{sub}</span>}</div>
        ))}
      </div>

      {base.dif.length > 0 && (
        <div style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--y-soft)', fontSize: '0.8rem', color: 'var(--text)' }}>
          <b>No cuadra al peso con el resultado guardado del trabajo:</b>
          <ul style={{ margin: '4px 0', paddingLeft: '1.1rem' }}>
            {base.dif.map(d => <li key={d.campo}>{d.nombre}: aquí {formatCLP(d.aqui)}, guardado {formatCLP(d.base)} (diferencia {formatCLP(d.diferencia)})</li>)}
          </ul>
          <span style={{ color: 'var(--muted)' }}>
            Suele pasar con cotizaciones guardadas con una versión anterior del cotizador: la venta y el costo de cada partida se recalculan con las reglas
            de hoy. Los montos reales salen de los mismos registros, así que una diferencia ahí es un error: avísanos.</span>
        </div>
      )}

      <div role="tablist" aria-label="Vistas del análisis" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {VISTAS.map(([v, t]) => (
          <button key={v} role="tab" aria-selected={vista === v} className="btn btn-sm" onClick={() => setVista(v)}
            style={{ background: vista === v ? 'var(--y-brand)' : 'var(--bg3)', color: vista === v ? '#111' : 'var(--muted)' }}>{t}</button>
        ))}
      </div>

      {vista === 'resumen' && <Resumen a={a} />}
      {vista === 'materiales' && <Materiales {...props} cotId={cotId} onRegistrarCompra={() => setModal({ tipo: 'compra' })} />}
      {(vista === 'mano_obra' || vista === 'servicio') && (
        <Personas key={vista} {...props} clase={vista} equipo={equipo} retencion={retencion} registros={registros(vista)} registraOtros={registraOtros}
          onRegistrar={dia => setModal({ tipo: 'trabajo', clase: vista, base: dia ? registros(vista).filter(r => r.fecha === dia) : undefined })}
          onCorregir={r => setModal({ tipo: 'trabajo', clase: vista, registro: r })} onPagar={pagar} onBorrar={borrar} />
      )}
      {vista === 'operacion' && <Operacion {...props} onAgregarGasto={onRendirGasto ? (partida, categoria) => onRendirGasto({ partida_id: partida, categoria }) : undefined} />}
      {vista === 'flujo' && (
        <FlujoCaja key={JSON.stringify(base.planFlujo)} plan={base.planFlujo} planPorOmision={base.baseFlujo} guardado={!!datos.cot.flujo_plan}
          presupuesto={base.p} ejecucion={base.ejec} planCobro={plan} totalCotizacion={base.total} cobros={datos.cobros} movimientos={base.movs}
          puedeEditar={editaFlujo} onGuardar={async nuevo => { await controlProyectoService.guardarFlujo(cotId, nuevo); onCambio(); }} />
      )}

      {editando && (
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0.8rem',
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y-brand)', borderRadius: 8, boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
        }}>
          <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
            Editando el presupuesto · para gastar <b>{formatCLP(Math.round(borrador!.reduce((s, l) => s + totalLinea(l), 0)))}</b> · queda <Queda v={a.queda} /></span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={restablecer} disabled={guardando}><RotateCcw size={13} /> Copiar de nuevo la cotización</button>
          <button className="btn btn-ghost btn-sm" onClick={descartar} disabled={guardando}><X size={13} /> Descartar</button>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando || !cambiado}>
            {guardando ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar</button>
        </div>
      )}
    </div>
  );
}
