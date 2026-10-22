'use client';

/**
 * Una partida del presupuesto (TecApp): encabezado con número, nombre, tipo (instalación o
 * venta), total y menú; descripción para el cliente; «¿Qué quieres agregar?» (receta o
 * producto) y sus líneas. En una de instalación cada producto va con su mano de obra en
 * una fila (Equipo · HH), y la mano de obra se despliega con ▸.
 */

import EditorFormato from '@/components/EditorFormato';
import NumeroInput from '@/components/NumeroInput';
import { textoPlano } from '@/lib/textoFormato';
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, Layers, Package, Plus, Trash2 } from 'lucide-react';
import BuscadorCatalogo from './BuscadorCatalogo';
import { MenuAcciones, opcionMenu, campoChico } from './ui';
import type { ArticuloCatalogo, Linea, Moneda, PartidaCot, QueVe, TipoPartida } from '@/lib/cotizador/tipos';
import { IVA, UNIDADES_ITEM, UNIDADES_PARTIDA } from '@/lib/cotizador/tipos';
import { CATEGORIA_COLORS, CATEGORIA_LABELS } from '@/types';
import { agrupar, cantidadLegible, filasDelCliente, formatMonto, porcentaje, qm, type Resultado } from '@/lib/cotizador/calculo';
import type { RecetaCompleta } from '@/lib/cotizador/recetas';

