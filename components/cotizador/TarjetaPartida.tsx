'use client';

/**
 * Una partida del presupuesto (TecApp): encabezado con número, nombre, tipo (instalación o
 * venta), total y menú; descripción para el cliente; «¿Qué quieres agregar?» (receta o
 * producto) y sus líneas. En una de instalación cada producto va con su mano de obra en
 * una fila (Equipo · HH), y la mano de obra se despliega con ▸.
 */

import { useState } from 'react';
import { Layers, Package } from 'lucide-react';
import BuscadorCatalogo from './BuscadorCatalogo';
import { MenuAcciones, opcionMenu, campoChico } from './ui';
import type { ArticuloCatalogo, Linea, Moneda, PartidaCot, QueVe, TipoPartida } from '@/lib/cotizador/tipos';
import { UNIDADES_PARTIDA } from '@/lib/cotizador/tipos';
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
  onDescuento: (pct: number) => void;
  onDeshacerReceta?: () => void;
}
export interface AccionesLinea {
  cambiar: (id: string, patch: Partial<Linea>) => void;
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

  const cols = `minmax(220px,1fr) 92px ${verCostos ? '86px 70px 70px ' : ''}${instalacion ? '96px 96px' : '100px'} 66px 108px 32px`;
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
            {!conDescripcion && p.descripcion ? <span style={{ color: 'var(--text)' }}>: {p.descripcion.split('\n')[0].slice(0, 90)}</span> : null}
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 120px', gap: 8, marginTop: 8 }}>
            <label><span className="label-muted" style={{ display: 'block', fontSize: '0.7rem' }} title="Para el valor unitario del PDF: «3 puertas»">Cantidad</span>
              <input className="input" style={campoChico} type="number" min={0} step="any" disabled={!editable} value={p.cantidad}
                onChange={e => acciones.onCambiar({ cantidad: num(e.target.value) })} /></label>
            <label><span className="label-muted" style={{ display: 'block', fontSize: '0.7rem' }}>Unidad</span>
              <input className="input" style={campoChico} list="unidades-de-partida" maxLength={20} disabled={!editable} value={p.unidad}
                onChange={e => acciones.onCambiar({ unidad: e.target.value })} /></label>
          </div>
          <textarea className="input" rows={3} disabled={!editable} value={p.descripcion || ''} style={{ marginTop: 8, fontSize: '0.86rem' }}
            onChange={e => acciones.onCambiar({ descripcion: e.target.value })}
            placeholder="Lo que lee el cliente bajo el nombre (en el PDF va a todo el ancho). **negrita** con dos asteriscos." />
          <datalist id="unidades-de-partida">{UNIDADES_PARTIDA.map(u => <option key={u} value={u} />)}</datalist>
        </details>

