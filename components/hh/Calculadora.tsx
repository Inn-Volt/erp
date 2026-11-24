'use client';

/**
 * La calculadora: los trabajos del cálculo (cada uno en una tarjeta), el resumen (urgencia,
 * materiales, traslado, neto en pesos y en UF, IVA), guardar, abrir y duplicar cálculos, exportar a
 * Excel y la cotización en PDF para el cliente. En el celular, el total va siempre abajo.
 * Un cálculo nuevo usa la UF y los parámetros de hoy; uno guardado usa su foto (no cambia aunque
 * cambien la UF o las tarifas), salvo que se pida pasarlo a los valores de hoy.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyPlus, Download, FileDown, FilePlus2, FolderOpen, Loader2, Plus, RefreshCw, Save, StickyNote } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { descargarExcel } from '@/lib/excel';
import { logoDocumento } from '@/lib/logoMarca';
import { formatCLP, nombreArchivo } from '@/utils';
import { PARAMETROS_INICIALES, entregablesCliente, estadoTarifa, formatoHoras, formatoIndicador, formatoUF, type ParametrosHH } from '@/lib/hh/calculo';
import { hoyEnChile, type FuenteIndicador, type IndicadoresDia } from '@/lib/hh/indicadores';
import { faltaEnLinea, filaLinea, hojasCalculo, lineaDesdeFila, totalesDe, type LineaHH } from '@/lib/hh/lineas';
import { hhService, mensajeHH, type CalculoHHBD, type CalculoNuevo } from '@/services/hh';
import { Campo, Hoja, Interruptor, Vacio, fechaCL, pctCL, type PropsPestana } from './comun';
import { ayudasCatalogo, conTarifasDeHoy } from './catalogo';
import AgregarTrabajo from './AgregarTrabajo';
import TarjetaLinea from './TarjetaLinea';
import CalculosGuardados from './CalculosGuardados';
import type { DatosCotizacionHH } from './CotizacionHHPDF';
import s from './hh.module.css';

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

let copias = 0;

export default function Calculadora({ cat, dia: diaHoy, configura, miId }: PropsPestana & { configura: boolean; miId: string | null }) {
  const { success, error: toastError, warning } = useToast();
  const ay = useMemo(() => ayudasCatalogo(cat, miId), [cat, miId]);
  const [b, setB] = useState<Borrador>(() => nuevo(cat.parametros.validez_dias));
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lista, setLista] = useState<CalculoHHBD[] | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [pdfAbierto, setPdfAbierto] = useState(false);
  const [editor, setEditor] = useState<{ i: number | null } | null>(null);
  const [verNotas, setVerNotas] = useState(false);
  const resumen = useRef<HTMLElement>(null);

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
  const bajoPiso = estados.filter(e => e?.bajoPiso).length;

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
  const duplicarLinea = (i: number) => {
    const ls = [...b.lineas];
    ls.splice(i + 1, 0, { ...b.lineas[i], key: `${b.lineas[i].key}-c${++copias}` });
    cambiar({ lineas: ls });
  };
  const guardarLinea = (l: LineaHH) => {
    if (editor?.i === null || editor?.i === undefined) cambiar({ lineas: [...b.lineas, l] });
    else cambiarLinea(editor.i, l);
    setEditor(null);
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
      setVerNotas(!!c.notas);
      setVerLista(false);
      if (duplicar) success('Copia lista con la UF y las tarifas de hoy. Guárdala para no perderla.');
    } catch (e) { toastError(mensajeHH(e, 'No se pudo abrir el cálculo.')); }
  };
  const pasarAHoy = () => {
    cambiar({ foto: null, lineas: b.lineas.map(l => conTarifasDeHoy(l, ay)) });
    success('Ahora usa la UF, el dólar, los parámetros y las tarifas de hoy.');
  };

  const guardar = async (comoNuevo: boolean) => {
    if (!b.nombre.trim()) { warning('Ponle un nombre al cálculo (arriba).'); return; }
    if (!b.lineas.length) { warning('Agrega al menos un trabajo.'); return; }
    const falta = faltas.findIndex(f => f !== null);
    if (falta >= 0) { warning(`Trabajo ${falta + 1}: ${faltas[falta]}.`); return; }
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
    if (!b.lineas.length) { warning('No hay trabajos que exportar.'); return; }
    try {
      await descargarExcel(hojasCalculo({ nombre: b.nombre || 'Sin nombre', cliente: b.cliente, lineas: b.lineas, cab, nombreTipo }, t, ind, p),
        `Calculo_HH_${nombreArchivo(b.nombre || 'sin_nombre')}.xlsx`);
    } catch (e) { toastError(mensajeHH(e, 'No se pudo exportar.')); }
  };

  const estado = b.id ? (puedeActualizar ? 'Cálculo guardado' : 'Cálculo de tu equipo') : 'Cálculo nuevo';
  const extrasAbiertos = b.materiales > 0 || b.traslado > 0;

  return (
    <div className={s.pagina}>
      {editor && (
        <AgregarTrabajo ay={ay} trabajos={trabajosActivos} inicial={editor.i === null ? null : b.lineas[editor.i]} ind={ind} p={p}
          onGuardar={guardarLinea} onCerrar={() => setEditor(null)} />
      )}
      {verLista && (
        <CalculosGuardados lista={lista} miId={miId} configura={configura} actual={b.id} onCerrar={() => setVerLista(false)}
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
      {pdfAbierto && (
        <PdfCliente onCerrar={() => setPdfAbierto(false)} validezInicial={b.validez} datos={{
          titulo: b.nombre.trim() || 'Cotización', cliente: b.cliente, fecha: hoyEnChile(), validezDias: b.validez,
          entregables: entregablesCliente(b.lineas.map(l => ({ descripcion: l.descripcion.trim(), cantidad: l.cantidad, unidad: l.unidad.trim() })), t, ind),
          netoCLP: t.neto, netoUF: t.netoUF, iva: t.iva, ivaPct: p.iva, total: t.total, uf: ind.uf, ufFecha: dia.uf.fecha, urgencia: b.urgencia,
        }} onValidez={v => cambiar({ validez: v })} />
      )}

      <div className={s.calc}>
        <div className={s.columna}>
          <div className="panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <p className="section-label" style={{ margin: 0 }}>{estado}{sucio ? ' · sin guardar' : ''}</p>
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => { setVerLista(true); cargarLista(); }}><FolderOpen size={14} /> Mis cálculos</button>
              <button className="btn btn-ghost btn-sm" onClick={empezarNuevo}><FilePlus2 size={14} /> Nuevo</button>
            </div>
            <div className={s.datos}>
              <Campo etiqueta="Nombre del cálculo">
                <input className="input" value={b.nombre} onChange={e => cambiar({ nombre: e.target.value })} placeholder="Ej.: Tablero local Providencia" />
              </Campo>
              <Campo etiqueta="Cliente">
                <input className="input" value={b.cliente} onChange={e => cambiar({ cliente: e.target.value })} placeholder="Nombre del cliente (opcional)" />
              </Campo>
            </div>
            {verNotas ? (
              <Campo etiqueta="Notas internas (no salen en el PDF)">
                <textarea className="input" rows={2} value={b.notas} onChange={e => cambiar({ notas: e.target.value })} style={{ height: 'auto', resize: 'vertical' }} />
              </Campo>
            ) : (
              <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => setVerNotas(true)}><StickyNote size={12} /> Agregar una nota interna</button>
            )}
            {b.foto && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--bg3)', borderRadius: 10, padding: '8px 10px' }}>
                <span style={{ flex: '1 1 220px' }}>Con los valores del día en que se guardó: UF {formatoIndicador(b.foto.dia.uf.valor)} ({fechaCL(b.foto.dia.uf.fecha)}) y las tarifas de ese momento.</span>
                <button className="btn btn-ghost btn-xs" onClick={pasarAHoy}><RefreshCw size={12} /> Usar los de hoy</button>
              </div>
            )}
          </div>

          <div className={s.tituloSeccion}><h2>Trabajos</h2>{b.lineas.length > 0 && <span>{b.lineas.length}</span>}</div>
          {b.lineas.length === 0 && (
            <Vacio>Agrega el primer trabajo: eliges <b>qué es</b>, <b>quién lo hace</b> y <b>cuánto</b>, y la calculadora pone el precio.</Vacio>
          )}
          {b.lineas.map((l, i) => (
            <TarjetaLinea key={l.key} l={l} i={i} total={b.lineas.length} r={t.lineas[i]} ind={ind} estado={estados[i]}
              onEditar={() => setEditor({ i })} onCantidad={v => cambiarLinea(i, { ...l, cantidad: v })} onDuplicar={() => duplicarLinea(i)}
              onQuitar={() => confirm(`¿Quitar «${l.descripcion || 'este trabajo'}»?`) && cambiar({ lineas: b.lineas.filter((_, j) => j !== i) })}
              onMover={d => mover(i, d)} />
          ))}
          <button type="button" className={s.agregar} onClick={() => setEditor({ i: null })}><Plus size={18} /> Agregar trabajo</button>
        </div>

        <aside ref={resumen} className={`panel-y ${s.resumen}`} aria-label="Resumen del cálculo">
          <p className="section-label" style={{ margin: 0 }}>Resumen</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.88rem', color: 'var(--text)' }}>
            <Interruptor activo={b.urgencia} onChange={() => cambiar({ urgencia: !b.urgencia })} etiqueta="Urgencia o fin de semana" />
            <span>Urgencia o fin de semana <span style={{ color: 'var(--muted)' }}>(+{pctCL(p.recargo_urgencia)})</span></span>
          </label>
          <details className={s.avanzado} open={extrasAbiertos || undefined}>
            <summary>Materiales y traslado</summary>
            <div className={s.avanzadoCuerpo}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', gap: 8 }}>
                <Campo etiqueta="Materiales (costo)"><NumeroInput className="input input-sm" prefijo="$" value={b.materiales} decimales={0} onChange={v => cambiar({ materiales: v })} ariaLabel="Materiales" /></Campo>
                <Campo etiqueta="Margen"><NumeroInput className="input input-sm" sufijo="%" value={Math.round(b.margen * 1000) / 10} decimales={1} onChange={v => cambiar({ margen: v / 100 })} ariaLabel="Margen de materiales" /></Campo>
              </div>
              <Campo etiqueta="Traslado (en UF)"><NumeroInput className="input input-sm" value={b.traslado} decimales={2} sufijo="UF" onChange={v => cambiar({ traslado: v })} ariaLabel="Traslado en UF" /></Campo>
            </div>
          </details>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className={s.fila}><span>Mano de obra</span><span>{formatCLP(t.subtotalLineas)}</span></div>
            {b.urgencia && <div className={s.fila}><span>Recargo urgencia</span><span>{formatCLP(t.recargoUrgencia)}</span></div>}
            {t.materialesVenta > 0 && <div className={s.fila}><span>Materiales (+{pctCL(b.margen)})</span><span>{formatCLP(t.materialesVenta)}</span></div>}
            {t.trasladoCLP > 0 && <div className={s.fila}><span>Traslado ({formatoUF(b.traslado)})</span><span>{formatCLP(t.trasladoCLP)}</span></div>}
          </div>
          <div className={s.neto}>
            <span className="label-muted">Neto (sin IVA)</span>
            <div className={s.netoValor}>{formatCLP(t.neto)}</div>
            <div className={s.netoUF}>{formatoUF(t.netoUF)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className={s.fila}><span>IVA ({pctCL(p.iva)})</span><span>{formatCLP(t.iva)}</span></div>
            <div className={s.fila}><span>Total con IVA</span><span>{formatCLP(t.total)}</span></div>
          </div>
          {t.horasReales > 0 && (
            <p className={s.ayuda}>Cada hora trabajada rinde <b style={{ color: 'var(--text)' }}>{t.valorHoraReal !== null ? formatCLP(t.valorHoraReal) : '—'}</b> ({formatoHoras(t.horasReales)} h en total, con el ayudante).</p>
          )}
          {bajoPiso > 0 && (
            <p className={s.ayuda} style={{ color: 'var(--danger)' }}>
              {bajoPiso === 1 ? 'Un trabajo queda' : `${bajoPiso} trabajos quedan`} bajo el piso según costos: estás perdiendo plata.
            </p>
          )}
          <div className={s.botones}>
            <button className="btn btn-primary" disabled={guardando} onClick={() => guardar(false)}>
              {guardando ? <Loader2 size={14} className="iv-spin" /> : <Save size={14} />} {puedeActualizar ? 'Guardar cambios' : 'Guardar'}
            </button>
            {b.id && <button className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => guardar(true)}><CopyPlus size={13} /> Guardar como nuevo</button>}
          </div>
          <div className={s.botones}>
            <button className="btn btn-ghost btn-sm" disabled={!listo} title={listo ? undefined : 'Agrega trabajos completos primero'} onClick={() => setPdfAbierto(true)}>
              <FileDown size={13} /> PDF para el cliente
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportar}><Download size={13} /> Excel</button>
          </div>
        </aside>
      </div>

      <div className={s.barra}>
        <div>
          <b>{formatCLP(t.neto)} <span>neto</span></b>
          <span>{formatoUF(t.netoUF)} · {b.lineas.length} {b.lineas.length === 1 ? 'trabajo' : 'trabajos'}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => resumen.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Resumen</button>
        <button className="btn btn-primary btn-sm" disabled={guardando} onClick={() => guardar(false)}>
          {guardando ? <Loader2 size={13} className="iv-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>
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
    <Hoja titulo="PDF para el cliente" onCerrar={onCerrar} ancho={460} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={generando} onClick={descargar}>
        {generando ? <Loader2 size={14} className="iv-spin" /> : <FileDown size={14} />} Descargar PDF
      </button>
    </>}>
      <p className={s.ayuda}>Muestra cada trabajo con su precio en UF y en pesos, el IVA y el total. No muestra horas, multiplicadores ni personas.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className={s.fila}><span>Trabajos</span><span>{datos.entregables.length}</span></div>
        <div className={s.fila}><span>Total neto</span><span>{formatoUF(datos.netoUF)} · {formatCLP(datos.netoCLP)}</span></div>
        <div className={s.fila}><span>UF de referencia</span><span>{formatoIndicador(datos.uf)} ({fechaCL(datos.ufFecha)})</span></div>
      </div>
      <Campo etiqueta="Validez de la oferta (días)">
        <NumeroInput className="input" value={validez} decimales={0} min={1} onChange={v => setValidez(Math.max(1, Math.round(v)))} ariaLabel="Validez en días" />
      </Campo>
    </Hoja>
  );
}
