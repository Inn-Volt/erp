'use client';

/**
 * Detalle de una orden de trabajo (como el ticket de TecApp): estado, coordinación, visitas,
 * informes de visita con firma, cotizaciones de la OT (se cotiza desde aquí), materiales de
 * bodega, rendiciones, resultado (venta, costo cotizado y costo real) y bitácora.
 */

import { encendido } from '@/lib/modulos';
import NumeroInput from '@/components/NumeroInput';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarPlus, Check, ChevronRight, FileDown, FileText, Loader2, MessageSquare, Package, Pause, Play, Plus,
  Receipt, RotateCcw, Save, Send, TrendingUp, X, XCircle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import ChipEstadoOT from '@/components/ChipEstadoOT';
import LinksMapa from '@/components/LinksMapa';
import InformeVisita, { CHECKLIST_BASE, descargarInformePDF, folioInforme } from '@/components/ot/InformeVisita';
import NuevoGasto from '@/components/gastos/NuevoGasto';
import { anticiposService, type Anticipo } from '@/services/fase5';
import { EstadoPill } from '@/components/cotizador/ui';
import VisitasOT from '@/components/ot/VisitasOT';
import PedidosMaterial from '@/components/bodega/PedidosMaterial';
import { plantillasInformeService, proyectosService, folioProyecto, type PlantillaInforme, type Proyecto } from '@/services/fase5';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import {
  bodegaService, CATEGORIAS_GASTO, faltaFase2, folioOT, gastosService, informesService, otService, RESULTADOS,
  type Bodega, type CotizacionDeOT, type EstadoOT, type Gasto, type InformeOT, type Movimiento, type NotaOT, type OrdenTrabajo, type ResultadoOT,
} from '@/services/operacion';
import { vendedoresService } from '@/services/vendedores';
import { catalogoService } from '@/services/catalogo';
import { agendaService } from '@/services/agenda';
import { supabase } from '@/lib/supabase';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { formatCLP, formatDate, formatFolio } from '@/utils';
import type { CatalogoItem, Vendedor } from '@/types';

const lbl = { display: 'block', marginBottom: 6 } as const;
const tarjeta = { padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 } as const;

function Seccion({ icono, titulo, children, accion }: { icono: React.ReactNode; titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="panel-y" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)' }}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}>{icono} {titulo}</p>
        {accion}
      </div>
      <div style={tarjeta}>{children}</div>
    </div>
  );
}

