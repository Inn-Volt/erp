'use client';

/**
 * Agregar (o editar) un trabajo del cálculo en tres pasos, pensado para quien recién empieza:
 *   1. ¿Qué trabajo? — un trabajo tipo (trae las horas de mercado, el cargo y el ayudante) o un
 *      trabajo por horas.
 *   2. ¿Quién lo hace? — una persona del equipo (con su cargo) o la tarifa general del cargo.
 *   3. ¿Cuánto? — la cantidad y, si hace falta, las horas por unidad y el ayudante.
 * Lo avanzado (tipo de tarea y multiplicador) queda guardado en «Ajustes avanzados».
 */

import { useMemo, useState } from 'react';
import { Check, Clock, Search, SlidersHorizontal, UserRound } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { formatCLP } from '@/utils';
import { enUF, formatoHoras, formatoUF, tarifaHoyCLP, type Indicadores, type ParametrosHH } from '@/lib/hh/calculo';
import { faltaEnLinea, lineaVacia, tarifasDeLinea, totalesDe, type LineaHH } from '@/lib/hh/lineas';
import type { TrabajoTipoHH } from '@/services/hh';
import { Campo, Cantidad, Hoja, Interruptor } from './comun';
import { conApoyo, conCargo, conMultiplicador, conPersona, conTipo, conTrabajo, horasDeReferencia, iniciales, type Ayudas } from './catalogo';
import s from './hh.module.css';

const SIN_EXTRAS = { urgencia: false, materiales_clp: 0, margen_materiales: 0, traslado_uf: 0 };

