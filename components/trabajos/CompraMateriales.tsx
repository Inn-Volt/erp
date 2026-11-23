'use client';

/**
 * «Registrar compra (IA)» desde los materiales del análisis de proyecto (fase 22).
 *   · Dos fuentes: la foto o el PDF de la boleta o factura, o una lista pegada (de un correo,
 *     WhatsApp o una planilla).
 *   · La IA extrae las líneas y las cruza con los materiales del presupuesto (con claves M1, M2…;
 *     nunca los id) y convierte la cantidad a la unidad cotizada (1 rollo de 100 m → 100 m). Si no
 *     responde, se sugiere comparando palabras.
 *   · Tabla de revisión editable y vista previa de «Así quedan los materiales».
 *   · Se guarda como compra a proveedor (con su detalle por material) o se rinde como gasto (abre el
 *     formulario de rendir ya llenado con el monto, el detalle y la foto).
 * La cantidad de cada línea se guarda en la unidad del material, para que el pendiente cuadre.
 */

import { useMemo, useState } from 'react';
import { Check, ClipboardPaste, FileImage, Loader2, Plus, Receipt, ShoppingCart, Sparkles, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import type { Analisis } from '@/lib/analisisProyecto';
import type { PartidaOpcion } from '@/lib/controlProyecto';
import { cuadreDocumento } from '@/lib/anteproyecto';
import {
  asignarPorPalabras, clavesMateriales, parsearLista, previaMateriales, resolverAsignacion, unidadNormal,
  type LineaAsignada, type MaterialAsignable, type RespuestaAsignacion,
} from '@/lib/asignarMateriales';
import type { DocumentoLeido } from '@/lib/leerDocumento';
import { avisoRut, formatearRut } from '@/lib/rut';
import { comprasService, desdeNeto, desdeTotal, mensajeCompra, TIPOS_DOC, tipoDoc, type TipoDoc } from '@/services/compras';
import { anteproyectoService, type LineaDocumentoEdit } from '@/services/anteproyecto';
import { pedirLectura } from '@/services/leerConIA';
import type { InicialGasto } from '@/components/gastos/NuevoGasto';
import { useLecturaIA } from '@/components/LeerDocumentoIA';
import { cant, inputTabla, num } from '@/components/trabajos/analisis/comun';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP } from '@/utils';

type Fila = LineaAsignada & { clave: number; partida_id: string | null };
type Doc = Pick<DocumentoLeido, 'tipo_doc' | 'folio' | 'fecha' | 'proveedor_nombre' | 'proveedor_rut' | 'neto' | 'iva' | 'exento' | 'total' | 'descripcion'>;
const docVacio = (): Doc => ({ tipo_doc: 'boleta', folio: '', fecha: fechaLocal(), proveedor_nombre: '', proveedor_rut: '', neto: 0, iva: 0, exento: 0, total: 0, descripcion: '' });
const lbl = { display: 'flex', flexDirection: 'column', gap: 3 } as const;
let sec = 0;

