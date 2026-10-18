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
import { useState } from 'react';
import { Layers, Package, Plus } from 'lucide-react';
import BuscadorCatalogo from './BuscadorCatalogo';
import { MenuAcciones, opcionMenu, campoChico } from './ui';
import type { ArticuloCatalogo, Linea, Moneda, PartidaCot, QueVe, TipoPartida } from '@/lib/cotizador/tipos';
import { UNIDADES_PARTIDA } from '@/lib/cotizador/tipos';
import { CATEGORIA_COLORS, CATEGORIA_LABELS } from '@/types';
import { agrupar, cantidadLegible, filasDelCliente, formatMonto, porcentaje, type Resultado } from '@/lib/cotizador/calculo';
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

  const cols = `minmax(220px,1fr) 116px ${verCostos ? '124px 92px 92px ' : ''}${instalacion ? '100px 100px' : '108px'} 84px 112px 32px`;
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
            <div style={{ minWidth: verCostos ? 1080 : 760 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.4rem 0.7rem', borderBottom: '1px solid var(--border2)' }}>
                <span style={{ ...th, textAlign: 'left' }}>Descripción</span><span style={th}>Cant.</span>
                {verCostos && <><span style={th} title="Costo unitario">Costo unit.</span><span style={th} title="% sobre el costo">Ganancia</span><span style={th} title="% sobre lo que paga el cliente">Utilidad</span></>}
                {instalacion ? <><span style={th} title="Valor del producto por unidad">Equipo</span><span style={th} title="Mano de obra por unidad del producto">HH</span></> : <span style={th}>Precio</span>}
                <span style={th}>Desc.</span><span style={th}>Total</span><span />
              </div>
              {grupos.map((g, n) => {
                const conMano = instalacion && g.ligadas.length > 0;
                const desplegada = conMano && desplegadas.has(g.cabeza.id);
                const visibles = !instalacion || desplegada ? [g.cabeza, ...g.ligadas] : [g.cabeza];
                return (
                  <div key={g.cabeza.id} style={{ borderBottom: '1px solid var(--border2)' }}>
                    {visibles.map(l => (
                      <FilaLinea key={l.id} l={l} esLigada={l !== g.cabeza} cols={cols} instalacion={instalacion} calc={calc} moneda={moneda}
                        fila={instalacion && l === g.cabeza ? filas.get(l.id) : undefined} ligadas={l === g.cabeza ? g.ligadas : []}
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

function FilaLinea({ l, esLigada, cols, instalacion, calc, moneda, fila, ligadas, conMano, desplegada, onDesplegar, producto, verCostos, editable, primera, ultima, partidas, acc }: {
  l: Linea; esLigada: boolean; cols: string; instalacion: boolean; calc: Resultado; moneda: Moneda;
  fila?: ReturnType<typeof filasDelCliente>[number]; ligadas: Linea[]; conMano: boolean; desplegada: boolean; onDesplegar: () => void;
  producto: Linea | null; verCostos: boolean; editable: boolean; primera: boolean; ultima: boolean; partidas: PartidaCot[]; acc: AccionesLinea;
}) {
  const c = calc.lineas.get(l.id);
  const deAntes = !l.itemId && !l.fuera;
  const bajoCosto = c?.margenReal !== null && c?.margenReal !== undefined && c.margenReal < 0;
  // Plegada, el descuento del producto vale también para su mano de obra.
  const delGrupo = conMano && !desplegada;
  const variosDesc = delGrupo && ligadas.some(m => (m.descuento || 0) !== (l.descuento || 0));
  const netoFila = instalacion && !esLigada && fila ? fila.neto : c?.neto;
  const descFila = instalacion && !esLigada && fila ? fila.descuento : c?.descuento;
  const der: React.CSSProperties = { textAlign: 'right', fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', alignSelf: 'center' };
  const parte = (total: number | null | undefined, unit: number | null | undefined) =>
    total === null || total === undefined ? <span /> :
      unit !== null && unit !== undefined ? <span style={der}>{formatMonto(unit, moneda, true)}</span>
        : <span style={der} title="No da exacto por unidad: el PDF imprime «—» y el total">—<span style={{ display: 'block', fontSize: '0.66rem', color: 'var(--muted)' }}>suma {formatMonto(total, moneda)}</span></span>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.45rem 0.7rem', alignItems: 'start', background: esLigada ? 'var(--bg3)' : undefined,
      // Cada tipo con su color (como el cotizador de antes): material, mano de obra, servicio, operación.
      borderLeft: `3px solid ${CATEGORIA_COLORS[l.categoria] || 'transparent'}` }}>
      <div style={{ minWidth: 0, paddingLeft: esLigada ? 18 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {esLigada && <span style={{ color: 'var(--muted)' }}>↳</span>}
          <input value={l.descripcion} disabled={!editable} maxLength={300} aria-label="Descripción"
            onChange={e => acc.cambiar(l.id, { descripcion: e.target.value })}
            placeholder={l.fuera ? 'Qué es: soporte especial para lector' : 'Descripción'}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '0.15rem 0.3rem', fontSize: '0.86rem', color: esLigada ? 'var(--muted)' : 'var(--text)', outline: 'none' }} />
        </div>
        {conMano && (
          <button type="button" onClick={onDesplegar} aria-expanded={desplegada}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.72rem', padding: '0.1rem 0.3rem', textAlign: 'left' }}>
            {desplegada ? '▾' : '▸'} {ligadas.map(m => m.descripcion).join(', ')} · {cantidadLegible(ligadas[0]?.porUnidad || 1)} por unidad
          </button>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: '0.66rem', color: 'var(--muted)', paddingLeft: 4 }}>
          <span style={{ color: CATEGORIA_COLORS[l.categoria], border: `1px solid color-mix(in srgb, ${CATEGORIA_COLORS[l.categoria]} 40%, transparent)`, borderRadius: 4, padding: '0 4px', fontWeight: 700 }}>{CATEGORIA_LABELS[l.categoria]}</span>
          {l.codigo && (!l.fuera || l.ajustada) && <span style={{ fontFamily: 'monospace' }}>{l.codigo}</span>}
          {l.fuera && !l.ajustada && <span style={{ background: 'rgba(217,119,6,.15)', color: '#d97706', borderRadius: 4, padding: '0 4px', fontWeight: 600 }}>Fuera del catálogo</span>}
          {l.ajustada && <span style={{ background: 'var(--y-soft)', color: 'var(--text)', borderRadius: 4, padding: '0 4px', fontWeight: 600 }}
            title="El costo o la ganancia se cambiaron en esta cotización; la biblioteca sigue igual">Ajustado aquí
            {editable && l.itemId && <button type="button" onClick={() => acc.alCatalogo(l.id)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 400 }}>↺ volver al de la biblioteca</button>}
          </span>}
          {deAntes && <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '0 4px' }}>Línea de antes</span>}
          {(l.iva ?? 19) === 0 && <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '0 4px' }}>Exento de IVA</span>}
          {esLigada && (l.cantidadAMano ? (
            <span>Cantidad a mano {editable && <button type="button" onClick={() => acc.religar(l.id)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.66rem' }}>↺ seguir al producto</button>}</span>
          ) : <span>{cantidadLegible(l.porUnidad || 1)} por cada {producto?.unidad || 'unidad'}</span>)}
        </div>
        {l.fuera && !l.ajustada && editable && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, paddingLeft: 4, alignItems: 'flex-end' }}>
            {!verCostos && <>
              <label style={{ width: 130 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Costo unitario</span>
                <CeldaNum valor={l.costo} onCambiar={v => acc.cambiar(l.id, { costo: v ?? 0 })} etiqueta="Costo unitario" prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} /></label>
              <label style={{ width: 96 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Ganancia %</span>
                <CeldaNum valor={l.ganancia} decimales={1} sufijo="%" vacio onCambiar={v => acc.cambiar(l.id, { ganancia: v })} etiqueta="Ganancia %" /></label>
            </>}
            <label style={{ width: 80 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Unidad</span>
              <input className="input" style={campoChico} list="unidades-de-item" maxLength={20} value={l.unidad} onChange={e => acc.cambiar(l.id, { unidad: e.target.value })} /></label>
            <label style={{ width: 120 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Tipo</span>
              <select className="input" style={campoChico} value={l.categoria} onChange={e => acc.cambiar(l.id, { categoria: e.target.value as Linea['categoria'] })}>
                <option value="material">Material</option><option value="mano_obra">Mano de obra</option><option value="servicio">Servicio</option><option value="operacion">Operación</option>
              </select></label>
            {(l.costo || 0) > 0 && (l.ganancia === null || l.ganancia === undefined) && <span style={{ fontSize: '0.72rem', color: '#d97706', paddingBottom: 6 }}>Sin ganancia se vende a costo.</span>}
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)', paddingBottom: 6 }}>Solo en esta cotización: no se agrega a la biblioteca.</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
        <NumeroInput className="input" min={0} decimales={3} disabled={!editable} value={l.cantidad} ariaLabel="Cantidad"
          onChange={v => acc.cantidad(l.id, v)} envoltura={{ width: 62 }}
          style={{ ...campoChico, textAlign: 'right', color: esLigada && !l.cantidadAMano ? 'var(--muted)' : undefined }} />
        <span title={l.unidad} style={{ fontSize: '0.68rem', color: 'var(--muted)', width: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.unidad}</span>
      </div>
      {verCostos && (editable ? <>
        <CeldaNum valor={l.costo} etiqueta="Costo unitario (no cambia la biblioteca)" onCambiar={v => acc.ajustar(l.id, { costo: v ?? 0 })}
          prefijo={moneda === 'UF' ? 'UF' : '$'} decimales={moneda === 'UF' ? 4 : 0} />
        <CeldaNum valor={l.fuera ? l.ganancia : c?.ganancia} decimales={1} sufijo="%" vacio={!!l.fuera} etiqueta="Ganancia % sobre el costo (no cambia la biblioteca)"
          onCambiar={v => acc.ajustar(l.id, { ganancia: v })} />
        <CeldaNum valor={c?.margenReal} decimales={1} sufijo="%" etiqueta="Utilidad % sobre lo que paga el cliente" color={bajoCosto ? 'var(--danger)' : undefined}
          onCambiar={v => {
            if (v === null) return;
            // La ganancia que deja esa utilidad después del descuento de la línea.
            const u = Math.min(v, 99) / 100;
            const dto = Math.min(Math.max(l.descuento || 0, 0), 99.9) / 100;
            acc.ajustar(l.id, { ganancia: (1 / ((1 - u) * (1 - dto)) - 1) * 100 });
          }} />
      </> : <>
        <span style={{ ...der, color: 'var(--muted)' }}>{formatMonto(l.costo, moneda, true)}</span>
        <span style={{ ...der, color: 'var(--muted)' }}>{porcentaje(c?.ganancia)}</span>
        <span style={{ ...der, color: bajoCosto ? 'var(--danger)' : 'var(--muted)', fontWeight: bajoCosto ? 700 : 400 }}>{porcentaje(c?.margenReal)}</span>
      </>)}
      {instalacion ? (esLigada
        ? <><span /><span style={{ ...der, color: 'var(--muted)' }} title="Precio de la mano de obra por unidad">{formatMonto(c?.precio, moneda, true)}</span></>
        : <>{parte(fila?.equipo, fila?.equipoUnitario)}{parte(fila?.hh, fila?.hhUnitario)}</>)
        : <span style={der}>{formatMonto(c?.precio, moneda, true)}</span>}
      <span style={{ alignSelf: 'center' }}>
        {variosDesc ? (
          <button type="button" onClick={onDesplegar} title="El producto y su instalación llevan distinto descuento: despliégala para cambiar cada uno"
            style={{ width: '100%', border: '1px dashed var(--border2)', borderRadius: 6, background: 'none', fontSize: '0.72rem', color: 'var(--muted)', cursor: 'pointer', padding: '0.3rem' }}>varios</button>
        ) : (
          <NumeroInput className="input" min={0} max={100} sufijo="%" disabled={!editable} value={l.descuento || 0} ariaLabel="% de descuento"
            onChange={v => {
              if (delGrupo) [l, ...ligadas].forEach(x => acc.cambiar(x.id, { descuento: v })); else acc.cambiar(l.id, { descuento: v });
            }} style={{ ...campoChico, textAlign: 'right' }} />
        )}
      </span>
      <span style={{ ...der, fontWeight: esLigada && instalacion ? 400 : 700, color: esLigada && instalacion ? 'var(--muted)' : 'var(--text)' }}>
        {formatMonto(netoFila, moneda)}
        {(descFila || 0) > 0 && <span style={{ display: 'block', fontSize: '0.66rem', fontWeight: 400, color: 'var(--muted)' }}>− {formatMonto(descFila, moneda)}</span>}
      </span>
      <span>
        {editable && (
          <MenuAcciones etiqueta="Más acciones de la línea" ancho={240}>
            {cerrar => (<>
              <label style={{ ...opcionMenu, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={(l.iva ?? 19) === 0} onChange={e => acc.cambiar(l.id, { iva: e.target.checked ? 0 : 19 })} style={{ accentColor: 'var(--y-brand)' }} /> Exento de IVA
              </label>
              {!esLigada && <>
                <button type="button" style={{ ...opcionMenu, borderTop: '1px solid var(--border2)' }} disabled={primera} onClick={() => { cerrar(); acc.mover(l.id, -1); }}>↑ Subir</button>
                <button type="button" style={opcionMenu} disabled={ultima} onClick={() => { cerrar(); acc.mover(l.id, 1); }}>↓ Bajar</button>
              </>}
              {!esLigada && partidas.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border2)', padding: '0.5rem 0.85rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Mover a otra partida (al final)</span>
                  <select className="input" style={campoChico} value="" onChange={e => { if (e.target.value) acc.moverA(l.id, e.target.value); cerrar(); }}>
                    <option value="">Elegir…</option>
                    {partidas.map(x => <option key={x.id} value={x.id}>{x.nombre || 'Sin nombre'}</option>)}
                  </select>
                </div>
              )}
              <button type="button" style={{ ...opcionMenu, borderTop: '1px solid var(--border2)', color: 'var(--danger)' }} onClick={() => { cerrar(); acc.quitar(l.id); }}>
                {!esLigada && ligadas.length ? 'Quitar (con su mano de obra)' : 'Quitar'}</button>
            </>)}
          </MenuAcciones>
        )}
      </span>
    </div>
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
      envoltura={{ alignSelf: 'center' }}
      style={{ ...campoChico, textAlign: 'right', color, fontWeight: color ? 700 : undefined }} />
  );
}