export default function AgregarTrabajo({ ay, trabajos, inicial, ind, p, onGuardar, onCerrar }: {
  ay: Ayudas; trabajos: TrabajoTipoHH[]; inicial: LineaHH | null; ind: Indicadores; p: ParametrosHH;
  onGuardar: (l: LineaHH) => void; onCerrar: () => void;
}) {
  const editando = !!inicial;
  const [l, setL] = useState<LineaHH>(() => inicial ?? conPersona(lineaVacia(), ay.miPersona?.id ?? null, ay));
  const [elegido, setElegido] = useState(editando);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);

  const categorias = useMemo(() => [...new Set(trabajos.map(t => t.categoria))], [trabajos]);
  const q = busca.trim().toLowerCase();
  const encontrados = trabajos.filter(t => (!categoria || t.categoria === categoria) && (!q || `${t.nombre} ${t.categoria}`.toLowerCase().includes(q)));
  const trabajo = l.trabajo_tipo_id ? ay.trabajo.get(l.trabajo_tipo_id) : undefined;
  const cargosActivos = [...ay.cargo.values()].filter(c => c.activo);
  const opcionesCargo = l.persona_id ? ay.asignaciones(l.persona_id).map(a => ay.cargo.get(a.cargo_id)!).filter(Boolean) : cargosActivos;
  const tipos = [...ay.tipo.values()].filter(t => t.activo || t.clave === l.tipo_tarea_clave);
  const horasRef = horasDeReferencia(l);
  const unidad = l.unidad.trim() || 'unidad';
  const r = totalesDe([l], SIN_EXTRAS, ind, p).lineas[0];
  const tarifas = tarifasDeLinea(l, ind, p);
  const falta = !elegido ? 'elige el trabajo' : faltaEnLinea(l);
  const apoyoSugerido = trabajo?.cargo_apoyo_id ?? cargosActivos.find(c => /ayudante/i.test(c.nombre))?.id ?? cargosActivos[0]?.id ?? null;

  const elegirTrabajo = (id: string) => { setL(conTrabajo({ ...l, horas_reales: null }, id, ay)); setElegido(true); };
  const porHoras = () => {
    setL(conApoyo(conTipo({ ...l, trabajo_tipo_id: null, hh_referencia: null, descripcion: '', unidad: '', cantidad: 1, horas_reales: null }, null, ay), null, ay));
    setElegido(true);
  };
  const tarifaPersona = (personaId: string | null) => {
    const cargoId = personaId ? ay.cargoDe(personaId, l.cargo_id) : l.cargo_id;
    const c = cargoId ? ay.cargo.get(cargoId) : undefined;
    return c ? { cargo: c.nombre, clp: tarifaHoyCLP(ay.tarifaBase(personaId, c.id), c.moneda_base, ind, p) } : null;
  };

  return (
    <Hoja titulo={editando ? 'Editar trabajo' : 'Agregar trabajo'} onCerrar={onCerrar} ancho={640} pie={<>
      <div className={s.previa}>
        <b>{formatCLP(r.subtotal)}</b>
        <span>{formatoUF(enUF(r.subtotal, ind.uf))}{falta ? ` · Falta: ${falta}` : ''}</span>
      </div>
      <button className="btn btn-primary" disabled={!!falta} onClick={() => onGuardar(l)}>
        <Check size={15} /> {editando ? 'Guardar' : 'Agregar'}
      </button>
    </>}>

      {/* 1. ¿Qué trabajo? */}
      <section className={s.paso}>
        <p className={s.pasoTitulo}><span className={s.pasoNumero}>1</span> ¿Qué trabajo es?</p>
        {elegido ? (
          <div className={s.elegido}>
            {trabajo ? <Check size={16} aria-hidden /> : <Clock size={16} aria-hidden />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{trabajo ? trabajo.nombre : 'Trabajo por horas'}</b>
              <small>{trabajo ? `${trabajo.categoria} · lo normal: ${formatoHoras(trabajo.hh_referencia)} h por ${trabajo.unidad || 'unidad'}` : 'Tú pones las horas'}</small>
            </span>
            {!editando && <button className="btn btn-ghost btn-xs" onClick={() => setElegido(false)}>Cambiar</button>}
          </div>
        ) : (
          <>
            <div className={s.buscar}>
              <Search size={15} aria-hidden />
              <input className="input" autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar: tablero, punto de red, cámara…" aria-label="Buscar trabajo" />
            </div>
            <div className={s.chips} role="group" aria-label="Categorías">
              <button type="button" className={s.chip} aria-pressed={!categoria} onClick={() => setCategoria(null)}>Todas</button>
              {categorias.map(c => <button key={c} type="button" className={s.chip} aria-pressed={categoria === c} onClick={() => setCategoria(c)}>{c}</button>)}
            </div>
            <div className={s.lista}>
              <button type="button" className={s.opcion} onClick={porHoras}>
                <Clock size={18} aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span className={s.opcionTexto}><b>Trabajo por horas</b><small>No está en la lista: tú pones las horas</small></span>
              </button>
              {encontrados.map(t => {
                const ap = t.cargo_apoyo_id ? ay.cargo.get(t.cargo_apoyo_id) : undefined;
                return (
                  <button key={t.id} type="button" className={s.opcion} onClick={() => elegirTrabajo(t.id)}>
                    <span className={s.opcionTexto}>
                      {t.nombre}
                      <small>{formatoHoras(t.hh_referencia)} h por {t.unidad || 'unidad'} · {ay.cargo.get(t.cargo_principal_id)?.nombre ?? '—'}{ap ? ' + ayudante' : ''}</small>
                    </span>
                  </button>
                );
              })}
              {encontrados.length === 0 && <p className={s.ayuda} style={{ padding: 12 }}>Nada con esa búsqueda. Prueba «Trabajo por horas».</p>}
            </div>
          </>
        )}
      </section>

      {elegido && (
        <>
          {/* 2. ¿Quién lo hace? */}
          <section className={s.paso}>
            <p className={s.pasoTitulo}><span className={s.pasoNumero}>2</span> ¿Quién lo hace?</p>
            <div className={s.personas} role="radiogroup" aria-label="Quién lo hace">
              {ay.personasActivas.map(x => {
                const t = tarifaPersona(x.id);
                return (
                  <button key={x.id} type="button" role="radio" aria-checked={l.persona_id === x.id} className={s.persona}
                    onClick={() => setL(conPersona(l, x.id, ay))}>
                    <span className={s.avatar}>{iniciales(x.nombre)}</span>
                    <span>
                      <b style={{ fontSize: '0.86rem' }}>{x.id === ay.miPersona?.id ? `${x.nombre} (tú)` : x.nombre}</b>
                      <small>{t ? `${formatCLP(t.clp)}/h · ${t.cargo}` : 'Sin cargos HH'}</small>
                    </span>
                  </button>
                );
              })}
              <button type="button" role="radio" aria-checked={!l.persona_id} className={s.persona} onClick={() => setL(conPersona(l, null, ay))}>
                <span className={s.avatar}><UserRound size={16} /></span>
                <span><b style={{ fontSize: '0.86rem' }}>Tarifa general</b><small>Sin persona: la del cargo</small></span>
              </button>
            </div>
            {opcionesCargo.length > 1 || !l.cargo_id || (l.cargo_id && !opcionesCargo.some(c => c.id === l.cargo_id)) ? (
              <>
                <p className={s.ayuda}>{l.persona_id ? `¿Con cuál de sus cargos?` : 'Elige el cargo:'}</p>
                <div className={`${s.chips} ${s.chipsEnvueltas}`} role="radiogroup" aria-label="Cargo HH">
                  {opcionesCargo.map(c => (
                    <button key={c.id} type="button" role="radio" aria-checked={l.cargo_id === c.id} className={s.chip} onClick={() => setL(conCargo(l, c.id, ay))}>{c.nombre}</button>
                  ))}
                  {l.cargo_id && !opcionesCargo.some(c => c.id === l.cargo_id) && (
                    <button type="button" role="radio" aria-checked className={s.chip}>{l.cargo_nombre} (guardado)</button>
                  )}
                </div>
                {l.persona_id && opcionesCargo.length === 0 && (
                  <p className={s.ayuda}>Esta persona todavía no tiene cargos HH: asígnaselos en «Equipo» o usa la tarifa general.</p>
                )}
              </>
            ) : (
              <p className={s.ayuda}>Cargo: <b style={{ color: 'var(--text)' }}>{l.cargo_nombre}</b> · {formatCLP(tarifas.principal)}/h ({formatoUF(enUF(tarifas.principal, ind.uf))})</p>
            )}
            {trabajo && !l.persona_id && ay.personasCon(trabajo.cargo_principal_id).length === 0 && (
              <p className={s.ayuda}>Nadie del equipo tiene el cargo «{ay.cargo.get(trabajo.cargo_principal_id)?.nombre}»: se usa su tarifa general.</p>
            )}
          </section>

          {/* 3. ¿Cuánto? */}
          <section className={s.paso}>
            <p className={s.pasoTitulo}><span className={s.pasoNumero}>3</span> ¿Cuánto?</p>
            <div className={s.dosColumnas}>
              <Campo etiqueta={trabajo ? `Cantidad (${unidad})` : 'Cantidad'}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Cantidad grande valor={l.cantidad} min={0} onCambio={v => setL({ ...l, cantidad: v })} etiqueta="cantidad" />
                  {!trabajo && <input className="input" style={{ flex: 1, minWidth: 0 }} value={l.unidad} onChange={e => setL({ ...l, unidad: e.target.value })} placeholder="unidad (opcional)" aria-label="Unidad" />}
                </span>
              </Campo>
              <Campo etiqueta={trabajo ? `Horas por ${unidad}` : l.cantidad === 1 ? 'Horas' : 'Horas por unidad'}
                ayuda={horasRef !== null
                  ? (l.horas_reales === horasRef ? 'Lo normal en el mercado. Cámbialas si este trabajo es más simple o más complejo.'
                    : <>Lo normal: {formatoHoras(horasRef)} h. <button type="button" className="btn btn-ghost btn-xs" onClick={() => setL({ ...l, horas_reales: horasRef })}>Volver a lo normal</button></>)
                  : 'Las horas que de verdad te toma.'}>
                <NumeroInput className="input" value={l.horas_reales} min={0} decimales={2} onChange={v => setL({ ...l, horas_reales: v })}
                  onVacio={() => setL({ ...l, horas_reales: null })} sufijo="h" placeholder="Ej.: 3" ariaLabel="Horas" />
              </Campo>
            </div>
            {l.multiplicador !== 1 && (
              <p className={s.ayuda}>
                Se cobran <b style={{ color: 'var(--text)' }}>{formatoHoras(r.horasCobradas)} HH</b>: este tipo de trabajo se cobra a valor de mercado aunque con IA te tome menos.
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Interruptor activo={!!l.cargo_apoyo_id} etiqueta="Con ayudante" onChange={() => setL(l.cargo_apoyo_id ? conApoyo(l, null, ay)
                : conApoyo(l, apoyoSugerido, ay, trabajo?.cargo_apoyo_id ? trabajo.hh_apoyo : 0))} />
              <span style={{ fontSize: '0.88rem', color: 'var(--text)' }}>Con ayudante{l.cargo_apoyo_nombre ? ` (${l.cargo_apoyo_nombre})` : ''}</span>
              {l.cargo_apoyo_id && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <NumeroInput className="input input-sm" envoltura={{ width: 96 }} value={l.horas_apoyo} min={0} decimales={2} sufijo="h"
                    onChange={v => setL({ ...l, horas_apoyo: v })} ariaLabel="Horas del ayudante" />
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>por {unidad}</span>
                </span>
              )}
            </div>

            <Campo etiqueta="Cómo lo verá el cliente">
              <input className="input" value={l.descripcion} onChange={e => setL({ ...l, descripcion: e.target.value })} placeholder="Ej.: Instalación de 8 puntos de red" />
            </Campo>

            <details className={s.avanzado}>
              <summary><SlidersHorizontal size={14} aria-hidden /> Ajustes avanzados {l.multiplicador !== 1 ? `(× ${String(l.multiplicador).replace('.', ',')})` : ''}</summary>
              <div className={s.avanzadoCuerpo}>
                <p className={s.ayuda}>
                  El multiplicador sirve donde la IA te hace más rápido (software): trabajas menos horas y cobras las de mercado.
                  En terreno es × 1 (lo que trabajas es lo que se cobra).
                </p>
                <div className={s.dosColumnas}>
                  <Campo etiqueta="Tipo de tarea">
                    <select className="input" value={l.tipo_tarea_clave ?? ''} onChange={e => setL(conTipo(l, e.target.value || null, ay))}>
                      <option value="">Sin tipo (× 1)</option>
                      {tipos.map(t => <option key={t.clave} value={t.clave}>{t.nombre} (× {String(t.multiplicador).replace('.', ',')})</option>)}
                    </select>
                  </Campo>
                  <Campo etiqueta={l.multiplicador_editado ? 'Multiplicador (editado)' : 'Multiplicador'}>
                    <NumeroInput className="input" value={l.multiplicador} min={0} decimales={2} prefijo="×" onChange={v => setL(conMultiplicador(l, v, ay))} ariaLabel="Multiplicador" />
                  </Campo>
                </div>
                {l.cargo_apoyo_id && (
                  <Campo etiqueta="Cargo del ayudante">
                    <select className="input" value={l.cargo_apoyo_id} onChange={e => setL(conApoyo(l, e.target.value, ay))}>
                      {cargosActivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      {!cargosActivos.some(c => c.id === l.cargo_apoyo_id) && <option value={l.cargo_apoyo_id}>{l.cargo_apoyo_nombre} (guardado)</option>}
                    </select>
                  </Campo>
                )}
              </div>
            </details>
          </section>
        </>
      )}
    </Hoja>
  );
}
