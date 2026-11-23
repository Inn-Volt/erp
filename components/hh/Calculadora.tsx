'use client';

/**
 * La calculadora: líneas (quién, con qué cargo, horas reales y multiplicador), totales (urgencia,
 * materiales, traslado en UF, neto en CLP y en UF, IVA), guardar, abrir y duplicar cálculos,
 * exportar a Excel y la cotización en PDF para el cliente.
 * Un cálculo nuevo usa la UF y los parámetros de hoy; uno guardado usa su foto (no cambia aunque
 * cambien la UF o las tarifas), salvo que se pida pasarlo a los valores de hoy.
 */

import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Download, FileDown, FilePlus2, FolderOpen, Loader2, Plus, RefreshCw, Save } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { Modal } from '@/components/cotizador/ui';
import { useToast } from '@/hooks/useToast';
import { descargarExcel } from '@/lib/excel';
import { logoDocumento } from '@/lib/logoMarca';
import { formatCLP, nombreArchivo } from '@/utils';
import {
  PARAMETROS_INICIALES, entregablesCliente, estadoTarifa, formatoHoras, formatoIndicador, formatoUF,
  type ParametrosHH,
} from '@/lib/hh/calculo';
import { hoyEnChile, type FuenteIndicador, type IndicadoresDia } from '@/lib/hh/indicadores';
import { faltaEnLinea, filaLinea, hojasCalculo, lineaDesdeFila, lineaVacia, tarifasDeLinea, totalesDe, type LineaHH } from '@/lib/hh/lineas';
import { hhService, mensajeHH, type CalculoHHBD, type CalculoNuevo } from '@/services/hh';
import { Campo, Interruptor, fechaCL, pctCL, type PropsPestana } from './comun';
import { ayudasCatalogo, conPersona, conTarifasDeHoy, conTrabajo } from './catalogo';
import LineaHHEditor from './LineaHHEditor';
import CalculosGuardados from './CalculosGuardados';
import type { DatosCotizacionHH } from './CotizacionHHPDF';

interface Borrador {
  id: string | null;
  autor: string | null;
  nombre: string;
  cliente: string;
  notas: string;
  validez: number;
  urgencia: boolean;
  materiales: number;
  /** Fracción: 0,2 = 20 %. */
  margen: number;
  traslado: number;
  /** La foto de un cálculo guardado; null = la UF, el dólar y los parámetros de hoy. */
  foto: { dia: IndicadoresDia; parametros: ParametrosHH } | null;
  lineas: LineaHH[];
}

const nuevo = (validez: number): Borrador => ({
  id: null, autor: null, nombre: '', cliente: '', notas: '', validez, urgencia: false, materiales: 0, margen: 0, traslado: 0, foto: null, lineas: [],
});

const fotoDe = (c: CalculoHHBD): Borrador['foto'] => ({
  dia: {
    uf: { valor: c.uf_usada, fecha: c.uf_fecha || c.fecha, fuente: (c.uf_fuente as FuenteIndicador) || 'respaldo', anterior: false },
    usd: { valor: c.usd_usada, fecha: c.usd_fecha || c.fecha, fuente: (c.usd_fuente as FuenteIndicador) || 'respaldo', anterior: false },
  },
  parametros: { ...PARAMETROS_INICIALES, ...c.parametros },
});