        {editable && (
          <div style={{ marginTop: 10 }}>
            {modo === null ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text)', fontWeight: 600 }}>¿Qué quieres agregar?</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModo('receta')}><Layers size={13} /> Una receta</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModo('producto')}><Package size={13} /> Un producto o servicio</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, padding: 2 }}>
                  {(['producto', 'receta'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setModo(m)} className="btn btn-xs"
                      style={{ background: modo === m ? 'var(--y-brand)' : 'transparent', color: modo === m ? '#111' : 'var(--muted)' }}>
                      {m === 'producto' ? 'Producto' : 'Receta'}</button>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  {modo === 'producto' ? (
                    <BuscadorCatalogo catalogo={props.catalogo} moneda={moneda} valorUf={valorUf} autoFocus={lineas.length === 0 && !!props.recienCreada}
                      onElegir={acciones.onArticulo} onFuera={acciones.onFuera} onBuscarReceta={t => { setBuscaReceta(t); setModo('receta'); }} />
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input className="input" value={buscaReceta} onChange={e => setBuscaReceta(e.target.value)} placeholder="Busca una receta…" autoFocus />
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
            <div style={{ minWidth: verCostos ? 900 : 680 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.4rem 0.7rem', borderBottom: '1px solid var(--border2)' }}>
                <span style={{ ...th, textAlign: 'left' }}>Descripción</span><span style={th}>Cant.</span>
                {verCostos && <><span style={th}>Costo</span><span style={th} title="Sobre el costo">Ganancia</span><span style={th} title="Sobre lo que paga el cliente">Utilidad</span></>}
                {instalacion ? <><span style={th} title="Valor del producto por unidad">Equipo</span><span style={th} title="Mano de obra por unidad del producto">HH</span></> : <span style={th}>Precio</span>}
                <span style={th}>Desc. %</span><span style={th}>Total</span><span />
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
              <input className="input" type="number" min={0} max={100} step="any" value={descPartida} onChange={e => setDescPartida(e.target.value)}
                aria-label="Descuento a toda la partida" style={{ ...campoChico, width: 64 }} /> %
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
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0.45rem 0.7rem', alignItems: 'start', background: esLigada ? 'var(--bg3)' : undefined }}>
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
          {l.codigo && !l.fuera && <span style={{ fontFamily: 'monospace' }}>{l.codigo}</span>}
          {l.fuera && <span style={{ background: 'rgba(217,119,6,.15)', color: '#d97706', borderRadius: 4, padding: '0 4px', fontWeight: 600 }}>Fuera del catálogo</span>}
          {deAntes && <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '0 4px' }}>Línea de antes</span>}
          {(l.iva ?? 19) === 0 && <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '0 4px' }}>Exento de IVA</span>}
          {esLigada && (l.cantidadAMano ? (
            <span>Cantidad a mano {editable && <button type="button" onClick={() => acc.religar(l.id)} style={{ background: 'none', border: 'none', color: 'var(--y)', cursor: 'pointer', fontSize: '0.66rem' }}>↺ seguir al producto</button>}</span>
          ) : <span>{cantidadLegible(l.porUnidad || 1)} por cada {producto?.unidad || 'unidad'}</span>)}
        </div>
        {l.fuera && editable && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, paddingLeft: 4, alignItems: 'flex-end' }}>
            <label style={{ width: 110 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Costo unitario</span>
              <input className="input" style={campoChico} type="number" min={0} step="any" value={l.costo || ''} onChange={e => acc.cambiar(l.id, { costo: num(e.target.value) })} /></label>
            <label style={{ width: 80 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Ganancia %</span>
              <input className="input" style={campoChico} type="number" min={0} step="any" value={l.ganancia ?? ''}
                onChange={e => acc.cambiar(l.id, { ganancia: e.target.value.trim() === '' ? null : num(e.target.value) })} /></label>
            <label style={{ width: 80 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Unidad</span>
              <input className="input" style={campoChico} list="unidades-de-item" maxLength={20} value={l.unidad} onChange={e => acc.cambiar(l.id, { unidad: e.target.value })} /></label>
            <label style={{ width: 120 }}><span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Tipo</span>
              <select className="input" style={campoChico} value={l.categoria} onChange={e => acc.cambiar(l.id, { categoria: e.target.value as Linea['categoria'] })}>
                <option value="material">Material</option><option value="mano_obra">Mano de obra</option><option value="servicio">Servicio</option><option value="operacion">Operación</option>
              </select></label>
            {(l.costo || 0) > 0 && (l.ganancia === null || l.ganancia === undefined) && <span style={{ fontSize: '0.72rem', color: '#d97706', paddingBottom: 6 }}>Sin ganancia se vende a costo.</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
        <input className="input" type="number" min={0} step="any" disabled={!editable} value={l.cantidad} aria-label="Cantidad"
          onChange={e => acc.cantidad(l.id, num(e.target.value))}
          style={{ ...campoChico, width: 62, textAlign: 'right', color: esLigada && !l.cantidadAMano ? 'var(--muted)' : undefined }} />
        <span style={{ fontSize: '0.66rem', color: 'var(--muted)', width: 22, overflow: 'hidden' }}>{l.unidad}</span>
      </div>
      {verCostos && <>
        <span style={{ ...der, color: 'var(--muted)' }}>{formatMonto(l.costo, moneda, true)}</span>
        <span style={{ ...der, color: 'var(--muted)' }}>{porcentaje(c?.ganancia)}</span>
        <span style={{ ...der, color: bajoCosto ? 'var(--danger)' : 'var(--muted)', fontWeight: bajoCosto ? 700 : 400 }}>{porcentaje(c?.margenReal)}</span>
      </>}
      {instalacion ? (esLigada
        ? <><span /><span style={{ ...der, color: 'var(--muted)' }} title="Precio de la mano de obra por unidad">{formatMonto(c?.precio, moneda, true)}</span></>
        : <>{parte(fila?.equipo, fila?.equipoUnitario)}{parte(fila?.hh, fila?.hhUnitario)}</>)
        : <span style={der}>{formatMonto(c?.precio, moneda, true)}</span>}
      <span style={{ alignSelf: 'center' }}>
        {variosDesc ? (
          <button type="button" onClick={onDesplegar} title="El producto y su instalación llevan distinto descuento: despliégala para cambiar cada uno"
            style={{ width: '100%', border: '1px dashed var(--border2)', borderRadius: 6, background: 'none', fontSize: '0.72rem', color: 'var(--muted)', cursor: 'pointer', padding: '0.3rem' }}>varios</button>
        ) : (
          <input className="input" type="number" min={0} max={100} step="any" disabled={!editable} value={l.descuento || ''} aria-label="% de descuento"
            onChange={e => {
              const v = Math.min(Math.max(num(e.target.value), 0), 100);
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
