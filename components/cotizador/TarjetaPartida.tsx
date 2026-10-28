'use client';

/**
 * Una partida del presupuesto (TecApp): encabezado con número, nombre, tipo (instalación o
 * venta), total y menú; descripción para el cliente; «¿Qué quieres agregar?» (receta o
 * producto) y sus líneas. En una de instalación cada producto va con su mano de obra en
 * una fila (materiales · mano de obra), y la mano de obra se despliega con ▸.
 */

import EditorFormato from '@/components/EditorFormato';
import NumeroInput from '@/components/NumeroInput';
import { textoPlano } from '@/lib/textoFormato';
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, Layers, Plus, Trash2 } from 'lucide-react';
import BuscadorCatalogo from './BuscadorCatalogo';
import { MenuAcciones, opcionMenu, campoChico } from './ui';
import type { ArticuloCatalogo, CargoPorcentaje, Linea, Moneda, PartidaCot, QueVe, TipoPartida } from '@/lib/cotizador/tipos';
import { CARGOS_RAPIDOS, IVA, UNIDADES_ITEM, UNIDADES_PARTIDA } from '@/lib/cotizador/tipos';
import { CATEGORIA_COLORS, CATEGORIA_LABELS } from '@/types';
import { agrupar, cantidadLegible, filasDelCliente, formatMonto, porcentaje, qp, type Resultado } from '@/lib/cotizador/calculo';
import type { RecetaCompleta } from '@/lib/cotizador/recetas';

export interface AccionesPartida {
  onCambiar: (patch: Partial<PartidaCot>) => void;
  onTipo: (t: TipoPartida) => void;
  onQuitar: () => void;
  onMover: (dir: -1 | 1) => void;
  onAgregarDebajo: (t: TipoPartida) => void;
  /** `cantidad`: la escrita en el buscador («12 enchufe») o la de una lista pegada. */
  onArticulo: (a: ArticuloCatalogo, cantidad?: number) => void;
  onFuera: (texto: string, cantidad?: number) => void;
  onReceta: (r: RecetaCompleta) => void;
  /** Armar una receta nueva desde aquí (sin ir a la Biblioteca). */
  onRecetaNueva?: () => void;
  /** Partida de cargo: agrega un cargo (traslado, logística…), con monto a mano o calculado como %. */
  onCargo?: (descripcion: string, cargo?: CargoPorcentaje | null) => void;
  onDeshacerReceta?: () => void;
  onTraslado?: () => void;
  /** Copia la partida con todas sus líneas, justo debajo (piso 1 → piso 2…). */
  onDuplicar?: () => void;
}
/** Enter en una cantidad salta a la cantidad de la línea siguiente (como en una planilla). */
function siguienteCantidad(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const todas = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Cantidad"]:not(:disabled)'));
  const sig = todas[todas.indexOf(e.currentTarget) + 1];
  if (sig) { sig.focus(); sig.select(); } else e.currentTarget.blur();
}

export interface AccionesLinea {
  cambiar: (id: string, patch: Partial<Linea>) => void;
  /** Costo o ganancia: si es del catálogo, queda ajustada solo en esta cotización. */
  ajustar: (id: string, patch: Partial<Linea>) => void;
  /** Vuelve una línea ajustada al costo y precio de la biblioteca. */
  alCatalogo: (id: string) => void;
  cantidad: (id: string, v: number) => void;
  quitar: (id: string) => void;
  mover: (id: string, dir: -1 | 1) => void;
  moverA: (id: string, partidaId: string) => void;
  religar: (id: string) => void;
}

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')) || 0);