export default function Calculadora({ cat, dia: diaHoy, configura, miId }: PropsPestana & { configura: boolean; miId: string | null }) {
  const { success, error: toastError, warning } = useToast();
  const ay = useMemo(() => ayudasCatalogo(cat, miId), [cat, miId]);
  const [b, setB] = useState<Borrador>(() => nuevo(cat.parametros.validez_dias));
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lista, setLista] = useState<CalculoHHBD[] | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [pdfAbierto, setPdfAbierto] = useState(false);
  const [agregar, setAgregar] = useState({ persona: ay.miPersona?.id ?? '', trabajo: '' });

  const dia = b.foto?.dia ?? diaHoy;
  const ind = { uf: dia.uf.valor, usd: dia.usd.valor };
  const p = b.foto?.parametros ?? cat.parametros;
  const cab = { urgencia: b.urgencia, materiales_clp: b.materiales, margen_materiales: b.margen, traslado_uf: b.traslado };
  const t = totalesDe(b.lineas, cab, ind, p);
  const trabajosActivos = cat.trabajos.filter(x => x.activo);
  const puedeActualizar = !!b.id && (b.autor === miId || configura);
  const faltas = b.lineas.map(faltaEnLinea);
  const listo = b.lineas.length > 0 && faltas.every(f => f === null);
  const estados = b.lineas.map(l => {
    const c = l.cargo_id ? ay.cargo.get(l.cargo_id) : undefined;
    return c ? estadoTarifa(c, ind, p, l.cargo_tarifa_base) : null;
  });
  const bajoPiso = b.lineas.filter((_, i) => estados[i]?.bajoPiso);

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sucio]);

  const cambiar = (c: Partial<Borrador>) => { setB(x => ({ ...x, ...c })); setSucio(true); };
  const cambiarLinea = (i: number, l: LineaHH) => cambiar({ lineas: b.lineas.map((x, j) => (j === i ? l : x)) });
  const mover = (i: number, d: -1 | 1) => {
    const ls = [...b.lineas]; const j = i + d;
    if (j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    cambiar({ lineas: ls });
  };
  const agregarPorPersona = () => cambiar({ lineas: [...b.lineas, conPersona(lineaVacia(), agregar.persona || null, ay)] });
  const agregarTrabajo = () => {
    if (!agregar.trabajo) return;
    cambiar({ lineas: [...b.lineas, conTrabajo(lineaVacia(), agregar.trabajo, ay)] });
    setAgregar(a => ({ ...a, trabajo: '' }));
  };

  const descartar = () => !sucio || confirm('Hay cambios sin guardar en este cálculo. ¿Descartarlos?');
  const empezarNuevo = () => { if (!descartar()) return; setB(nuevo(cat.parametros.validez_dias)); setSucio(false); };
  const cargarLista = async () => {
    try { setLista(await hhService.calculos()); }
    catch (e) { toastError(mensajeHH(e, 'No se pudieron cargar los cálculos guardados.')); }
  };
  const abrir = async (id: string, duplicar: boolean) => {
    if (!descartar()) return;
    try {
      const { cabecera: c, lineas } = await hhService.calculo(id);
      const ls = lineas.map(lineaDesdeFila);
      setB({
        id: duplicar ? null : c.id, autor: duplicar ? null : c.created_by,
        nombre: duplicar ? `Copia de ${c.nombre}` : c.nombre, cliente: c.cliente_texto || '', notas: c.notas || '',
        validez: c.validez_dias, urgencia: c.urgencia, materiales: c.materiales_clp, margen: c.margen_materiales, traslado: c.traslado_uf,
        // Duplicar es partir uno nuevo: con la UF, los parámetros y las tarifas de hoy.
        foto: duplicar ? null : fotoDe(c),
        lineas: duplicar ? ls.map(l => conTarifasDeHoy(l, ay)) : ls,
      });
      setSucio(duplicar);
      setVerLista(false);
      if (duplicar) success('Copia lista con la UF y las tarifas de hoy. Guárdala para no perderla.');
    } catch (e) { toastError(mensajeHH(e, 'No se pudo abrir el cálculo.')); }
  };
  const pasarAHoy = () => {
    cambiar({ foto: null, lineas: b.lineas.map(l => conTarifasDeHoy(l, ay)) });
    success('Ahora usa la UF, el dólar, los parámetros y las tarifas de hoy.');
  };

  const guardar = async (comoNuevo: boolean) => {
    if (!b.nombre.trim()) { warning('Ponle un nombre al cálculo.'); return; }
    if (!b.lineas.length) { warning('Agrega al menos una línea.'); return; }
    const falta = faltas.findIndex(f => f !== null);
    if (falta >= 0) { warning(`Línea ${falta + 1}: ${faltas[falta]}.`); return; }
    setGuardando(true);
    try {
      const actualizar = puedeActualizar && !comoNuevo;
      const cabecera: CalculoNuevo = {
        ...(actualizar ? { id: b.id! } : {}),
        nombre: b.nombre.trim(), cliente_texto: b.cliente.trim() || null, notas: b.notas.trim() || null, fecha: hoyEnChile(),
        uf_usada: dia.uf.valor, usd_usada: dia.usd.valor, uf_fecha: dia.uf.fecha, uf_fuente: dia.uf.fuente,
        usd_fecha: dia.usd.fecha, usd_fuente: dia.usd.fuente, parametros: p, urgencia: b.urgencia, traslado_uf: b.traslado,
        materiales_clp: b.materiales, margen_materiales: b.margen, validez_dias: b.validez,
        neto_clp: t.neto, neto_uf: t.netoUF, iva_clp: t.iva, total_clp: t.total,
      };
      const id = await hhService.guardarCalculo(cabecera, b.lineas.map((l, i) => filaLinea(l, t.lineas[i], ind, p, i)));
      setB(x => ({ ...x, id, autor: actualizar ? x.autor : miId, foto: { dia, parametros: p } }));
      setSucio(false);
      success(actualizar ? 'Cálculo actualizado.' : 'Cálculo guardado.');
      if (lista) cargarLista();
    } catch (e) { toastError(mensajeHH(e)); }
    finally { setGuardando(false); }
  };

  const nombreTipo = (clave: string | null) => (clave ? ay.tipo.get(clave)?.nombre ?? clave : 'Sin tipo');
  const exportar = async () => {
    if (!b.lineas.length) { warning('No hay líneas que exportar.'); return; }
    try {
      await descargarExcel(hojasCalculo({ nombre: b.nombre || 'Sin nombre', cliente: b.cliente, lineas: b.lineas, cab, nombreTipo }, t, ind, p),
        `Calculo_HH_${nombreArchivo(b.nombre || 'sin_nombre')}.xlsx`);
    } catch (e) { toastError(mensajeHH(e, 'No se pudo exportar.')); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pdfAbierto && (
        <PdfCliente onCerrar={() => setPdfAbierto(false)} validezInicial={b.validez} datos={{
          titulo: b.nombre.trim() || 'Cotización', cliente: b.cliente, fecha: hoyEnChile(), validezDias: b.validez,
          entregables: entregablesCliente(b.lineas.map(l => ({ descripcion: l.descripcion.trim(), cantidad: l.cantidad, unidad: l.unidad.trim() })), t, ind),
          netoCLP: t.neto, netoUF: t.netoUF, iva: t.iva, ivaPct: p.iva, total: t.total, uf: ind.uf, ufFecha: dia.uf.fecha, urgencia: b.urgencia,
        }} onValidez={v => cambiar({ validez: v })} />
      )}

      <div className="panel-y" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <p className="section-label" style={{ margin: 0 }}>{b.id ? (puedeActualizar ? 'Cálculo guardado' : 'Cálculo de otra persona') : 'Cálculo nuevo'}{sucio ? ' · sin guardar' : ''}</p>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => { setVerLista(v => !v); if (!lista) cargarLista(); }} aria-expanded={verLista}>
            <FolderOpen size={13} /> Guardados
          </button>
          <button className="btn btn-ghost btn-sm" onClick={empezarNuevo}><FilePlus2 size={13} /> Nuevo</button>
        </div>
        {verLista && (
          <CalculosGuardados lista={lista} miId={miId} configura={configura} actual={b.id}
            onAbrir={id => abrir(id, false)} onDuplicar={id => abrir(id, true)}
            onEliminar={async c => {
              if (!confirm(`¿Eliminar «${c.nombre}»? No se puede deshacer.`)) return;
              try {
                await hhService.eliminarCalculo(c.id);
                if (b.id === c.id) { setB(x => ({ ...x, id: null, autor: null })); setSucio(true); }
                success('Cálculo eliminado.'); cargarLista();
              } catch (e) { toastError(mensajeHH(e, 'No se pudo eliminar.')); }
            }} />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
          <Campo etiqueta="Nombre del cálculo"><input className="input" value={b.nombre} onChange={e => cambiar({ nombre: e.target.value })} placeholder="Ej.: Red y cámaras oficina Providencia" /></Campo>
          <Campo etiqueta="Cliente (texto libre)"><input className="input" value={b.cliente} onChange={e => cambiar({ cliente: e.target.value })} placeholder="Nombre del cliente" /></Campo>
          <Campo etiqueta="Notas internas (no van al PDF)"><input className="input" value={b.notas} onChange={e => cambiar({ notas: e.target.value })} /></Campo>
        </div>
        {b.foto && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
            <span>Con la foto guardada: UF {formatoIndicador(b.foto.dia.uf.valor)} del {fechaCL(b.foto.dia.uf.fecha)} · dólar {formatoIndicador(b.foto.dia.usd.valor)} y las tarifas de ese momento.</span>
            <button className="btn btn-ghost btn-xs" onClick={pasarAHoy}><RefreshCw size={12} /> Pasar a la UF y tarifas de hoy</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="panel" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.6rem 1.2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flex: '1 1 260px', minWidth: 0 }}>
              <Campo etiqueta="Agregar: quién lo hace">
                <select className="input input-sm" value={agregar.persona} onChange={e => setAgregar(a => ({ ...a, persona: e.target.value }))}>
                  <option value="">Tarifa general (elige el cargo)</option>
                  {ay.personasActivas.map(x => <option key={x.id} value={x.id}>{x.nombre} ({ay.asignaciones(x.id).length} cargos)</option>)}
                </select>
              </Campo>
              <button className="btn btn-primary btn-sm" onClick={agregarPorPersona}><Plus size={13} /> Línea</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flex: '1 1 260px', minWidth: 0 }}>
              <Campo etiqueta="O partir de un trabajo tipo">
                <select className="input input-sm" value={agregar.trabajo} onChange={e => setAgregar(a => ({ ...a, trabajo: e.target.value }))}>
                  <option value="">Elige un trabajo tipo…</option>
                  {[...new Set(trabajosActivos.map(x => x.categoria))].map(c => (
                    <optgroup key={c} label={c}>{trabajosActivos.filter(x => x.categoria === c).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</optgroup>
                  ))}
                </select>
              </Campo>
              <button className="btn btn-primary btn-sm" onClick={agregarTrabajo} disabled={!agregar.trabajo}><Plus size={13} /> Agregar</button>
            </div>
          </div>

          {b.lineas.length === 0 ? (
            <p className="panel" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>
              Agrega una línea: elige quién hace el trabajo (y con cuál de sus cargos) o parte de un trabajo tipo.
            </p>
          ) : b.lineas.map((l, i) => (
            <LineaHHEditor key={l.key} l={l} i={i} total={b.lineas.length} ay={ay} trabajos={trabajosActivos} r={t.lineas[i]}
              tarifas={tarifasDeLinea(l, ind, p)} estado={estados[i]} ind={ind}
              onCambio={x => cambiarLinea(i, x)} onQuitar={() => cambiar({ lineas: b.lineas.filter((_, j) => j !== i) })} onMover={d => mover(i, d)} />
          ))}
        </div>

        <div className="panel-y" style={{ flex: '1 1 300px', minWidth: 0, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 12 }}>
          <p className="section-label" style={{ margin: 0 }}>Totales (neto)</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text)' }}>
            <Interruptor activo={b.urgencia} onChange={() => cambiar({ urgencia: !b.urgencia })} etiqueta="Urgencia o fin de semana" />
            Urgencia o fin de semana (+{pctCL(p.recargo_urgencia)})
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Campo etiqueta="Materiales (costo)"><NumeroInput className="input input-sm" prefijo="$" value={b.materiales} decimales={0} onChange={v => cambiar({ materiales: v })} ariaLabel="Materiales" /></Campo>
            <Campo etiqueta="Margen materiales"><NumeroInput className="input input-sm" sufijo="%" value={Math.round(b.margen * 1000) / 10} decimales={1} onChange={v => cambiar({ margen: v / 100 })} ariaLabel="Margen de materiales" /></Campo>
            <Campo etiqueta="Traslado (UF)"><NumeroInput className="input input-sm" value={b.traslado} decimales={2} onChange={v => cambiar({ traslado: v })} ariaLabel="Traslado en UF" /></Campo>
            <Campo etiqueta="Validez (días)"><NumeroInput className="input input-sm" value={b.validez} decimales={0} min={1} onChange={v => cambiar({ validez: Math.max(1, Math.round(v)) })} ariaLabel="Validez en días" /></Campo>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', borderTop: '1px solid var(--border2)', paddingTop: 8 }}>
            <Fila k="Mano de obra" v={formatCLP(t.subtotalLineas)} />
            {b.urgencia && <Fila k={`Recargo urgencia (${pctCL(p.recargo_urgencia)})`} v={formatCLP(t.recargoUrgencia)} />}
            {t.materialesVenta > 0 && <Fila k={`Materiales (+${pctCL(b.margen)})`} v={formatCLP(t.materialesVenta)} />}
            {t.trasladoCLP > 0 && <Fila k={`Traslado (${formatoUF(b.traslado)})`} v={formatCLP(t.trasladoCLP)} />}
            <Fila k="Neto" v={formatCLP(t.neto)} fuerte />
            <Fila k="Neto en UF" v={formatoUF(t.netoUF)} fuerte />
            <Fila k={`IVA (${pctCL(p.iva)})`} v={formatCLP(t.iva)} />
            <Fila k="Total con IVA" v={formatCLP(t.total)} />
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border2)', paddingTop: 8 }}>
            <span>Valor por hora real trabajada: <b style={{ color: 'var(--text)' }}>{t.valorHoraReal !== null ? formatCLP(t.valorHoraReal) : '—'}</b> ({formatoHoras(t.horasReales)} h, con el apoyo)</span>
            {bajoPiso.length > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                {bajoPiso.length === 1 ? 'Una línea está' : `${bajoPiso.length} líneas están`} bajo el piso según costos: estás perdiendo plata.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={guardando} onClick={() => guardar(false)}>
              {guardando ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} {puedeActualizar ? 'Guardar cambios' : 'Guardar'}
            </button>
            {b.id && <button className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => guardar(true)}><CopyPlus size={13} /> Guardar como nuevo</button>}
            <button className="btn btn-ghost btn-sm" onClick={exportar}><Download size={13} /> Excel</button>
            <button className="btn btn-ghost btn-sm" disabled={!listo} title={listo ? undefined : 'Completa las líneas primero'} onClick={() => setPdfAbierto(true)}>
              <FileDown size={13} /> PDF cliente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: fuerte ? 700 : 400, color: fuerte ? 'var(--text)' : undefined }}>
      <span style={{ color: fuerte ? 'var(--text)' : 'var(--muted)' }}>{k}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}