export default function CompraMateriales({ cotId, folio, analisis, partidas, puedeComprar, puedeRendir, onCerrar, onGuardado, onRendir }: {
  cotId: string; folio: number; analisis: Analisis; partidas: PartidaOpcion[];
  /** Ingresa compras a proveedores (compras.gestionar). */
  puedeComprar: boolean;
  /** Rinde gastos (gastos.crear). */
  puedeRendir: boolean;
  onCerrar: () => void; onGuardado: () => void;
  onRendir: (inicial: InicialGasto) => void;
}) {
  const { success, error: toastError } = useToast();
  const hayIA = useLecturaIA();
  const materiales = useMemo<MaterialAsignable[]>(() => analisis.lineas
    .filter(x => x.linea.tipo === 'material' && x.linea.id)
    .map(x => ({ id: x.linea.id!, descripcion: x.linea.descripcion, unidad: x.linea.unidad, cantidad: Number(x.linea.cantidad) || 0, partida_id: x.linea.partida_id, comprado: x.hecho })),
  [analisis]);
  const porId = useMemo(() => new Map(materiales.map(m => [m.id, m])), [materiales]);

  const [fuente, setFuente] = useState<'archivo' | 'texto'>('archivo');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [leido, setLeido] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [doc, setDoc] = useState<Doc>(docVacio);
  const [pagada, setPagada] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [guardando, setGuardando] = useState(false);
  const conIva = tipoDoc(doc.tipo_doc).conIva;
  const costoDoc = conIva || doc.tipo_doc === 'factura_exenta' ? doc.neto + doc.exento : doc.total;

  const aFila = (l: LineaAsignada): Fila => ({ ...l, clave: sec++, partida_id: (l.presupuesto_linea_id && porId.get(l.presupuesto_linea_id)?.partida_id) || null });
  const aplicar = (d: Partial<Doc>, lineas: LineaAsignada[], av: string[]) => {
    // Una lista pegada no trae el total del documento: se parte con la suma de sus líneas.
    const suma = lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);
    setDoc(x => {
      const nuevo = { ...x, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v !== 0)) } as Doc;
      if (nuevo.total || !suma) return nuevo;
      return { ...nuevo, ...(tipoDoc(nuevo.tipo_doc).conIva ? desdeTotal(suma, nuevo.exento) : { total: suma }) };
    });
    setFilas(lineas.map(aFila));
    setAvisos(av);
    setLeido(true);
  };

  const leer = async () => {
    if (fuente === 'archivo' && !archivo) { toastError('Adjunta la foto o el PDF.'); return; }
    if (fuente === 'texto' && !texto.trim()) { toastError('Pega la lista de lo comprado.'); return; }
    const local = () => {
      const lineas = asignarPorPalabras(parsearLista(texto), materiales);
      aplicar({}, lineas, []);
      if (!lineas.length) toastError('No se encontraron líneas en la lista: agrégalas a mano.');
    };
    if (fuente === 'texto' && !hayIA) { local(); return; }
    setLeyendo(true);
    try {
      const { claves, idDe } = clavesMateriales(materiales);
      const r = await pedirLectura<RespuestaAsignacion>('/api/asignar-materiales', fuente === 'archivo' ? archivo : null,
        { materiales: JSON.stringify(claves), ...(fuente === 'texto' ? { texto } : {}) });
      const res = resolverAsignacion(r, materiales, idDe);
      const montos = tipoDoc(res.doc.tipo_doc).conIva ? { neto: res.doc.neto, iva: res.doc.iva, exento: res.doc.exento, total: res.doc.total }
        : { neto: 0, iva: 0, exento: res.doc.tipo_doc === 'factura_exenta' ? res.doc.exento || res.doc.total : 0, total: res.doc.total };
      aplicar({ ...res.doc, ...(res.leidos.includes('tipo_doc') ? {} : { tipo_doc: doc.tipo_doc }), ...montos }, res.lineas, res.avisos);
      if (!res.lineas.length) toastError('La IA no encontró líneas: agrégalas a mano.');
    } catch (e) {
      if (fuente === 'texto') { local(); toastError('La IA no respondió: se sugirió comparando palabras. Revisa cada línea.'); }
      else toastError(e instanceof Error ? e.message : 'No se pudo leer el documento');
    } finally { setLeyendo(false); }
  };

  const cambiar = (clave: number, p: Partial<Fila>) => setFilas(x => x.map(f => (f.clave === clave ? { ...f, ...p } : f)));
  const asignar = (f: Fila, id: string) => {
    const m = id ? porId.get(id) : undefined;
    cambiar(f.clave, {
      presupuesto_linea_id: m?.id || null, sugerida: null, partida_id: m ? m.partida_id : f.partida_id,
      // Si la unidad es la misma, la misma cantidad; si no, se deja para revisar.
      cantidad_material: m && f.cantidad !== null && unidadNormal(f.unidad) === unidadNormal(m.unidad) ? f.cantidad : f.cantidad_material ?? f.cantidad,
    });
  };
  const agregar = () => setFilas(x => [...x, { clave: sec++, descripcion: '', cantidad: null, unidad: '', monto: 0, presupuesto_linea_id: null, cantidad_material: null, sugerida: null, partida_id: partidas[0]?.id ?? null }]);
  const setD = (p: Partial<Doc>) => setDoc(x => ({ ...x, ...p }));
  const cambiarTipo = (t: TipoDoc) => {
    if (tipoDoc(t).conIva) setD({ tipo_doc: t, ...desdeTotal(doc.total, doc.exento) });
    else setD({ tipo_doc: t, neto: 0, iva: 0, exento: t === 'factura_exenta' ? doc.total : 0, total: doc.total });
  };

  const previa = previaMateriales(materiales, filas);
  const cuadre = cuadreDocumento(filas.map(f => f.monto), costoDoc, doc.total);
  const lineasDoc = (): LineaDocumentoEdit[] => filas.filter(f => f.descripcion.trim()).map(f => {
    const m = f.presupuesto_linea_id ? porId.get(f.presupuesto_linea_id) : undefined;
    return {
      clave: String(f.clave), descripcion: f.descripcion, monto: f.monto, tipo: 'material', partida_id: f.partida_id, presupuesto_linea_id: m?.id || null,
      // En la unidad del material del presupuesto (para que el pendiente cuadre).
      cantidad: m ? f.cantidad_material : f.cantidad, unidad: m ? m.unidad || f.unidad : f.unidad,
    };
  });

  const guardarCompra = async () => {
    if (!doc.proveedor_nombre.trim()) { toastError('Indica el proveedor.'); return; }
    if (!(doc.total > 0)) { toastError('Indica el total del documento.'); return; }
    if (doc.proveedor_rut && avisoRut(doc.proveedor_rut)) { toastError(avisoRut(doc.proveedor_rut) || 'RUT inválido'); return; }
    if (!filas.some(f => f.descripcion.trim())) { toastError('Agrega al menos una línea de lo comprado.'); return; }
    setGuardando(true);
    try {
      const archivo_path = archivo ? await comprasService.subirArchivo(archivo) : null;
      const id = await comprasService.guardar(null, {
        fecha: doc.fecha || fechaLocal(), tipo_doc: doc.tipo_doc, folio: doc.folio.trim() || null,
        proveedor_rut: doc.proveedor_rut ? formatearRut(doc.proveedor_rut) : null, proveedor_nombre: doc.proveedor_nombre.trim(),
        neto: doc.neto, exento: doc.exento, iva: doc.iva, total: doc.total, categoria: 'Materiales eléctricos', descripcion: doc.descripcion.trim() || null,
        cotizacion_id: cotId, proyecto_id: null, pagada, fecha_pago: pagada ? doc.fecha || fechaLocal() : null, vencimiento: null, archivo_path,
        partida_id: null, tipo_costo: 'material',
      });
      await anteproyectoService.guardarLineas({ compra_id: id }, lineasDoc());
      success('Compra registrada: los materiales quedaron al día');
      onGuardado();
    } catch (e) { toastError(mensajeCompra(e)); }
    finally { setGuardando(false); }
  };
  const rendir = () => {
    if (!(doc.total > 0)) { toastError('Indica el total de la boleta.'); return; }
    onRendir({
      monto: doc.total, fecha: doc.fecha || undefined, categoria: 'materiales',
      descripcion: [doc.proveedor_nombre, doc.descripcion].filter(Boolean).join(' · ').slice(0, 120),
      lineas: lineasDoc(), boleta: archivo,
    });
  };

  const opciones = materiales.map(m => {
    const p = partidas.find(x => x.id === m.partida_id);
    return { id: m.id, etiqueta: `${m.descripcion}${m.unidad ? ` (${cant(m.cantidad)} ${m.unidad})` : ''}${p ? ` · ${p.numero}` : ''}` };
  });

  return (
    <div className="modal-overlay" style={{ zIndex: 250 }}>
      <div className="modal-box" style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', maxHeight: '94vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><Sparkles size={15} /> Registrar compra de materiales · IV-{String(folio).padStart(4, '0')}</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* 1. De dónde */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['archivo', 'Foto o PDF', FileImage], ['texto', 'Pegar una lista', ClipboardPaste]] as const).map(([v, t, Icono]) => (
              <button key={v} className="btn btn-sm" onClick={() => setFuente(v)}
                style={{ background: fuente === v ? 'var(--y-brand)' : 'var(--bg3)', color: fuente === v ? '#111' : 'var(--muted)' }}><Icono size={13} /> {t}</button>
            ))}
          </div>
          {fuente === 'archivo' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}><FileImage size={13} /> {archivo ? archivo.name : 'Elegir la foto o el PDF de la boleta o factura'}
                <input type="file" accept="image/*,application/pdf" hidden onChange={e => setArchivo(e.target.files?.[0] || null)} /></label>
              {hayIA && <button className="btn btn-primary btn-sm" onClick={leer} disabled={!archivo || leyendo}>{leyendo ? <Loader2 size={13} className="iv-spin" /> : <Sparkles size={13} />} Leer con IA</button>}
              {!hayIA && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Sin IA configurada: agrega las líneas a mano.</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea className="input" rows={5} value={texto} onChange={e => setTexto(e.target.value)} aria-label="Lista de lo comprado"
                placeholder={'Pega la lista tal como llegó, por ejemplo:\n10 m Cable 6 mm² $12.500\n2 x Automático 2x16A - 8.990\n1 rollo cable THHN 100 m'} />
              <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={leer} disabled={!texto.trim() || leyendo}>
                {leyendo ? <Loader2 size={13} className="iv-spin" /> : <Sparkles size={13} />} {hayIA ? 'Leer con IA' : 'Ordenar la lista'}</button>
            </div>
          )}

          {(leido || filas.length > 0) && <>
            {avisos.length > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-soft)', borderRadius: 8, padding: '0.45rem 0.7rem' }}>
              {avisos.map(x => <span key={x} style={{ display: 'block' }}>{x}</span>)}</div>}

            {/* 2. El documento */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
              <label style={lbl}><span className="label-muted">Documento</span>
                <select className="input" value={doc.tipo_doc} onChange={e => cambiarTipo(e.target.value as TipoDoc)}>
                  {TIPOS_DOC.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}</select></label>
              <label style={{ ...lbl, gridColumn: 'span 2' }}><span className="label-muted">Proveedor</span>
                <input className="input" value={doc.proveedor_nombre} onChange={e => setD({ proveedor_nombre: e.target.value })} placeholder="Ferretería…" /></label>
              <label style={lbl}><span className="label-muted">RUT</span>
                <input className="input" value={doc.proveedor_rut} onChange={e => setD({ proveedor_rut: e.target.value })} onBlur={() => doc.proveedor_rut && setD({ proveedor_rut: formatearRut(doc.proveedor_rut) })} /></label>
              <label style={lbl}><span className="label-muted">N° (folio)</span>
                <input className="input" value={doc.folio} onChange={e => setD({ folio: e.target.value })} /></label>
              <label style={lbl}><span className="label-muted">Fecha</span>
                <input className="input" type="date" value={doc.fecha} onChange={e => setD({ fecha: e.target.value })} /></label>
              {conIva && <label style={lbl}><span className="label-muted">Neto</span>
                <NumeroInput className="input" prefijo="$" value={doc.neto} ariaLabel="Neto" onChange={v => setD(desdeNeto(v, doc.exento))} /></label>}
              <label style={lbl}><span className="label-muted">Total</span>
                <NumeroInput className="input" prefijo="$" value={doc.total} ariaLabel="Total"
                  onChange={v => setD(conIva ? desdeTotal(v, doc.exento) : { total: v, neto: 0, iva: 0, exento: doc.tipo_doc === 'factura_exenta' ? v : 0 })} /></label>
            </div>
            {doc.proveedor_rut && avisoRut(doc.proveedor_rut) && <span style={{ fontSize: '0.74rem', color: 'var(--danger)' }}>{avisoRut(doc.proveedor_rut)}</span>}

            {/* 3. Lo comprado, cruzado con los materiales */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.6rem', borderRadius: 8, background: 'var(--bg3)' }}>
              <span className="label-muted">Lo comprado: revisa a qué material va cada línea y cuánto es en su unidad</span>
              {filas.map(f => {
                const m = f.presupuesto_linea_id ? porId.get(f.presupuesto_linea_id) : undefined;
                return (
                  <div key={f.clave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 6, alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>
                    <input className="input" aria-label="Descripción" value={f.descripcion} onChange={e => cambiar(f.clave, { descripcion: e.target.value })} style={{ ...inputTabla, gridColumn: 'span 2' }} placeholder="Lo que dice el documento" />
                    <span style={{ display: 'flex', gap: 4 }}>
                      <NumeroInput className="input" ariaLabel="Cantidad del documento" value={f.cantidad} decimales={3} placeholder="Cant." onChange={v => cambiar(f.clave, { cantidad: v })} onVacio={() => cambiar(f.clave, { cantidad: null })} />
                      <input className="input" aria-label="Unidad del documento" value={f.unidad} onChange={e => cambiar(f.clave, { unidad: e.target.value })} style={{ ...inputTabla, width: 52 }} placeholder="un" />
                    </span>
                    <NumeroInput className="input" prefijo="$" ariaLabel="Monto" value={f.monto} onChange={v => cambiar(f.clave, { monto: v })} />
                    <select className="input" aria-label="Material del presupuesto" value={f.presupuesto_linea_id || ''} onChange={e => asignar(f, e.target.value)}
                      style={{ ...inputTabla, gridColumn: 'span 2', background: f.sugerida ? 'var(--y-soft)' : undefined }} title={f.sugerida === 'ia' ? 'Lo sugirió la IA' : f.sugerida === 'palabras' ? 'Sugerido por las palabras' : undefined}>
                      <option value="">No cotizado (adicional)</option>
                      {opciones.map(o => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                    </select>
                    {m ? (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <NumeroInput className="input" ariaLabel={`Cantidad en ${m.unidad || 'la unidad del material'}`} value={f.cantidad_material} decimales={3}
                          onChange={v => cambiar(f.clave, { cantidad_material: v })} onVacio={() => cambiar(f.clave, { cantidad_material: null })} />
                        <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{m.unidad || ''}</span>
                      </span>
                    ) : (
                      <select className="input" aria-label="Partida" value={f.partida_id || ''} onChange={e => cambiar(f.clave, { partida_id: e.target.value || null })} style={inputTabla}>
                        <option value="">Sin partida</option>
                        {partidas.map(p => <option key={p.id} value={p.id}>{p.numero}. {p.nombre}</option>)}
                      </select>
                    )}
                    <button type="button" className="btn btn-ghost btn-xs" aria-label="Quitar línea" onClick={() => setFilas(x => x.filter(y => y.clave !== f.clave))}><X size={12} /></button>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                <button type="button" className="btn btn-ghost btn-xs" onClick={agregar}><Plus size={12} /> Línea</button>
                <span style={{ flex: 1 }} />
                {filas.length > 0 && <span style={{ color: cuadre.cuadra ? 'var(--success)' : 'var(--y)' }}>
                  Las líneas suman {formatCLP(cuadre.suma)}{cuadre.cuadra ? ' ✓' : ` · el documento: ${formatCLP(costoDoc)}${doc.total !== costoDoc ? ` (con IVA ${formatCLP(doc.total)})` : ''}`}</span>}
              </div>
              {filas.length > 0 && !cuadre.cuadra && <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Igual se puede guardar: el costo del documento se reparte entre las líneas en proporción a sus montos.</span>}
            </div>

            {/* 4. Así quedan los materiales */}
            {previa.length > 0 && (
              <div>
                <p className="label-muted" style={{ margin: '0 0 4px' }}>Así quedan los materiales</p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="iv-table" style={{ fontSize: '0.8rem', width: '100%' }}>
                    <thead><tr><th>Material</th><th style={num}>Presupuestado</th><th style={num}>Comprado antes</th><th style={num}>Esta compra</th><th style={num}>Queda</th></tr></thead>
                    <tbody>
                      {previa.map(p => (
                        <tr key={p.id}>
                          <td>{p.descripcion}</td>
                          <td style={num}>{cant(p.cantidad)} {p.unidad || ''}</td>
                          <td style={num}>{cant(p.antes)}</td>
                          <td style={num}>+{cant(p.ahora)}</td>
                          <td style={num}>{p.pendiente > 0 ? <b style={{ color: 'var(--y)' }}>{cant(p.pendiente)} pendiente</b>
                            : p.demas > 0 ? <span style={{ color: 'var(--danger)' }}>{cant(p.demas)} de más</span>
                            : <span style={{ color: 'var(--success)' }}>completo</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}
          {!leido && !filas.length && (
            <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => { setLeido(true); agregar(); }}><Plus size={12} /> Ingresar a mano</button>
          )}
        </div>
        <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {puedeComprar && leido && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={pagada} onChange={e => setPagada(e.target.checked)} style={{ accentColor: 'var(--y-brand)' }} /> Ya está pagada</label>}
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          {puedeRendir && <button className="btn btn-ghost" onClick={rendir} disabled={!leido || guardando} title="Abre «Rendir gasto» ya llenado (lo pagó alguien del equipo)">
            <Receipt size={14} /> Rendir como gasto</button>}
          {puedeComprar && <button className="btn btn-primary" onClick={guardarCompra} disabled={!leido || guardando}>
            {guardando ? <Loader2 size={14} className="iv-spin" /> : <ShoppingCart size={14} />} Guardar compra</button>}
          {!puedeComprar && !puedeRendir && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}><Check size={12} /> Sin permiso para guardar compras ni rendir gastos.</span>}
        </div>
      </div>
    </div>
  );
}