export interface AccionesPartida {
  onCambiar: (patch: Partial<PartidaCot>) => void;
  onTipo: (t: TipoPartida) => void;
  onQuitar: () => void;
  onMover: (dir: -1 | 1) => void;
  onAgregarDebajo: (t: TipoPartida) => void;
  onArticulo: (a: ArticuloCatalogo) => void;
  onFuera: (texto: string) => void;
  onReceta: (r: RecetaCompleta) => void;
  /** Armar una receta nueva desde aquí (sin ir a la Biblioteca). */
  onRecetaNueva?: () => void;
  onDescuento: (pct: number) => void;
  onDeshacerReceta?: () => void;
  onTraslado?: () => void;
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
}) {
  const { partida: p, indice, total, lineas, calc, moneda, valorUf, queVe, verCostos, editable, acciones, lineaAcc } = props;
  const instalacion = (p.tipo || 'instalacion') === 'instalacion';
  const [modo, setModo] = useState<null | 'receta' | 'producto'>(lineas.length ? 'producto' : null);
  const [buscaReceta, setBuscaReceta] = useState('');
  // Al elegir «producto», el cursor va directo al buscador.
  const [modoElegido, setModoElegido] = useState(false);
  const [conDescripcion, setConDescripcion] = useState(!!p.descripcion);
  const [descPartida, setDescPartida] = useState('');
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
          onChange={e => acciones.onCambiar({ nombre: e.target.value })} placeholder="Nombre de la partida: Tablero piso 2"
          aria-label="Nombre de la partida"
          style={{ flex: 1, minWidth: 160, background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '0.3rem 0.4rem', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', outline: 'none' }} />
        <div role="group" aria-label="Tipo de partida" style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, padding: 2, background: 'var(--bg2)' }}>
          {(['instalacion', 'venta'] as const).map(t => (
            <button key={t} type="button" disabled={!editable} aria-pressed={(p.tipo || 'instalacion') === t}
              onClick={() => (p.tipo || 'instalacion') !== t && acciones.onTipo(t)}
              title={t === 'instalacion' ? 'Cada producto trae su mano de obra, ligada a él' : 'Venta de producto: solo el producto, sin mano de obra'}
              style={{ border: 'none', borderRadius: 6, padding: '0.2rem 0.55rem', fontSize: '0.72rem', fontWeight: 600, cursor: editable ? 'pointer' : 'default',
                background: (p.tipo || 'instalacion') === t ? 'var(--y-brand)' : 'transparent', color: (p.tipo || 'instalacion') === t ? '#111' : 'var(--muted)' }}>
              {t === 'instalacion' ? 'Instalación' : 'Venta'}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.86rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Total </span><b>{formatMonto(neto, moneda)}</b>
        </span>
        {editable && (
          <MenuAcciones etiqueta={`Acciones de la partida ${indice + 1}`} ancho={260}>
            {cerrar => (<>
              <button type="button" style={opcionMenu} onClick={() => { cerrar(); acciones.onAgregarDebajo('instalacion'); }}>Agregar partida de instalación debajo</button>
              <button type="button" style={opcionMenu} onClick={() => { cerrar(); acciones.onAgregarDebajo('venta'); }}>Agregar partida de venta debajo</button>
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
              etiqueta="Descripción para el cliente" placeholder="Lo que lee el cliente bajo el nombre (en el PDF va a todo el ancho)." />
          </div>
          <datalist id="unidades-de-partida">{UNIDADES_PARTIDA.map(u => <option key={u} value={u} />)}</datalist>
        </details>

        {editable && (
          <div style={{ marginTop: 10 }}>
            {modo === null ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text)', fontWeight: 600 }}>¿Qué quieres agregar?</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModo('receta')}><Layers size={13} /> Una receta</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('producto'); setModoElegido(true); }}><Package size={13} /> Un producto o servicio</button>
                <button type="button" className="btn btn-ghost btn-sm" title="Algo que no está en la biblioteca: solo para esta cotización"
                  onClick={() => { setModo('producto'); acciones.onFuera(''); }}><Plus size={13} /> Uno nuevo (sin biblioteca)</button>
              </div>
            ) : (
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
              {!editable ? 'Sin líneas.' : modo === null ? 'Aquí quedan las líneas: elige arriba si agregas una receta o un producto.'
                : instalacion ? 'Busca arriba lo que lleva: cada producto trae su instalación.' : 'Busca arriba los productos que se venden.'}
            </p>
          ) : (
            <div style={{ minWidth: verCostos ? 1040 : 820 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border2)', borderLeft: '3px solid transparent' }}>
                <span style={{ ...th, textAlign: 'left' }}>Descripción</span>
                <span style={{ ...th, textAlign: 'left' }}>Cantidad</span>
                {verCostos
                  ? <><span style={th} title="Costo por unidad (neto; o con IVA si lo marcas: precio de mercado)">Costo unit.</span>
                    <span style={th} title="De lo que paga el cliente (neto), qué parte queda para InnVolt">Utilidad</span></>
                  : <span style={th} title="Precio neto por unidad">Precio unit.</span>}
                <span style={th} title="Precio × cantidad, antes del descuento">Subtotal</span>
                <span style={th}>Desc.</span>
                <span style={th} title="Lo que suma la línea, con su descuento (neto, sin IVA)">Total</span>
                <span style={{ ...th, textAlign: 'center' }} title="Marcado: lleva IVA (se le suma el 19 % al final). Sin marcar: exento">IVA</span>
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
                        partidas={props.partidas.filter(x => x.id !== p.id)} acc={lineaAcc} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.4rem 1.2rem', marginTop: 8, fontSize: '0.76rem', color: 'var(--muted)' }}>
          {editable && lineas.length > 1 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Descuento a toda la partida
              <NumeroInput className="input" min={0} max={100} value={descPartida === '' ? null : num(descPartida)} mostrarCero
                onChange={v => setDescPartida(String(v))} onVacio={() => setDescPartida('')}
                ariaLabel="Descuento a toda la partida" envoltura={{ width: 64 }} style={{ ...campoChico }} /> %
              <button type="button" className="btn btn-ghost btn-xs" disabled={descPartida.trim() === ''}
                onClick={() => { acciones.onDescuento(Math.min(Math.max(num(descPartida), 0), 100)); setDescPartida(''); }}>Aplicar</button>
            </span>
          ) : <span />}
          {queVe === 'partidas' && pc && lineas.length > 0 && (Number(p.cantidad) !== 1 || p.unidad !== 'global') && (
            <span>{pc.valorUnitario !== null
              ? <>Valor unitario: {formatMonto(pc.valorUnitario, moneda, true)} × {cantidadLegible(p.cantidad)} {p.unidad}</>
              : <span style={{ color: '#d97706' }} title="El PDF imprime la cantidad como texto y solo el total">El valor unitario no da exacto: el PDF dirá «{cantidadLegible(p.cantidad)} {p.unidad}» y solo el total</span>}
            </span>
          )}
          {verCostos && lineas.length > 0 && (
            <span>Costo {formatMonto(costo, moneda)} · Utilidad {formatMonto(utilidad, moneda)}{neto > 0 ? ` (${porcentaje(Math.round((utilidad / neto) * 1000) / 10)})` : ''}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaLinea({ l, esLigada, cols, calc, moneda, fila, ligadas, conMano, desplegada, onDesplegar, producto, verCostos, editable, primera, ultima, partidas, acc }: {
  l: Linea; esLigada: boolean; cols: string; calc: Resultado; moneda: Moneda;
  fila?: ReturnType<typeof filasDelCliente>[number]; ligadas: Linea[]; conMano: boolean; desplegada: boolean; onDesplegar: () => void;
  producto: Linea | null; verCostos: boolean; editable: boolean; primera: boolean; ultima: boolean; partidas: PartidaCot[]; acc: AccionesLinea;
}) {
  const c = calc.lineas.get(l.id);
  const deAntes = !l.itemId && !l.fuera;
  const nueva = !!l.fuera && !l.ajustada;
  const exenta = (l.iva ?? 19) === 0;
  const conIvaAdentro = !!l.ivaIncluido && !exenta;
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
            <select value={l.categoria} aria-label="Tipo" title="Tipo: cambia el color y cómo se calcula el IVA"
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
        {nueva && editable && !verCostos && (
          // Con los costos ocultos, el precio de lo nuevo sale de aquí.
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, paddingLeft: 4, alignItems: 'center', fontSize: '0.72rem', color: 'var(--muted)' }}>
            <span>Costo</span>
            <span style={{ width: 120 }}><CeldaNum valor={l.costo} onCambiar={v => acc.cambiar(l.id, { costo: v ?? 0 })} etiqueta="Costo unitario" prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} /></span>
            <ConIva l={l} acc={acc} />
            <span>Utilidad</span>
            <span style={{ width: 84 }}><CeldaNum valor={c?.margenReal} decimales={1} sufijo="%" etiqueta="Utilidad %" onCambiar={v => { if (v !== null) acc.cambiar(l.id, { ganancia: gananciaParaUtilidad(v, l.descuento) }); }} /></span>
          </div>
        )}
      </div>

      {/* Cantidad con su unidad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <NumeroInput className="input" min={0} decimales={3} disabled={!editable} value={l.cantidad} ariaLabel="Cantidad"
          onChange={v => acc.cantidad(l.id, v)} envoltura={{ width: 70 }}
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

      {/* Costo, margen y utilidad (o el precio unitario, con los costos ocultos) */}
      {verCostos ? (editable ? <>
        <div>
          <CeldaNum valor={l.costo} etiqueta={conIvaAdentro ? 'Costo unitario con IVA incluido' : 'Costo unitario neto (no cambia la biblioteca)'} onCambiar={v => acc.ajustar(l.id, { costo: v ?? 0 })}
            prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} />
          {nueva ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}><ConIva l={l} acc={acc} neto={conIvaAdentro ? formatMonto((l.costo || 0) / 1.19, moneda, true) : null} /></div>
            : conIvaAdentro && <span style={{ ...nota, textAlign: 'right', marginTop: 2 }}>con IVA · neto {formatMonto((l.costo || 0) / 1.19, moneda, true)}</span>}
        </div>
        <CeldaNum valor={c?.margenReal} decimales={1} sufijo="%" etiqueta="Utilidad: de lo que paga el cliente, qué parte queda para InnVolt" color={bajoCosto ? 'var(--danger)' : undefined}
          onCambiar={v => { if (v !== null) acc.ajustar(l.id, { ganancia: gananciaParaUtilidad(v, l.descuento) }); }} />
      </> : <>
        <span style={{ ...der, color: 'var(--muted)' }}>{formatMonto(l.costo, moneda, true)}</span>
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
        {variosDesc ? (
          <button type="button" onClick={onDesplegar} title="El producto y su instalación llevan distinto descuento: despliégala para cambiar cada uno"
            style={{ width: '100%', border: '1px dashed var(--border2)', borderRadius: 6, background: 'none', fontSize: '0.72rem', color: 'var(--muted)', cursor: 'pointer', padding: '0.4rem 0.3rem' }}>varios</button>
        ) : (
          <NumeroInput className="input" min={0} max={100} sufijo="%" disabled={!editable} value={l.descuento || 0} ariaLabel="% de descuento"
            onChange={v => {
              if (delGrupo) [l, ...ligadas].forEach(x => acc.cambiar(x.id, { descuento: v })); else acc.cambiar(l.id, { descuento: v });
            }} style={{ ...campoChico, textAlign: 'right' }} />
        )}
      </span>

      {/* Total de la línea: con su descuento (neto; el IVA se suma al final de la cotización) */}
      <span style={{ ...der, fontWeight: esLigada ? 400 : 700, color: esLigada ? 'var(--muted)' : 'var(--text)' }}>
        {formatMonto(netoFila, moneda)}
        {!exenta && !esLigada && <span style={nota}>+ IVA {formatMonto(qm(((netoFila || 0) * IVA) / 100, moneda), moneda)}</span>}
      </span>

      {/* IVA: lleva IVA (se suma al final) o es exento */}
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, paddingTop: '0.35rem', cursor: editable ? 'pointer' : 'default' }}
        title="Marcado: lleva IVA (se le suma el 19 % en el total). Sin marcar: exento (va al total sin IVA)">
        <input type="checkbox" disabled={!editable} aria-label="Lleva IVA" checked={!exenta}
          onChange={e => {
            if (delGrupo) [l, ...ligadas].forEach(x => acc.cambiar(x.id, { iva: e.target.checked ? 19 : 0 }));
            else acc.cambiar(l.id, { iva: e.target.checked ? 19 : 0 });
          }}
          style={{ accentColor: 'var(--y-brand)', width: 16, height: 16 }} />
        <span style={{ fontSize: '0.6rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{exenta ? 'exento' : 'con IVA'}</span>
      </label>

      {/* Más acciones */}
      <span>
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

/** «Costo con IVA»: el costo escrito es un precio de mercado con IVA; se calcula con su neto. */
function ConIva({ l, acc, neto }: { l: Linea; acc: AccionesLinea; neto?: string | null }) {
  return (
    <label title="Marca si el costo que escribiste trae IVA (precio de mercado): se calcula con el neto (÷ 1,19)"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: l.ivaIncluido ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={!!l.ivaIncluido} onChange={e => acc.cambiar(l.id, { ivaIncluido: e.target.checked })} style={{ accentColor: 'var(--y-brand)', width: 13, height: 13 }} />
      con IVA{neto ? ` · neto ${neto}` : ''}
    </label>
  );
}

const iconoMenu: React.CSSProperties = { flexShrink: 0, marginRight: 8, color: 'var(--muted)' };
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