/** La cotización para el cliente: confirma la validez y descarga el PDF (sin horas ni personas). */
function PdfCliente({ datos, validezInicial, onValidez, onCerrar }: {
  datos: DatosCotizacionHH; validezInicial: number; onValidez: (v: number) => void; onCerrar: () => void;
}) {
  const { error: toastError } = useToast();
  const [validez, setValidez] = useState(validezInicial);
  const [generando, setGenerando] = useState(false);
  const descargar = async () => {
    setGenerando(true);
    try {
      const [{ pdf }, { default: CotizacionHHPDF }, { saveAs }, empresa] = await Promise.all([
        import('@react-pdf/renderer'), import('./CotizacionHHPDF'), import('file-saver'), hhService.empresa(),
      ]);
      const base = empresa ?? { nombre: 'InnVolt', rut: '', email: '', telefono: '' };
      const blob = await pdf(<CotizacionHHPDF datos={{ ...datos, validezDias: validez }}
        empresa={{ ...base, logo_url: logoDocumento(base, { absoluto: true }) }} />).toBlob();
      saveAs(blob, `Cotizacion_${nombreArchivo(datos.titulo)}.pdf`);
      onValidez(validez);
      onCerrar();
    } catch (e) { toastError(mensajeHH(e, 'No se pudo generar el PDF.')); }
    finally { setGenerando(false); }
  };
  return (
    <Modal titulo="Cotización para el cliente" onCerrar={onCerrar} ancho={440} pie={<>
      <button className="btn btn-ghost btn-sm" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary btn-sm" disabled={generando} onClick={descargar}>
        {generando ? <Loader2 size={13} className="iv-spin" /> : <FileDown size={13} />} Descargar PDF
      </button>
    </>}>
      <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>
        Los entregables con su precio en UF y en pesos, el IVA y el total. No muestra horas, multiplicadores ni personas.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.86rem' }}>
        <Fila k="Entregables" v={String(datos.entregables.length)} />
        <Fila k="Total neto" v={`${formatoUF(datos.netoUF)} · ${formatCLP(datos.netoCLP)}`} fuerte />
        <Fila k="UF de referencia" v={`${formatoIndicador(datos.uf)} (${fechaCL(datos.ufFecha)})`} />
      </div>
      <Campo etiqueta="Validez de la oferta (días)">
        <NumeroInput className="input" value={validez} decimales={0} min={1} onChange={v => setValidez(Math.max(1, Math.round(v)))} ariaLabel="Validez en días" />
      </Campo>
    </Modal>
  );
}