export default function DetalleOTPage() {
  const { id } = useParams<{ id: string }>();
  const { perfil, puede } = usePermisos();
  const { success, error: toastError } = useToast();

  const [ot, setOt] = useState<OrdenTrabajo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [equipo, setEquipo] = useState<Record<string, Vendedor>>({});
  const [informes, setInformes] = useState<InformeOT[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [notas, setNotas] = useState<NotaOT[]>([]);
  const [empresa, setEmpresa] = useState<EmpresaInfo | null>(null);
  const [coord, setCoord] = useState({ fecha_programada: '', hora_programada: '', tecnicos: [] as string[], prioridad: 'Media' });
  const [motivoPara, setMotivoPara] = useState<EstadoOT | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState('');
  // Fase 6: informe abierto a pantalla completa, rendir gasto, cotizaciones y resultado de la OT.
  const [informeAbierto, setInformeAbierto] = useState<string | null>(null);
  const [rindiendo, setRindiendo] = useState(false);
  const [misAnticipos, setMisAnticipos] = useState<Anticipo[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionDeOT[]>([]);
  const [resultado, setResultado] = useState<ResultadoOT | null>(null);
  const [pdfDe, setPdfDe] = useState<string | null>(null);
  const router = useRouter();

  // Sacar de bodega
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [sacando, setSacando] = useState(false);
  const [mat, setMat] = useState({ busca: '', articulo_id: '', bodega_id: '', cantidad: 1, serie: '' });

  // Fase 5: plantilla del informe, proyecto, tipo de servicio y etiquetas
  const [plantillasInf, setPlantillasInf] = useState<PlantillaInforme[]>([]);
  const [plantillaSel, setPlantillaSel] = useState('');
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [etiqueta, setEtiqueta] = useState('');
  useEffect(() => {
    plantillasInformeService.listar().then(setPlantillasInf).catch(() => {});
    proyectosService.listar().then(setProyectos).catch(() => {});
  }, []);
  const guardarCampo = async (patch: Partial<OrdenTrabajo>) => {
    if (!ot) return;
    try { await otService.actualizar(ot.id, patch); setOt({ ...ot, ...patch }); setNotas(await otService.notas(ot.id)); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  const cargar = useCallback(async () => {
    try {
      const o = await otService.get(id);
      setOt(o);
      if (!o) return;
      setCoord({ fecha_programada: o.fecha_programada || '', hora_programada: (o.hora_programada || '').slice(0, 5), tecnicos: o.tecnicos, prioridad: o.prioridad });
      const [e, inf, n] = await Promise.all([vendedoresService.mapa(), informesService.deOT(id), otService.notas(id)]);
      setEquipo(e); setInformes(inf); setNotas(n);
      // Estos pueden fallar por permisos (p. ej. técnico sin bodega.ver): no rompen la página.
      bodegaService.movimientos({ otId: id }).then(setMovs).catch(() => setMovs([]));
      gastosService.deOT(id).then(setGastos).catch(() => setGastos([]));
      otService.cotizaciones(o).then(setCotizaciones).catch(() => setCotizaciones([]));
      otService.resultado(id).then(setResultado).catch(() => setResultado(null));
    } catch (err) {
      if (faltaFase2(err)) setFalta(true); else toastError('No se pudo cargar la OT: ' + (err instanceof Error ? err.message : ''));
    } finally { setCargando(false); }
  }, [id, toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    supabase.from('empresas').select('*').then(({ data }) => {
      const lista = (data || []) as EmpresaInfo[];
      setEmpresa(lista.find(x => x.id === perfil?.empresa_id) || lista[0] || null);
    });
  }, [perfil?.empresa_id]);

  useEffect(() => {
    if (!sacando || catalogo.length) return;
    Promise.all([bodegaService.bodegas(), catalogoService.getAll()]).then(([b, c]) => {
      const activas = b.filter(x => x.activo);
      setBodegas(activas); setCatalogo(c.filter(x => x.categoria === 'material'));
      setMat(m => ({ ...m, bodega_id: m.bodega_id || activas[0]?.id || '' }));
    }).catch(e => toastError(e instanceof Error ? e.message : 'No se pudo cargar bodega'));
  }, [sacando, catalogo.length, toastError]);

  const asignado = !!perfil && !!ot?.tecnicos.includes(perfil.id);
  const puedeEjecutar = puede('ot.crear') || (puede('ot.ejecutar') && asignado);
  const puedeCerrar = puede('ot.cerrar');
  const verCostos = puede('cotizaciones.ver_costos');
  const nombre = (uid?: string | null) => (uid && equipo[uid]?.nombre) || '—';

  const cambiarEstado = async (estado: EstadoOT, conMotivo?: string) => {
    if (!ot) return;
    setOcupado(true);
    try {
      await otService.actualizar(ot.id, { estado, ...(conMotivo !== undefined ? { motivo: conMotivo } : {}) });
      success(`OT ${folioOT(ot.folio)}: ${estado.replace('_', ' ')}`);
      setMotivoPara(null); setMotivo('');
      await cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cambiar el estado'); }
    finally { setOcupado(false); }
  };

  const guardarCoord = async () => {
    if (!ot) return;
    setOcupado(true);
    try {
      const patch: Partial<OrdenTrabajo> = {
        fecha_programada: coord.fecha_programada || null, hora_programada: coord.hora_programada || null,
        tecnicos: coord.tecnicos, prioridad: coord.prioridad as OrdenTrabajo['prioridad'],
      };
      if (ot.estado === 'por_coordinar' && coord.fecha_programada && coord.tecnicos.length) patch.estado = 'coordinada';
      await otService.actualizar(ot.id, patch);
      success('Coordinación guardada');
      await cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  };

  const agendar = async () => {
    if (!ot || !coord.fecha_programada) { toastError('Primero define la fecha'); return; }
    try {
      await agendaService.create({
        cliente_id: ot.cliente_id, solicitud_id: ot.solicitud_id, titulo: `${folioOT(ot.folio)} · ${ot.titulo}`,
        direccion: ot.direccion, fecha: coord.fecha_programada, hora_inicio: coord.hora_programada || null, hora_fin: null,
        responsable: 'Ambos', tipos_servicio: [], estado: 'Agendada',
        notas: coord.tecnicos.length ? `Técnicos: ${coord.tecnicos.map(nombre).join(', ')}` : null,
        created_by: perfil?.id || null, ot_id: ot.id,
      });
      success('Quedó en la agenda');
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo agendar'); }
  };

  const nuevoInforme = async () => {
    if (!ot) return;
    try {
      const pl = plantillasInf.find(p => p.id === plantillaSel) || plantillasInf.find(p => p.tipo_servicio && p.tipo_servicio === ot.tipo_servicio);
      const checklist = pl ? pl.checklist.map(c => ({ texto: c.texto, ok: false })) : CHECKLIST_BASE;
      const inf = await informesService.crear(ot.id, checklist);
      setInformes(x => [...x, inf]);
      setInformeAbierto(inf.id);
      if (['por_coordinar', 'coordinada'].includes(ot.estado)) await cambiarEstado('en_progreso');
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo crear el informe'); }
  };

  const sacarMaterial = async () => {
    if (!ot || !mat.articulo_id || !mat.bodega_id || !(mat.cantidad > 0)) { toastError('Elige artículo, bodega y cantidad'); return; }
    setOcupado(true);
    try {
      await bodegaService.registrar({ tipo: 'salida', articulo_id: mat.articulo_id, bodega_id: mat.bodega_id, cantidad: mat.cantidad, serie: mat.serie.trim() || null, ot_id: ot.id });
      success('Material descontado de bodega');
      setMat(m => ({ ...m, busca: '', articulo_id: '', cantidad: 1, serie: '' }));
      setMovs(await bodegaService.movimientos({ otId: ot.id }));
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo registrar'); }
    finally { setOcupado(false); }
  };

  const enviarNota = async () => {
    if (!ot || !nota.trim()) return;
    try { await otService.agregarNota(ot.id, nota.trim()); setNota(''); setNotas(await otService.notas(ot.id)); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar la nota'); }
  };

  const sugeridos = useMemo(() => {
    const q = mat.busca.trim().toLowerCase();
    if (!q || mat.articulo_id) return [];
    return catalogo.filter(c => `${c.codigo || ''} ${c.descripcion}`.toLowerCase().includes(q)).slice(0, 8);
  }, [mat.busca, mat.articulo_id, catalogo]);

  const renta = useMemo(() => {
    if (resultado) {
      const venta = Number(resultado.venta_neta), materiales = Number(resultado.materiales), gas = Number(resultado.gastos);
      const margen = venta - materiales - gas;
      return { venta, materiales, gastos: gas, margen, pct: venta > 0 ? margen / venta : 0, cotizado: Number(resultado.costo_cotizado) };
    }
    const bruto = Number(ot?.cotizaciones?.total_clp ?? ot?.cotizaciones?.total ?? 0);
    const venta = bruto / 1.19;
    const materiales = movs.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.cantidad * Number(m.costo_unitario || 0), 0)
      - movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.cantidad * Number(m.costo_unitario || 0), 0);
    const gas = gastos.filter(g => g.estado !== 'rechazado').reduce((s, g) => s + Number(g.monto), 0);
    const margen = venta - materiales - gas;
    return { venta, materiales, gastos: gas, margen, pct: venta > 0 ? margen / venta : 0, cotizado: null as number | null };
  }, [ot, movs, gastos, resultado]);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Operación" title="Orden de trabajo" /><FaltaSQL /></div>;
  if (cargando) return <div className="anim-in"><div className="skeleton" style={{ height: 300 }} /></div>;
  if (!ot) return (
    <div className="anim-in"><PageHeader eyebrow="Operación" title="Orden no encontrada" />
      <p style={{ color: 'var(--muted)' }}>No existe o no tienes acceso. <Link href="/ordenes">Volver a las OT</Link></p></div>
  );

  const abierta = !['cerrada', 'anulada'].includes(ot.estado);
  const acciones: React.ReactNode[] = [];
  if (puedeEjecutar && ['por_coordinar', 'coordinada', 'en_pausa'].includes(ot.estado))
    acciones.push(<button key="ini" className="btn btn-primary" disabled={ocupado} onClick={() => cambiarEstado('en_progreso')}><Play size={14} /> {ot.estado === 'en_pausa' ? 'Reanudar' : 'Iniciar'}</button>);
  if (puedeEjecutar && ot.estado === 'en_progreso') {
    acciones.push(<button key="eje" className="btn btn-primary" disabled={ocupado} onClick={() => cambiarEstado('ejecutada')}><Check size={14} /> Marcar ejecutada</button>);
    acciones.push(<button key="pau" className="btn btn-ghost" disabled={ocupado} onClick={() => setMotivoPara('en_pausa')}><Pause size={14} /> Pausar</button>);
  }
  if (ot.estado === 'ejecutada' && puedeEjecutar)
    acciones.push(<button key="vol" className="btn btn-ghost" disabled={ocupado} onClick={() => cambiarEstado('en_progreso')}><RotateCcw size={14} /> Volver a progreso</button>);
  if (ot.estado === 'ejecutada' && puedeCerrar)
    acciones.push(<button key="cer" className="btn btn-primary" disabled={ocupado} onClick={() => { if (confirm('¿Cerrar la OT? Pasa a "Por facturar".')) cambiarEstado('cerrada'); }}><Check size={14} /> Cerrar OT</button>);
  if (abierta && puedeCerrar)
    acciones.push(<button key="anu" className="btn btn-ghost" disabled={ocupado} style={{ color: 'var(--danger)' }} onClick={() => setMotivoPara('anulada')}><XCircle size={14} /> Anular</button>);
  if (!abierta && puedeCerrar)
    acciones.push(<button key="rea" className="btn btn-ghost" disabled={ocupado} onClick={() => cambiarEstado('en_progreso')}><RotateCcw size={14} /> Reabrir</button>);

  const abierto = informes.find(x => x.id === informeAbierto) || null;
  return (
    <div className="anim-in">
      {abierto && <InformeVisita ot={ot} informe={abierto} empresa={empresa} tecnicoNombre={nombre(abierto.tecnico_id)} puedeReabrir={puedeCerrar}
        onCerrar={() => setInformeAbierto(null)} onCambio={cargar} />}
      {rindiendo && <NuevoGasto destinos={[{ valor: `ot:${ot.id}`, etiqueta: `${folioOT(ot.folio)} · ${ot.titulo}`, grupo: 'OT' }]} destinoInicial={`ot:${ot.id}`} anticipos={misAnticipos} onClose={() => setRindiendo(false)}
        onListo={() => { setRindiendo(false); cargar(); }} />}
      {motivoPara && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 440, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="section-label" style={{ margin: 0 }}>{motivoPara === 'en_pausa' ? 'Pausar la OT' : 'Anular la OT'}</p>
            <label className="label-muted">Motivo *</label>
            <textarea className="input" rows={3} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder={motivoPara === 'en_pausa' ? 'Falta material, cliente no está…' : 'Cliente desistió…'} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setMotivoPara(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!motivo.trim() || ocupado} onClick={() => cambiarEstado(motivoPara, motivo.trim())}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <Link href="/ordenes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 8, textDecoration: 'none' }}><ArrowLeft size={14} /> Órdenes de trabajo</Link>
      <PageHeader eyebrow={folioOT(ot.folio)} title={ot.titulo}
        subtitle={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><ChipEstadoOT estado={ot.estado} /> Prioridad {ot.prioridad} · creada {formatDate(ot.created_at)}</span>}
        actions={acciones.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acciones}</div> : null} />

      {ot.motivo && ['en_pausa', 'anulada'].includes(ot.estado) && (
        <div className="panel-y" style={{ padding: '0.8rem 1rem', marginBottom: 12, borderLeft: '3px solid var(--danger)' }}>
          <strong>{ot.estado === 'en_pausa' ? 'En pausa' : 'Anulada'}:</strong> {ot.motivo}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <Seccion icono={<FileText size={15} />} titulo="Trabajo">
          <div style={{ fontSize: '0.9rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><span className="label-muted">Cliente: </span>{ot.clientes?.nombre_cliente || 'Sin cliente'}{ot.clientes?.rut ? ` · ${ot.clientes.rut}` : ''}</div>
            {ot.clientes?.telefono && <div><span className="label-muted">Teléfono: </span><a href={`tel:${ot.clientes.telefono}`}>{ot.clientes.telefono}</a></div>}
            {ot.direccion && <div><span className="label-muted">Dirección: </span>{ot.direccion} <div style={{ marginTop: 4 }}><LinksMapa direccion={ot.direccion} compacto /></div></div>}
            {ot.cotizaciones && <div><span className="label-muted">Cotización: </span><Link href={`/cotizador?edit=${ot.cotizaciones.id}`}>{formatFolio(ot.cotizaciones.folio)}</Link>{verCostos || puede('cotizaciones.ver') ? ` · ${formatCLP(Number(ot.cotizaciones.total_clp ?? ot.cotizaciones.total ?? 0))}` : ''}</div>}
            {ot.descripcion && <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--muted)' }}>{ot.descripcion}</p>}
            <fieldset disabled={!puede('ot.crear')} style={{ border: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <label><span className="label-muted" style={lbl}>Tipo de servicio</span>
                <select className="input" value={ot.tipo_servicio || ''} onChange={e => guardarCampo({ tipo_servicio: e.target.value || null })}>
                  <option value="">—</option>{TIPO_SERVICIO_OPCIONES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
              {proyectos.length > 0 && <label><span className="label-muted" style={lbl}>Proyecto</span>
                <select className="input" value={ot.proyecto_id || ''} onChange={e => guardarCampo({ proyecto_id: e.target.value || null })}>
                  <option value="">Sin proyecto</option>{proyectos.map(p => <option key={p.id} value={p.id}>{folioProyecto(p.folio)} · {p.nombre}</option>)}</select></label>}
            </fieldset>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {(ot.etiquetas || []).map(t => (
                <span key={t} className="badge" style={{ background: 'var(--bg3)', color: 'var(--text)', fontSize: '0.72rem' }}>
                  {t}{puede('ot.crear') && <button type="button" onClick={() => guardarCampo({ etiquetas: (ot.etiquetas || []).filter(x => x !== t) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', marginLeft: 4 }}>✕</button>}
                </span>
              ))}
              {puede('ot.crear') && <input className="input" value={etiqueta} onChange={e => setEtiqueta(e.target.value)} placeholder="+ etiqueta"
                onKeyDown={e => { if (e.key === 'Enter' && etiqueta.trim()) { guardarCampo({ etiquetas: Array.from(new Set([...(ot.etiquetas || []), etiqueta.trim()])) }); setEtiqueta(''); } }}
                style={{ width: 120, padding: '0.25rem 0.5rem', fontSize: '0.78rem' }} />}
            </div>
          </div>
        </Seccion>

        <Seccion icono={<CalendarPlus size={15} />} titulo="Coordinación"
          accion={puede('ot.crear') && abierta ? <button className="btn btn-ghost btn-sm" onClick={agendar} title="Crear la cita en la agenda"><CalendarPlus size={13} /> Agendar</button> : null}>
          <fieldset disabled={!puede('ot.crear') || !abierta} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><label className="label-muted" style={lbl}>Fecha</label><input className="input" type="date" value={coord.fecha_programada} onChange={e => setCoord({ ...coord, fecha_programada: e.target.value })} /></div>
              <div><label className="label-muted" style={lbl}>Hora</label><input className="input" type="time" value={coord.hora_programada} onChange={e => setCoord({ ...coord, hora_programada: e.target.value })} /></div>
              <div><label className="label-muted" style={lbl}>Prioridad</label>
                <select className="input" value={coord.prioridad} onChange={e => setCoord({ ...coord, prioridad: e.target.value })}>{['Baja', 'Media', 'Alta', 'Urgente'].map(p => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div><p className="label-muted" style={{ marginBottom: 6 }}>Técnicos</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.values(equipo).map(p => { const on = coord.tecnicos.includes(p.id!); return (
                  <button type="button" key={p.id} onClick={() => setCoord({ ...coord, tecnicos: on ? coord.tecnicos.filter(x => x !== p.id) : [...coord.tecnicos, p.id!] })}
                    className="badge" style={{ cursor: 'pointer', padding: '0.35rem 0.7rem', background: on ? 'var(--y-soft)' : 'var(--bg3)', color: on ? 'var(--text)' : 'var(--muted)', border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}` }}>{p.nombre}</button>); })}
              </div></div>
            {puede('ot.crear') && abierta && <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={guardarCoord} disabled={ocupado}><Save size={14} /> Guardar</button>}
          </fieldset>
        </Seccion>
      </div>

      <Seccion icono={<CalendarPlus size={15} />} titulo="Visitas">
        <VisitasOT ot={ot} equipo={equipo} puedeProgramar={puede('ot.crear')} puedeEjecutar={puedeEjecutar} uid={perfil?.id} onCambio={cargar} />
      </Seccion>

      <Seccion icono={<FileText size={15} />} titulo={`Informes de visita (${informes.length})`}
        accion={puedeEjecutar && abierta ? <span style={{ display: 'flex', gap: 6 }}>
          {plantillasInf.length > 0 && <select className="input" style={{ width: 190, padding: '0.3rem' }} value={plantillaSel} onChange={e => setPlantillaSel(e.target.value)} title="Checklist del informe">
            <option value="">Checklist según el tipo</option>{plantillasInf.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
          <button className="btn btn-primary btn-sm" onClick={nuevoInforme}><Plus size={13} /> Nuevo informe</button></span> : null}>
        {informes.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>Aún no hay informes. El técnico lo hace en terreno y lo firma con el cliente.</p>
          : informes.map(inf => (
            <div key={inf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem', border: '1px solid var(--border2)', borderRadius: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setInformeAbierto(inf.id)} style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
                    {folioInforme(inf.folio)} · {formatDate(inf.fecha)} · {nombre(inf.tecnico_id)}</span>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {RESULTADOS.find(r => r.clave === inf.resultado)?.nombre || 'Sin resultado'}{inf.trabajos ? ` · ${inf.trabajos}` : ''}{inf.fotos.length ? ` · ${inf.fotos.length} foto${inf.fotos.length === 1 ? '' : 's'}` : ''}</span>
                </span>
                <span className="badge" style={{ background: inf.estado === 'firmado' ? 'var(--success-soft)' : 'var(--y-soft)', color: inf.estado === 'firmado' ? 'var(--success)' : 'var(--text)' }}>
                  {inf.estado === 'firmado' ? `Firmado ${formatDate(inf.firmado_at)}` : 'Borrador'}</span>
                <ChevronRight size={16} color="var(--muted)" />
              </button>
              {inf.estado === 'firmado' && empresa && (
                <button className="btn btn-ghost btn-sm" disabled={pdfDe === inf.id} title="Descargar el PDF del informe"
                  onClick={async () => { setPdfDe(inf.id); try { await descargarInformePDF(ot, inf, empresa, nombre(inf.tecnico_id)); } catch { toastError('No se pudo generar el PDF'); } finally { setPdfDe(null); } }}>
                  {pdfDe === inf.id ? <Loader2 size={13} className="iv-spin" /> : <FileDown size={13} />} PDF</button>
              )}
            </div>
          ))}
      </Seccion>

      <Seccion icono={<FileText size={15} />} titulo={`Cotizaciones de la OT (${cotizaciones.length})`}
        accion={puede('cotizaciones.crear') && abierta ? <button className="btn btn-primary btn-sm" onClick={() => router.push(`/cotizador?ot=${ot.id}`)}><Plus size={13} /> Cotizar</button> : null}>
        {cotizaciones.length === 0
          ? <p style={{ color: 'var(--muted)', margin: 0 }}>Sin cotizaciones. Después de la visita, cotiza desde aquí: lleva el cliente, lo que encontró el técnico y sus fotos. Al aprobarse, el trabajo sigue en esta misma OT.</p>
          : cotizaciones.map(c => (
            <Link key={c.id} href={`/cotizador?edit=${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.75rem', border: '1px solid var(--border2)', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.88rem' }}>{formatFolio(c.folio)}</strong>
              <span style={{ flex: 1, minWidth: 120, fontSize: '0.85rem', color: 'var(--muted)' }}>{c.titulo || 'Cotización'}</span>
              <EstadoPill estado={c.estado} />
              {puede('cotizaciones.ver') && <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.86rem' }}>{formatCLP(Number(c.total_clp ?? c.total ?? 0))}</span>}
            </Link>
          ))}
      </Seccion>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {encendido('bodega') && <Seccion icono={<Package size={15} />} titulo="Materiales de bodega"
          accion={puede('bodega.mover') && abierta && !sacando ? <button className="btn btn-ghost btn-sm" onClick={() => setSacando(true)}><Plus size={13} /> Sacar de bodega</button> : null}>
          {sacando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0.6rem', background: 'var(--bg3)', borderRadius: 8 }}>
              <div style={{ position: 'relative' }}>
                <input className="input" placeholder="Buscar artículo del catálogo…" value={mat.busca} onChange={e => setMat({ ...mat, busca: e.target.value, articulo_id: '' })} />
                {sugeridos.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
                    {sugeridos.map(c => <button key={c.id} type="button" onClick={() => setMat({ ...mat, articulo_id: c.id, busca: c.descripcion })}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem' }}>
                      {c.codigo ? <span style={{ color: 'var(--muted)' }}>{c.codigo} · </span> : null}{c.descripcion}</button>)}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
                <select className="input" value={mat.bodega_id} onChange={e => setMat({ ...mat, bodega_id: e.target.value })}>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
                <NumeroInput className="input" min={0} decimales={3} value={mat.cantidad} onChange={v => setMat({ ...mat, cantidad: v })} />
              </div>
              <input className="input" placeholder="N° de serie (opcional)" value={mat.serie} onChange={e => setMat({ ...mat, serie: e.target.value })} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setSacando(false)}><X size={13} /> Cerrar</button>
                <button className="btn btn-primary" onClick={sacarMaterial} disabled={ocupado || !mat.articulo_id}><Package size={13} /> Descontar</button>
              </div>
            </div>
          )}
          {movs.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>Sin materiales descontados para esta OT.</p>
            : movs.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: '0.86rem', color: 'var(--text)', borderBottom: '1px solid var(--border2)', paddingBottom: 6 }}>
                <span style={{ flex: 1 }}>{m.catalogo_items?.descripcion || 'Artículo'}{m.serie ? <span style={{ color: 'var(--muted)' }}> · S/N {m.serie}</span> : null}</span>
                <span style={{ color: m.tipo === 'salida' ? 'var(--danger)' : 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{m.tipo === 'salida' ? '−' : '+'}{m.cantidad} {m.catalogo_items?.unidad || ''}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{m.bodegas?.nombre}</span>
              </div>
            ))}
        </Seccion>}

        {encendido('bodega') && <Seccion icono={<Send size={15} />} titulo="Pedidos de material">
          <PedidosMaterial otId={ot.id} equipo={equipo} />
        </Seccion>}

        <Seccion icono={<Receipt size={15} />} titulo={`Rendiciones de la OT · ${formatCLP(gastos.filter(g => g.estado !== 'rechazado').reduce((x, g) => x + Number(g.monto), 0))}`}
          accion={puede('gastos.crear') && ot.estado !== 'anulada' ? <button className="btn btn-ghost btn-sm" onClick={() => {
            if (perfil) anticiposService.listar(perfil.id).then(setMisAnticipos).catch(() => setMisAnticipos([]));
            setRindiendo(true);
          }}><Plus size={13} /> Rendir gasto</button> : null}>
          {gastos.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>Sin gastos rendidos en esta OT.</p>
            : gastos.map(g => (
              <div key={g.id} style={{ display: 'flex', gap: 8, fontSize: '0.86rem', color: 'var(--text)', borderBottom: '1px solid var(--border2)', paddingBottom: 6 }}>
                <span style={{ flex: 1 }}>{CATEGORIAS_GASTO.find(c => c.clave === g.categoria)?.nombre}{g.descripcion ? ` · ${g.descripcion}` : ''}<span style={{ color: 'var(--muted)' }}> · {nombre(g.usuario_id)}</span></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(Number(g.monto))}</span>
                <span style={{ fontSize: '0.75rem', color: g.estado === 'rechazado' ? 'var(--danger)' : 'var(--muted)' }}>{g.estado === 'reembolsado' ? 'reembolsado' : g.estado === 'rechazado' ? 'rechazado' : 'rendido'}</span>
              </div>
            ))}
        </Seccion>
      </div>

      {verCostos && (ot.cotizaciones || cotizaciones.some(c => c.estado === 'Aprobada') || renta.gastos > 0 || renta.materiales > 0) && (
        <Seccion icono={<TrendingUp size={15} />} titulo="Resultado de la OT (neto)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            {[
              ['Venta neta', renta.venta, 'var(--text)'],
              ...(renta.cotizado !== null ? [['Costo cotizado', -renta.cotizado, 'var(--muted)']] : []),
              ...(encendido('bodega') || renta.materiales ? [['Materiales bodega', -renta.materiales, 'var(--muted)']] : []),
              ['Gastos', -renta.gastos, 'var(--muted)'],
              ['Margen real', renta.margen, renta.margen >= 0 ? 'var(--success)' : 'var(--danger)'],
            ].map(([t, v, c]) => (
              <div key={t as string} className="kpi-card"><p className="label-muted">{t as string}</p><p className="kpi-value" style={{ color: c as string, fontSize: '1.1rem' }}>{formatCLP(v as number)}</p></div>
            ))}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: 0 }}>
            Margen real {(renta.pct * 100).toFixed(1).replace('.', ',')} % sobre la venta neta (venta − materiales de bodega − rendiciones).
            {renta.cotizado !== null && renta.venta > 0 ? ` Cotizado: ${(((renta.venta - renta.cotizado) / renta.venta) * 100).toFixed(1).replace('.', ',')} %.` : ''} No incluye las horas del equipo propio.</p>
        </Seccion>
      )}

      <Seccion icono={<MessageSquare size={15} />} titulo="Bitácora y notas">
        {notas.map(n => n.tipo === 'sistema' ? (
          <div key={n.id} style={{ fontSize: '0.8rem', color: 'var(--muted)', borderLeft: '2px solid var(--border2)', paddingLeft: 8 }}>
            {n.texto} <span style={{ fontSize: '0.72rem' }}>· {nombre(n.usuario_id) !== '—' ? `${nombre(n.usuario_id)} · ` : ''}{new Date(n.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        ) : (
          <div key={n.id} style={{ fontSize: '0.87rem', color: 'var(--text)', borderLeft: '2px solid var(--y-brand)', paddingLeft: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>{nombre(n.usuario_id)} · {new Date(n.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{n.texto}</p>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Agregar nota…" onKeyDown={e => { if (e.key === 'Enter') enviarNota(); }} />
          <button className="btn btn-primary" onClick={enviarNota} disabled={!nota.trim()} aria-label="Enviar nota">{ocupado ? <Loader2 size={14} className="iv-spin" /> : <Send size={14} />}</button>
        </div>
      </Seccion>
    </div>
  );
}