export default function TarjetaPartida(props: {
  partida: PartidaCot; indice: number; total: number; lineas: Linea[]; calc: Resultado; moneda: Moneda; valorUf?: number | null;
  queVe: QueVe; verCostos: boolean; editable: boolean; catalogo: ArticuloCatalogo[]; recetas: RecetaCompleta[];
  partidas: PartidaCot[]; recienCreada?: boolean; recetaAgregada?: { nombre: string; cuantas: number } | null;
  acciones: AccionesPartida; lineaAcc: AccionesLinea;
  /** Título y cliente de la cotización, para «Mejorar con IA». */
  contextoIA?: () => string;
  /** El descuento máximo de quien cotiza (%): lo que lo pasa se marca en rojo. null: sin tope. */
  descuentoMax?: number | null;
}) {
  const { partida: p, indice, total, lineas, calc, moneda, valorUf, queVe, verCostos, editable, acciones, lineaAcc } = props;
  const tipoActual = p.tipo || 'instalacion';
  const instalacion = tipoActual === 'instalacion';
  // Cargo operacional (traslado, logística, viático…): se cobra tal cual, sin utilidad ni descuento.
  const esCargo = tipoActual === 'cargo';
  const descMax = props.descuentoMax ?? null;
  const bases = props.partidas.map((x, i) => ({ x, i })).filter(({ x }) => x.tipo !== 'cargo');
  // El buscador de productos aparece de inmediato (antes había que elegir «¿Qué quieres agregar?»);
  // Receta se elige al lado y «+ Nuevo» (fuera de la biblioteca) está junto al buscador.
  const [modo, setModo] = useState<'receta' | 'producto'>('producto');
  const [buscaReceta, setBuscaReceta] = useState('');
  // Al elegir «producto», el cursor va directo al buscador.
  const [modoElegido, setModoElegido] = useState(false);
  const [conDescripcion, setConDescripcion] = useState(!!p.descripcion);
  // «Calcular como %» de una partida de cargo: concepto, % y sobre qué.
  const [conceptoCargo, setConceptoCargo] = useState('');
  const [pctCargo, setPctCargo] = useState<number | null>(null);
  const [baseCargo, setBaseCargo] = useState<string>('total');
  // Utilidad de toda la partida de una vez (además de la de cada línea): a todas, solo a
  // materiales o solo a mano de obra y servicios. Se puede deshacer.
  const [utilPartida, setUtilPartida] = useState('');
  const [utilA, setUtilA] = useState<'todas' | 'material' | 'servicio'>('todas');
  const [antesUtil, setAntesUtil] = useState<{ id: string; patch: Partial<Linea> }[] | null>(null);
  const aplicarUtilidad = () => {
    const u = Math.min(Math.max(num(utilPartida), 0), 95);
    const elegidas = lineas.filter(l => (l.costo || 0) > 0
      && (utilA === 'todas' || (utilA === 'material' ? l.categoria === 'material' : l.categoria !== 'material')));
    if (!elegidas.length) return;
    setAntesUtil(elegidas.map(l => ({ id: l.id, patch: { fuera: !!l.fuera, ajustada: !!l.ajustada, ganancia: l.ganancia ?? null } })));
    // Como al cambiar la utilidad en una línea: lo del catálogo queda «ajustado aquí», la biblioteca no cambia.
    for (const l of elegidas) lineaAcc.ajustar(l.id, { ganancia: gananciaParaUtilidad(u, l.descuento) });
    setUtilPartida('');
  };
  const deshacerUtilidad = () => {
    for (const x of antesUtil || []) lineaAcc.cambiar(x.id, x.patch);
    setAntesUtil(null);
  };
  const [desplegadas, setDesplegadas] = useState<Set<string>>(new Set());
  const pc = calc.partidas.get(p.id);
  const grupos = agrupar(lineas);
  const filas = new Map(filasDelCliente(lineas, calc).map(f => [f.principal.id, f]));
  const costo = pc?.costo ?? 0;
  const neto = pc?.neto ?? 0;
  const utilidad = neto - costo;
  const recetasF = props.recetas.filter(r => !buscaReceta.trim() || r.nombre.toLowerCase().includes(buscaReceta.trim().toLowerCase())).slice(0, 50);

  const cols = verCostos
    ? 'minmax(240px,1fr) 156px 132px 92px 118px 80px 122px 52px 32px'
    : 'minmax(240px,1fr) 156px 118px 118px 80px 122px 52px 32px';
  const th: React.CSSProperties = { fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', textAlign: 'right' };

  return (
    <div id={`cot-partida-${p.id}`} style={{ border: '1px solid var(--border2)', borderLeft: '4px solid var(--y-brand)', borderRadius: 12, background: 'var(--bg2)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '0.5rem 0.75rem', background: 'var(--bg3)', borderBottom: '1px solid var(--border2)', borderTopRightRadius: 11 }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, background: 'var(--bg2)', borderRadius: 6, padding: '0.1rem 0.4rem', color: 'var(--text)' }}>{indice + 1}</span>
        <input value={p.nombre} disabled={!editable} autoFocus={props.recienCreada} maxLength={200}
          onChange={e => acciones.onCambiar({ nombre: e.target.value })} placeholder={esCargo ? 'Nombre: Cargo operacional' : 'Nombre de la partida: Tablero piso 2'}
          aria-label="Nombre de la partida"
          style={{ flex: 1, minWidth: 160, background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '0.3rem 0.4rem', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', outline: 'none' }} />
        <div role="group" aria-label="Tipo de partida" style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, padding: 2, background: 'var(--bg2)' }}>
          {(['instalacion', 'venta', 'cargo'] as const).filter(t => t !== 'cargo' || editable || esCargo).map(t => {
            // De cargo a otra cosa (o al revés) solo con la partida vacía: sus líneas son de otra clase.
            const bloqueado = t !== tipoActual && (t === 'cargo' || esCargo) && lineas.length > 0;
            return (
              <button key={t} type="button" disabled={!editable || bloqueado} aria-pressed={tipoActual === t}
                onClick={() => tipoActual !== t && acciones.onTipo(t)}
                title={bloqueado ? 'Para cambiarla a este tipo, la partida tiene que estar vacía'
                  : t === 'instalacion' ? 'Cada producto trae su mano de obra, ligada a él'
                  : t === 'venta' ? 'Venta de producto: solo el producto, sin mano de obra'
                  : 'Cargo operacional: traslado, logística, viático… Se cobra tal cual, sin utilidad ni descuento'}
                style={{ border: 'none', borderRadius: 6, padding: '0.2rem 0.55rem', fontSize: '0.72rem', fontWeight: 600, cursor: editable && !bloqueado ? 'pointer' : 'default',
                  opacity: bloqueado ? 0.45 : 1,
                  background: tipoActual === t ? 'var(--y-brand)' : 'transparent', color: tipoActual === t ? '#111' : 'var(--muted)' }}>
                {t === 'instalacion' ? 'Instalación' : t === 'venta' ? 'Venta' : 'Cargo'}
              </button>
            );
          })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.86rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Total </span><b>{formatMonto(neto, moneda)}</b>
        </span>
        {editable && (
          <MenuAcciones etiqueta={`Acciones de la partida ${indice + 1}`} ancho={260}>
            {cerrar => (<>
              <button type="button" style={opcionMenu} onClick={() => { cerrar(); acciones.onAgregarDebajo('instalacion'); }}>Agregar partida de instalación debajo</button>
              <button type="button" style={opcionMenu} onClick={() => { cerrar(); acciones.onAgregarDebajo('venta'); }}>Agregar partida de venta debajo</button>
              <button type="button" style={opcionMenu} onClick={() => { cerrar(); acciones.onAgregarDebajo('cargo'); }}>Agregar cargo operacional debajo</button>
              {acciones.onDuplicar && <button type="button" style={opcionMenu} onClick={() => { cerrar(); acciones.onDuplicar!(); }}>Duplicar la partida (con sus líneas)</button>}
              {acciones.onTraslado && <button type="button" style={{ ...opcionMenu, borderTop: '1px solid var(--border2)' }} onClick={() => { cerrar(); acciones.onTraslado!(); }}>Agregar traslado (por comuna)</button>}
              <button type="button" style={{ ...opcionMenu, borderTop: '1px solid var(--border2)' }} disabled={indice === 0} onClick={() => { cerrar(); acciones.onMover(-1); }}>↑ Subir</button>
              <button type="button" style={opcionMenu} disabled={indice === total - 1} onClick={() => { cerrar(); acciones.onMover(1); }}>↓ Bajar</button>
              <button type="button" style={{ ...opcionMenu, borderTop: '1px solid var(--border2)', color: 'var(--danger)' }} onClick={() => { cerrar(); acciones.onQuitar(); }}>Quitar la partida</button>
            </>)}
          </MenuAcciones>
        )}
      </div>

      <div style={{ padding: '0.75rem' }}>
        <details open={conDescripcion} onToggle={e => setConDescripcion((e.currentTarget as HTMLDetailsElement).open)}>
          <summary style={{ cursor: 'pointer', fontSize: '0.76rem', color: 'var(--muted)' }}>
            {p.descripcion ? 'Descripción para el cliente' : 'Agregar una descripción para el cliente'}
            {(Number(p.cantidad) !== 1 || p.unidad !== 'global') ? ` · ${cantidadLegible(p.cantidad)} ${p.unidad}` : ''}
            {!conDescripcion && p.descripcion ? <span style={{ color: 'var(--text)' }}>: {textoPlano(p.descripcion).slice(0, 90)}</span> : null}
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 120px', gap: 8, marginTop: 8 }}>
            <label><span className="label-muted" style={{ display: 'block', fontSize: '0.7rem' }} title="Para el valor unitario del PDF: «3 puertas»">Cantidad</span>
              <NumeroInput className="input" style={campoChico} min={0} decimales={3} disabled={!editable} value={p.cantidad}
                onChange={v => acciones.onCambiar({ cantidad: v })} /></label>
            <label><span className="label-muted" style={{ display: 'block', fontSize: '0.7rem' }}>Unidad</span>
              <input className="input" style={campoChico} list="unidades-de-partida" maxLength={20} disabled={!editable} value={p.unidad}
                onChange={e => acciones.onCambiar({ unidad: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 8 }}>
            <EditorFormato valor={p.descripcion || ''} editable={editable} onCambiar={t => acciones.onCambiar({ descripcion: t })} alto={70}
              etiqueta="Descripción para el cliente" placeholder="Lo que lee el cliente bajo el nombre (en el PDF va a todo el ancho)."
              ia={{ tipo: 'partida', contexto: () => [props.contextoIA?.(), `Partida: ${p.nombre || 'sin nombre'}${p.cantidad > 1 ? ` (${p.cantidad} ${p.unidad})` : ''}`,
                lineas.length > 0 && `Incluye:\n${lineas.slice(0, 15).map(l => `· ${l.descripcion}${l.cantidad ? ` (${l.cantidad} ${l.unidad || ''})`.replace(' )', ')') : ''}`).join('\n')}`].filter(Boolean).join('\n') }} />
          </div>
          <datalist id="unidades-de-partida">{UNIDADES_PARTIDA.map(u => <option key={u} value={u} />)}</datalist>
        </details>

        {editable && esCargo && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.76rem', color: 'var(--muted)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span>Agregar</span>
              {CARGOS_RAPIDOS.map(c => (
                <button key={c} type="button" className="btn btn-ghost btn-xs" onClick={() => acciones.onCargo?.(c)}><Plus size={12} /> {c}</button>
              ))}
              {acciones.onTraslado && <button type="button" className="btn btn-ghost btn-xs" onClick={acciones.onTraslado}
                title="Calcula el traslado según la comuna (la tabla de traslados de la Biblioteca)"><Plus size={12} /> Traslado a una comuna</button>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span>O calcularlo como</span>
              <NumeroInput className="input" min={0} max={100} value={pctCargo} onChange={v => setPctCargo(v)} onVacio={() => setPctCargo(null)}
                ariaLabel="% del cargo" envoltura={{ width: 64 }} style={{ ...campoChico }} /> % de
              <select className="input" value={baseCargo} onChange={e => setBaseCargo(e.target.value)} aria-label="Sobre qué se calcula el cargo"
                style={{ ...campoChico, width: 'auto', maxWidth: 240, padding: '0.3rem 0.4rem' }}>
                <option value="total">toda la cotización</option>
                <option value="mano_obra">la mano de obra y servicios</option>
                {bases.map(({ x, i }) => <option key={x.id} value={x.id}>la partida {i + 1}. {x.nombre?.trim() || 'sin nombre'}</option>)}
              </select>
              <input className="input" list="cargos-rapidos" value={conceptoCargo} maxLength={120} onChange={e => setConceptoCargo(e.target.value)}
                placeholder="Gasto operacional" aria-label="Nombre del cargo" style={{ ...campoChico, width: 170 }} />
              <button type="button" className="btn btn-ghost btn-xs" disabled={!(Number(pctCargo) > 0)}
                title="Se calcula sobre el neto (con los descuentos, sin IVA) y se pone al día solo si cambia la base"
                onClick={() => { acciones.onCargo?.(conceptoCargo.trim() || 'Gasto operacional', { pct: Number(pctCargo), base: baseCargo }); setPctCargo(null); setConceptoCargo(''); }}>Agregar</button>
              <datalist id="cargos-rapidos">{CARGOS_RAPIDOS.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
        )}

        {editable && !esCargo && (
          <div style={{ marginTop: 10 }}>
            {(
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, padding: 2 }}>
                  {(['producto', 'receta'] as const).map(m => (
                    <button key={m} type="button" onClick={() => { setModo(m); setModoElegido(true); }} className="btn btn-xs"
                      style={{ background: modo === m ? 'var(--y-brand)' : 'transparent', color: modo === m ? '#111' : 'var(--muted)' }}>
                      {m === 'producto' ? 'Producto' : 'Receta'}</button>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  {modo === 'producto' ? (
                    <BuscadorCatalogo catalogo={props.catalogo} moneda={moneda} valorUf={valorUf} autoFocus={modoElegido}
                      onElegir={acciones.onArticulo} onFuera={acciones.onFuera} onBuscarReceta={t => { setBuscaReceta(t); setModo('receta'); }} />
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="input" value={buscaReceta} onChange={e => setBuscaReceta(e.target.value)} placeholder="Busca una receta…" autoFocus />
                        {acciones.onRecetaNueva && <button type="button" className="btn btn-ghost" onClick={acciones.onRecetaNueva}
                          title="Arma una receta aquí: la usas solo en esta cotización o la guardas en la biblioteca"><Plus size={14} /> Nueva</button>}
                      </div>
                      <div style={{ marginTop: 6, border: '1px solid var(--border2)', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
                        {recetasF.length === 0 && <p style={{ padding: '0.6rem', fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>
                          {props.recetas.length ? 'Ninguna receta con ese nombre.' : 'Aún no hay recetas: créalas en Biblioteca → Recetas.'}
                          {buscaReceta.trim() && <button type="button" onClick={() => setModo('producto')} style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer' }}>Buscar en el catálogo</button>}
                        </p>}
                        {recetasF.map(r => (
                          <button key={r.id} type="button" onClick={() => acciones.onReceta(r)}
                            style={{ display: 'flex', width: '100%', gap: 8, padding: '0.5rem 0.7rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border2)', textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }}>
                            <Layers size={14} style={{ marginTop: 2, color: 'var(--y)' }} />
                            <span style={{ flex: 1 }}>
                              <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600 }}>{r.nombre}</span>
                              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                                {r.componentes.length} componentes{r.preguntas.length ? ` · ${r.preguntas.length} pregunta${r.preguntas.length === 1 ? '' : 's'}` : ' · fija'}
                                {r.descripcion ? ` · ${r.descripcion}` : ''}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {props.recetaAgregada && (
              <div role="status" style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg3)', borderRadius: 8, padding: '0.45rem 0.7rem', fontSize: '0.84rem', color: 'var(--text)' }}>
                <span style={{ flex: 1 }}>Se agregó «{props.recetaAgregada.nombre}» ({props.recetaAgregada.cuantas === 1 ? '1 línea' : `${props.recetaAgregada.cuantas} líneas`})</span>
                <button type="button" onClick={acciones.onDeshacerReceta} style={{ background: 'none', border: 'none', color: 'var(--y)', textDecoration: 'underline', cursor: 'pointer' }}>Deshacer</button>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10, border: '1px solid var(--border2)', borderRadius: 8, overflowX: 'auto' }}>
          {lineas.length === 0 ? (
            <p style={{ padding: '0.7rem', fontSize: '0.84rem', color: 'var(--muted)', margin: 0 }}>
              {!editable ? 'Sin líneas.' : esCargo ? 'Agrega arriba los cargos: se cobran tal cual, sin utilidad ni descuento.'
                : modo === null ? 'Aquí quedan las líneas: elige arriba si agregas una receta o un producto.'
                : instalacion ? 'Busca arriba lo que lleva: cada producto trae su instalación.' : 'Busca arriba los productos que se venden.'}
            </p>
          ) : (
            <div style={{ minWidth: verCostos ? 1040 : 820 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border2)', borderLeft: '3px solid transparent' }}>
                <span style={{ ...th, textAlign: 'left' }}>Descripción</span>
                <span style={{ ...th, textAlign: 'left' }}>Cantidad</span>
                {esCargo
                  ? <><span style={th} title="Lo que se cobra por unidad (neto): un cargo va tal cual, sin utilidad">Monto unit.</span>
                    {verCostos && <span />}</>
                  : verCostos
                  ? <><span style={th} title="Costo neto por unidad. Si el precio que tienes trae IVA, escríbelo y toca «quitar IVA»">Costo unit.</span>
                    <span style={th} title="De lo que paga el cliente (neto), qué parte queda para InnVolt">Utilidad</span></>
                  : <span style={th} title="Precio neto por unidad">Precio unit.</span>}
                <span style={th} title="Precio × cantidad, antes del descuento">Subtotal</span>
                <span style={th}>Desc.</span>
                <span style={th} title="Subtotal menos el descuento (neto: el IVA se suma en el total de la cotización)">Total</span>
                <span style={{ ...th, textAlign: 'center' }} title="Marcado: lleva IVA 19 %. Sin marcar: exento">IVA</span>
                <span />
              </div>
              {grupos.map((g, n) => {
                const conMano = instalacion && g.ligadas.length > 0;
                const desplegada = conMano && desplegadas.has(g.cabeza.id);
                const visibles = !instalacion || desplegada ? [g.cabeza, ...g.ligadas] : [g.cabeza];
                return (
                  <div key={g.cabeza.id} style={{ borderBottom: '1px solid var(--border2)' }}>
                    {visibles.map(l => (
                      <FilaLinea key={l.id} l={l} esLigada={l !== g.cabeza} cols={cols} calc={calc} moneda={moneda}
                        fila={l === g.cabeza ? filas.get(l.id) : undefined} ligadas={l === g.cabeza ? g.ligadas : []}
                        conMano={conMano && l === g.cabeza} desplegada={desplegada}
                        onDesplegar={() => setDesplegadas(s => { const x = new Set(s); if (x.has(g.cabeza.id)) x.delete(g.cabeza.id); else x.add(g.cabeza.id); return x; })}
                        producto={l !== g.cabeza ? g.cabeza : null}
                        verCostos={verCostos} editable={editable} primera={n === 0} ultima={n === grupos.length - 1}
                        partidas={props.partidas.filter(x => x.id !== p.id && (x.tipo === 'cargo') === esCargo)} acc={lineaAcc}
                        esCargo={esCargo} bases={bases} descPartida={esCargo ? 0 : Number(p.descuento) || 0} descuentoMax={descMax} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.4rem 1.2rem', marginTop: 8, fontSize: '0.76rem', color: 'var(--muted)' }}>
          {!esCargo && lineas.length > 0 && (editable || (Number(p.descuento) || 0) > 0) ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
              title="Se descuenta del total de la partida, después del descuento de cada línea. En el PDF la partida sale con lo descontado">
              Descuento de la partida
              <NumeroInput className="input" min={0} max={100} value={p.descuento ?? null} disabled={!editable}
                onChange={v => acciones.onCambiar({ descuento: v > 0 ? Math.min(v, 100) : null })} onVacio={() => acciones.onCambiar({ descuento: null })}
                ariaLabel="Descuento de la partida" envoltura={{ width: 64 }}
                style={{ ...campoChico, ...(descMax !== null && (Number(p.descuento) || 0) > descMax ? rojo : {}) }} /> %
              {(pc?.descuentoPartida || 0) > 0 && <span>(− {formatMonto(pc!.descuentoPartida, moneda)})</span>}
              {descMax !== null && (Number(p.descuento) || 0) > descMax && <span style={{ color: 'var(--danger)' }}>pasa tu máximo ({porcentaje(descMax)})</span>}
            </span>
          ) : <span />}
          {editable && verCostos && !esCargo && lineas.some(l => (l.costo || 0) > 0) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              Utilidad de
              <select className="input" value={utilA} onChange={e => setUtilA(e.target.value as typeof utilA)} aria-label="A qué líneas se aplica la utilidad"
                style={{ ...campoChico, width: 'auto', padding: '0.3rem 0.4rem' }}>
                <option value="todas">toda la partida</option>
                <option value="material">los materiales</option>
                <option value="servicio">la mano de obra y servicios</option>
              </select>
              <NumeroInput className="input" min={0} max={95} value={utilPartida === '' ? null : num(utilPartida)} mostrarCero
                onChange={v => setUtilPartida(String(v))} onVacio={() => setUtilPartida('')}
                ariaLabel="Utilidad para toda la partida" envoltura={{ width: 64 }} style={{ ...campoChico }}
                onKeyDown={e => { if (e.key === 'Enter' && utilPartida.trim() !== '') { e.preventDefault(); aplicarUtilidad(); } }} /> %
              <button type="button" className="btn btn-ghost btn-xs" disabled={utilPartida.trim() === ''} onClick={aplicarUtilidad}
                title="Pone esa utilidad a cada línea (lo de la biblioteca queda «ajustado aquí»; la biblioteca no cambia)">Aplicar</button>
              {antesUtil && <button type="button" className="btn btn-ghost btn-xs" onClick={deshacerUtilidad}>Deshacer</button>}
            </span>
          )}
          {queVe === 'partidas' && pc && lineas.length > 0 && (Number(p.cantidad) !== 1 || p.unidad !== 'global') && (
            <span>{pc.valorUnitario !== null
              ? <>Valor unitario: {formatMonto(pc.valorUnitario, moneda, true)} × {cantidadLegible(p.cantidad)} {p.unidad}</>
              : <span style={{ color: '#d97706' }} title="El PDF imprime la cantidad como texto y solo el total">El valor unitario no da exacto: el PDF dirá «{cantidadLegible(p.cantidad)} {p.unidad}» y solo el total</span>}
            </span>
          )}
          {verCostos && !esCargo && lineas.length > 0 && (
            <span>Costo {formatMonto(costo, moneda)} · Utilidad {formatMonto(utilidad, moneda)}{neto > 0 ? ` (${porcentaje(Math.round((utilidad / neto) * 1000) / 10)})` : ''}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaLinea({ l, esLigada, cols, calc, moneda, fila, ligadas, conMano, desplegada, onDesplegar, producto, verCostos, editable, primera, ultima, partidas, acc,
  esCargo, bases, descPartida, descuentoMax }: {
  l: Linea; esLigada: boolean; cols: string; calc: Resultado; moneda: Moneda;
  fila?: ReturnType<typeof filasDelCliente>[number]; ligadas: Linea[]; conMano: boolean; desplegada: boolean; onDesplegar: () => void;
  producto: Linea | null; verCostos: boolean; editable: boolean; primera: boolean; ultima: boolean; partidas: PartidaCot[]; acc: AccionesLinea;
  esCargo: boolean; bases: { x: PartidaCot; i: number }[]; descPartida: number; descuentoMax: number | null;
}) {
  const c = calc.lineas.get(l.id);
  const deAntes = !l.itemId && !l.fuera;
  // En una partida de cargo, todo es «solo de esta cotización»: no hace falta decirlo.
  const nueva = !!l.fuera && !l.ajustada && !esCargo;
  // Un cargo calculado como %: su monto lo pone la cotización (y su base puede haber desaparecido).
  const pctCargo = esCargo && l.cargo ? l.cargo : null;
  const sinBase = !!pctCargo && pctCargo.base !== 'total' && pctCargo.base !== 'mano_obra' && !bases.some(b => b.x.id === pctCargo.base);
  // Descuento efectivo de la línea (el suyo y el de su partida) contra el máximo de quien cotiza.
  const descEfectivo = (1 - (1 - (Number(l.descuento) || 0) / 100) * (1 - descPartida / 100)) * 100;
  const pasaMax = descuentoMax !== null && descEfectivo > descuentoMax + 1e-9;
  const exenta = (l.iva ?? IVA) === 0;
  // Líneas guardadas antes con «costo con IVA»: se siguen calculando con su neto.
  const costoConIva = !!l.ivaIncluido && !exenta;
  const bajoCosto = c?.margenReal !== null && c?.margenReal !== undefined && c.margenReal < 0;
  // Plegada, el descuento del producto vale también para su mano de obra.
  const delGrupo = conMano && !desplegada;
  const variosDesc = delGrupo && ligadas.some(m => (m.descuento || 0) !== (l.descuento || 0));
  // Lo que suma la fila: con la instalación plegada, el producto más su mano de obra.
  const netoFila = delGrupo && fila ? fila.neto : c?.neto;
  const brutoFila = delGrupo && fila ? fila.subtotal : c?.subtotal;
  const der: React.CSSProperties = { textAlign: 'right', fontSize: '0.86rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', paddingTop: '0.4rem' };
  const nota: React.CSSProperties = { display: 'block', fontSize: '0.66rem', fontWeight: 400, color: 'var(--muted)', whiteSpace: 'nowrap' };
  const etiqueta: React.CSSProperties = { borderRadius: 4, padding: '0 4px', fontWeight: 600 };
  const unidades = UNIDADES_ITEM.includes(l.unidad) || !l.unidad ? UNIDADES_ITEM : [l.unidad, ...UNIDADES_ITEM];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.5rem 0.7rem', alignItems: 'start', background: esLigada ? 'var(--bg3)' : undefined,
      // Cada tipo con su color: material, mano de obra, servicio, operación.
      borderLeft: `3px solid ${CATEGORIA_COLORS[l.categoria] || 'transparent'}` }}>
      {/* Descripción */}
      <div style={{ minWidth: 0, paddingLeft: esLigada ? 18 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
          {esLigada && <span style={{ color: 'var(--muted)', paddingTop: '0.2rem' }}>↳</span>}
          <TextoQueCrece valor={l.descripcion} disabled={!editable} etiqueta="Descripción"
            onCambiar={t => acc.cambiar(l.id, { descripcion: t })}
            placeholder={l.fuera ? 'Qué es: soporte especial para lector' : 'Descripción'}
            color={esLigada ? 'var(--muted)' : 'var(--text)'} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: '0.66rem', color: 'var(--muted)', paddingLeft: 4, marginTop: 2 }}>
          {nueva && editable ? (
            // En lo que no viene de la biblioteca, el tipo se elige en la misma etiqueta.
            <select value={l.categoria} aria-label="Tipo" title="Tipo de línea"
              onChange={e => {
                const cat = e.target.value as Linea['categoria'];
                acc.cambiar(l.id, { categoria: cat });
              }}
              style={{ ...etiqueta, color: CATEGORIA_COLORS[l.categoria], border: `1px solid color-mix(in srgb, ${CATEGORIA_COLORS[l.categoria]} 40%, transparent)`, fontWeight: 700, fontSize: '0.66rem', background: 'transparent', cursor: 'pointer', padding: '0 2px' }}>
              <option value="material">Material</option><option value="mano_obra">Mano de obra</option><option value="servicio">Servicio</option><option value="operacion">Operación</option>
            </select>
          ) : (
            <span style={{ ...etiqueta, color: CATEGORIA_COLORS[l.categoria], border: `1px solid color-mix(in srgb, ${CATEGORIA_COLORS[l.categoria]} 40%, transparent)`, fontWeight: 700 }}>{CATEGORIA_LABELS[l.categoria]}</span>
          )}
          {l.codigo && !nueva && <span style={{ fontFamily: 'monospace' }}>{l.codigo}</span>}
          {nueva && <span title="No está en la biblioteca: existe solo en esta cotización y no se agrega a la biblioteca."
            style={{ ...etiqueta, background: 'rgba(217,119,6,.15)', color: '#d97706', cursor: 'help' }}>Solo en esta cotización</span>}
          {l.ajustada && <span style={{ ...etiqueta, background: 'var(--y-soft)', color: 'var(--text)' }}
            title="El costo o la utilidad se cambiaron en esta cotización; la biblioteca sigue igual">Ajustado aquí
            {editable && l.itemId && <button type="button" onClick={() => acc.alCatalogo(l.id)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 400 }}>↺ volver al de la biblioteca</button>}
          </span>}
          {deAntes && <span style={{ ...etiqueta, background: 'var(--bg3)', fontWeight: 400 }}>Línea de antes</span>}
          {nueva && (l.costo || 0) > 0 && (l.ganancia === null || l.ganancia === undefined) &&
            <span style={{ color: '#d97706' }} title="Ponle utilidad para que no se venda a costo">sin utilidad: se vende a costo</span>}
          {pctCargo && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {editable ? <>
                <NumeroInput className="input" min={0} max={100} value={pctCargo.pct} ariaLabel="% del cargo" envoltura={{ width: 58 }}
                  onChange={v => acc.cambiar(l.id, { cargo: { ...pctCargo, pct: v } })} style={{ ...campoChico, padding: '0.15rem 0.3rem', fontSize: '0.72rem' }} /> % de
                <select value={pctCargo.base} aria-label="Sobre qué se calcula" onChange={e => acc.cambiar(l.id, { cargo: { ...pctCargo, base: e.target.value } })}
                  style={{ fontSize: '0.68rem', background: 'transparent', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', maxWidth: 200 }}>
                  <option value="total">toda la cotización</option>
                  <option value="mano_obra">la mano de obra y servicios</option>
                  {bases.map(({ x, i }) => <option key={x.id} value={x.id}>la partida {i + 1}. {x.nombre?.trim() || 'sin nombre'}</option>)}
                  {sinBase && <option value={pctCargo.base}>(una partida que ya no está)</option>}
                </select>
                <button type="button" onClick={() => acc.cambiar(l.id, { cargo: null })} title="Deja el monto de hoy fijo: ya no se pone al día solo"
                  style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.66rem' }}>dejar el monto fijo</button>
              </> : <span>{porcentaje(pctCargo.pct)} de {pctCargo.base === 'total' ? 'toda la cotización' : pctCargo.base === 'mano_obra' ? 'la mano de obra y servicios'
                : `la partida ${(bases.find(b => b.x.id === pctCargo.base)?.i ?? -1) + 1 || '?'}`}</span>}
              {sinBase && <span style={{ color: '#d97706' }}>La partida base ya no está: quedó el monto de antes.</span>}
            </span>
          )}
          {esLigada && (l.cantidadAMano ? (
            <span>Cantidad a mano {editable && <button type="button" onClick={() => acc.religar(l.id)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.66rem' }}>↺ seguir al producto</button>}</span>
          ) : <span>{cantidadLegible(l.porUnidad || 1)} por cada {producto?.unidad || 'unidad'}</span>)}
        </div>
        {conMano && (
          <button type="button" onClick={onDesplegar} aria-expanded={desplegada}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.72rem', padding: '0.15rem 0.3rem', textAlign: 'left' }}>
            {desplegada ? '▾ Ocultar la instalación' : `▸ Incluye instalación: ${ligadas.map(m => m.descripcion).join(', ')}`}
          </button>
        )}
        {nueva && editable && !verCostos && !esCargo && (
          // Con los costos ocultos, el precio de lo nuevo sale de aquí.
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, paddingLeft: 4, alignItems: 'center', fontSize: '0.72rem', color: 'var(--muted)' }}>
            <span>Costo</span>
            <span style={{ width: 120 }}><CeldaNum valor={l.costo} onCambiar={v => acc.cambiar(l.id, { costo: v ?? 0 })} etiqueta="Costo unitario" prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} /></span>
            <QuitarIva l={l} moneda={moneda} onCosto={patch => acc.cambiar(l.id, patch)} />
            <span>Utilidad</span>
            <span style={{ width: 84 }}><CeldaNum valor={c?.margenReal} decimales={1} sufijo="%" etiqueta="Utilidad %" onCambiar={v => { if (v !== null) acc.cambiar(l.id, { ganancia: gananciaParaUtilidad(v, l.descuento) }); }} /></span>
          </div>
        )}
      </div>

      {/* Cantidad con su unidad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <NumeroInput className="input" min={0} decimales={3} disabled={!editable || !!pctCargo} value={l.cantidad} ariaLabel="Cantidad"
          onChange={v => acc.cantidad(l.id, v)} envoltura={{ width: 70 }} onKeyDown={siguienteCantidad}
          style={{ ...campoChico, textAlign: 'right', color: esLigada && !l.cantidadAMano ? 'var(--muted)' : undefined }} />
        {editable && nueva ? (
          <select value={l.unidad || 'un'} aria-label="Unidad" title="Unidad" onChange={e => acc.cambiar(l.id, { unidad: e.target.value })}
            className="input" style={{ ...campoChico, width: 78, padding: '0.35rem 0.3rem' }}>
            {unidades.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span title={l.unidad} style={{ width: 78, fontSize: '0.8rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 4 }}>{l.unidad}</span>
        )}
      </div>

      {/* Costo, margen y utilidad (o el precio unitario, con los costos ocultos). Un cargo: su monto, tal cual. */}
      {esCargo ? <>
        {editable && !pctCargo
          ? <CeldaNum valor={l.costo} etiqueta="Monto unitario del cargo (neto)" onCambiar={v => acc.cambiar(l.id, { costo: v ?? 0, ganancia: 0 })}
            prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} />
          : <span style={der} title={pctCargo ? 'Calculado: se pone al día solo' : undefined}>{formatMonto(c?.precio, moneda, true)}</span>}
        {verCostos && <span />}
      </> : verCostos ? (editable ? <>
        <div>
          <CeldaNum valor={l.costo} etiqueta={costoConIva ? 'Costo unitario con IVA incluido' : 'Costo unitario neto (no cambia la biblioteca)'} onCambiar={v => acc.ajustar(l.id, { costo: v ?? 0 })}
            prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <QuitarIva l={l} moneda={moneda} onCosto={patch => acc.ajustar(l.id, patch)} />
          </div>
        </div>
        <CeldaNum valor={c?.margenReal} decimales={1} sufijo="%" etiqueta="Utilidad: de lo que paga el cliente, qué parte queda para InnVolt" color={bajoCosto ? 'var(--danger)' : undefined}
          onCambiar={v => { if (v !== null) acc.ajustar(l.id, { ganancia: gananciaParaUtilidad(v, l.descuento) }); }} />
      </> : <>
        <span style={{ ...der, color: 'var(--muted)' }}>{formatMonto(l.costo, moneda, true)}{costoConIva && <span style={nota}>con IVA adentro</span>}</span>
        <span style={{ ...der, color: bajoCosto ? 'var(--danger)' : 'var(--muted)', fontWeight: bajoCosto ? 700 : 400 }}>{porcentaje(c?.margenReal)}</span>
      </>) : (
        <span style={der}>{formatMonto(c?.precio, moneda, true)}</span>
      )}

      {/* Subtotal: precio × cantidad, antes del descuento */}
      <span style={{ ...der, color: esLigada ? 'var(--muted)' : 'var(--text)' }}>
        {formatMonto(brutoFila, moneda)}
        {delGrupo && fila && <span style={nota}>con instalación</span>}
      </span>

      {/* Descuento */}
      <span>
        {esCargo ? (
          <span style={{ ...der, display: 'block', color: 'var(--muted)' }} title="Un cargo operacional no lleva descuento">—</span>
        ) : variosDesc ? (
          <button type="button" onClick={onDesplegar} title="El producto y su instalación llevan distinto descuento: despliégala para cambiar cada uno"
            style={{ width: '100%', border: '1px dashed var(--border2)', borderRadius: 6, background: 'none', fontSize: '0.72rem', color: 'var(--muted)', cursor: 'pointer', padding: '0.4rem 0.3rem' }}>varios</button>
        ) : (
          <NumeroInput className="input" min={0} max={100} sufijo="%" disabled={!editable} value={l.descuento || 0} ariaLabel="% de descuento"
            onChange={v => {
              if (delGrupo) [l, ...ligadas].forEach(x => acc.cambiar(x.id, { descuento: v })); else acc.cambiar(l.id, { descuento: v });
            }} style={{ ...campoChico, textAlign: 'right', ...(pasaMax ? rojo : {}) }}
            title={pasaMax ? `Con el de la partida queda en ${porcentaje(Math.round(descEfectivo * 10) / 10)}: pasa tu máximo (${porcentaje(descuentoMax)})` : undefined} />
        )}
      </span>

      {/* Total de la línea: con su descuento (neto; el IVA se suma en el total de la cotización) */}
      <span style={{ ...der, fontWeight: esLigada ? 400 : 700, color: esLigada ? 'var(--muted)' : 'var(--text)' }}>
        {formatMonto(netoFila, moneda)}
      </span>

      {/* IVA: lleva IVA o es exento */}
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, paddingTop: '0.35rem', cursor: editable ? 'pointer' : 'default' }}
        title={exenta ? 'Exento: va al total sin IVA. Márcalo para que lleve IVA 19 %' : 'Lleva IVA 19 %. Desmárcalo si es exento'}>
        <input type="checkbox" disabled={!editable} aria-label="Lleva IVA" checked={!exenta}
          onChange={e => {
            if (delGrupo) [l, ...ligadas].forEach(x => acc.cambiar(x.id, { iva: e.target.checked ? 19 : 0 }));
            else acc.cambiar(l.id, { iva: e.target.checked ? 19 : 0 });
          }}
          style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
        <span style={{ fontSize: '0.6rem', color: exenta ? '#d97706' : 'var(--muted)', whiteSpace: 'nowrap' }}>{exenta ? 'exento' : '19 %'}</span>
      </label>

      {/* Más acciones (y Quitar a la vista) */}
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {editable && (
          <MenuAcciones etiqueta="Más acciones de la línea" ancho={250}>
            {cerrar => (<>
              {!esLigada && <>
                <button type="button" style={opcion} disabled={primera} onClick={() => { cerrar(); acc.mover(l.id, -1); }}><ArrowUp size={13} style={iconoMenu} /> Subir</button>
                <button type="button" style={opcion} disabled={ultima} onClick={() => { cerrar(); acc.mover(l.id, 1); }}><ArrowDown size={13} style={iconoMenu} /> Bajar</button>
              </>}
              {!esLigada && partidas.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border2)', padding: '0.35rem 0' }}>
                  <span style={{ display: 'block', padding: '0.2rem 0.85rem', fontSize: '0.7rem', color: 'var(--muted)' }}>Mover a la partida…</span>
                  {partidas.map((x, i) => (
                    <button key={x.id} type="button" style={{ ...opcion, paddingLeft: '1.1rem', display: 'flex', alignItems: 'center' }} onClick={() => { cerrar(); acc.moverA(l.id, x.id); }}>
                      <CornerDownRight size={13} style={iconoMenu} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre?.trim() || `Partida sin nombre ${i + 1}`}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" style={{ ...opcion, borderTop: '1px solid var(--border2)', color: 'var(--danger)' }} onClick={() => { cerrar(); acc.quitar(l.id); }}>
                <Trash2 size={13} style={iconoMenu} /> {!esLigada && ligadas.length ? 'Quitar (con su instalación)' : 'Quitar'}</button>
            </>)}
          </MenuAcciones>
        )}
        {editable && (
          <button type="button" onClick={() => acc.quitar(l.id)} aria-label={!esLigada && ligadas.length ? 'Quitar la línea con su instalación' : 'Quitar la línea'}
            title={!esLigada && ligadas.length ? 'Quitar (con su instalación)' : 'Quitar'}
            className="cot-quitar-linea"
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--muted)', lineHeight: 0, borderRadius: 6 }}>
            <Trash2 size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

/** La ganancia (lo que se suma al costo) que deja esa utilidad después del descuento de la línea. */
function gananciaParaUtilidad(u: number, descuento?: number | null) {
  const x = Math.min(Math.max(u, 0), 95) / 100;
  const dto = Math.min(Math.max(descuento || 0, 0), 99.9) / 100;
  return (1 / ((1 - x) * (1 - dto)) - 1) * 100;
}

/**
 * El costo siempre es neto. Si el precio que se tiene es de mercado (con IVA), se escribe tal
 * cual y «quitar IVA» lo deja en neto (÷ 1,19), con la opción de volver atrás. Solo en materiales
 * que no vienen de la biblioteca (o se ajustaron aquí): la biblioteca ya guarda costos netos.
 */
function QuitarIva({ l, moneda, onCosto }: { l: Linea; moneda: Moneda; onCosto: (patch: Partial<Linea>) => void }) {
  const [antes, setAntes] = useState<{ con: number; sin: number } | null>(null);
  const costo = l.costo || 0;
  const sinIva = (v: number) => qp(v / (1 + IVA / 100), moneda);
  const enlace: React.CSSProperties = { background: 'none', border: 'none', padding: '0.1rem 0', cursor: 'pointer', color: 'var(--y)', fontSize: '0.66rem', whiteSpace: 'nowrap' };
  const nota: React.CSSProperties = { fontSize: '0.66rem', color: 'var(--muted)', textAlign: 'right', lineHeight: 1.35 };
  // Guardada antes con «costo con IVA» (ya no se marca así): se ofrece dejarla en neto.
  if (l.ivaIncluido && (l.iva ?? IVA) !== 0) {
    return (
      <span style={nota} title="Esta línea se guardó con el costo con IVA: se calcula con su neto">
        con IVA · neto {formatMonto(costo / (1 + IVA / 100), moneda, true)}{' '}
        {l.fuera && <button type="button" style={enlace} onClick={() => onCosto({ costo: sinIva(costo), ivaIncluido: false })}>dejar en neto</button>}
      </span>
    );
  }
  // Los precios de mercado con IVA son de materiales; la mano de obra y los servicios se escriben netos.
  if (!l.fuera || costo <= 0 || l.categoria !== 'material') return null;
  if (antes && antes.sin === costo) {
    return (
      <span style={nota}>era {formatMonto(antes.con, moneda, true)} con IVA ·{' '}
        <button type="button" style={enlace} title="Volver al costo que escribiste" onClick={() => { onCosto({ costo: antes.con }); setAntes(null); }}>deshacer</button>
      </span>
    );
  }
  return (
    <button type="button" style={enlace} title={`¿El costo trae IVA (precio de mercado)? Lo deja en neto: ${formatMonto(costo, moneda, true)} ÷ 1,19 = ${formatMonto(sinIva(costo), moneda, true)}`}
      onClick={() => { const sin = sinIva(costo); setAntes({ con: costo, sin }); onCosto({ costo: sin }); }}>quitar IVA</button>
  );
}

const iconoMenu: React.CSSProperties = { flexShrink: 0, marginRight: 8, color: 'var(--muted)' };
/** Un descuento que pasa el máximo de quien cotiza. */
const rojo: React.CSSProperties = { borderColor: 'var(--danger)', color: 'var(--danger)', fontWeight: 700 };
const opcion: React.CSSProperties = { ...opcionMenu, display: 'flex', alignItems: 'center' };

/** Texto de una línea que se ve entero: crece hacia abajo en vez de cortarse. */
function TextoQueCrece({ valor, onCambiar, disabled, placeholder, etiqueta, color }: {
  valor: string; onCambiar: (t: string) => void; disabled?: boolean; placeholder?: string; etiqueta: string; color: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
    ajustar();
    // También cuando cambia el ancho de la columna (ocultar costos, girar el teléfono…).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [valor]);
  return (
    <textarea ref={ref} rows={1} value={valor} disabled={disabled} maxLength={300} aria-label={etiqueta} placeholder={placeholder}
      onChange={e => onCambiar(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
      style={{ flex: 1, minWidth: 0, resize: 'none', overflow: 'hidden', background: 'transparent', border: '1px solid transparent', borderRadius: 6,
        padding: '0.15rem 0.3rem', fontSize: '0.86rem', lineHeight: 1.35, color, outline: 'none', fontFamily: 'inherit' }}
      onFocus={e => { e.currentTarget.style.borderColor = 'var(--border2)'; }} onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; }} />
  );
}

/** Un número de la tabla, con formato chileno (42.330 · 24,8): mientras se escribe se respeta el
 *  texto; al salir se ve formateado. Cada cambio válido se aplica al tiro. */
function CeldaNum({ valor, onCambiar, etiqueta, decimales = 4, vacio = false, color, prefijo, sufijo }: {
  valor: number | null | undefined; onCambiar: (v: number | null) => void; etiqueta: string;
  decimales?: number; vacio?: boolean; color?: string; prefijo?: string; sufijo?: string;
}) {
  return (
    <NumeroInput className="input" value={valor} mostrarCero decimales={decimales} min={0} ariaLabel={etiqueta} title={etiqueta}
      prefijo={prefijo} sufijo={sufijo}
      onChange={v => onCambiar(v)} onVacio={vacio ? () => onCambiar(null) : undefined}
      envoltura={{ alignSelf: 'start' }}
      style={{ ...campoChico, textAlign: 'right', color, fontWeight: color ? 700 : undefined }} />
  );
}
