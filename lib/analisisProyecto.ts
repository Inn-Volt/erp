/**
 * Análisis de proyecto (fase 22): todo el control de costos de un trabajo en una sola pantalla.
 * Solo cuentas, sin React ni Supabase (pruebas: tests/unit/analisisProyecto.test.ts).
 *
 *  · Para gastar = el presupuesto de ejecución (presupuesto_lineas); gastado = lo real (gastos
 *    rendidos, compras, mano de obra y horas de antes, los mismos movimientos de controlProyecto);
 *    queda = para gastar − gastado.
 *  · Margen proyectado = venta − Σ por partida el mayor entre lo presupuestado y lo gastado.
 *  · Resumen: partidas × tipos de costo; cada celda «gastado de presupuestado» con su semáforo
 *    (verde; amarillo desde el 90 %; rojo si se pasó).
 *  · Cada movimiento real va a UNA línea del presupuesto (nunca se cuenta dos veces):
 *      1. la que dice (el detalle de la boleta o factura, o el registro de mano de obra);
 *      2. mano de obra o servicio sin línea (los registros de antes): la línea de esa persona, en
 *         esa partida y del mismo tipo;
 *      3. operación sin línea (los gastos rendidos): la línea de operación de su partida;
 *      4. si no hay, queda «sin línea» en su partida: lo comprado que no estaba cotizado se muestra
 *         como adicional; una compra sin detalle, como tal.
 *  · Materiales: cotizado, comprado, pendiente (lo que falta para lo presupuestado) y de más.
 *    Mano de obra (por día): jornadas hechas y las que faltan; las horas de un interno valen su
 *    parte del día. Servicios (por hora): horas hechas y las que faltan.
 */

import { SIN_PARTIDA, TIPOS_COSTO, UMBRAL_ALERTA, nombreTipo, type ModalidadPago, type Movimiento, type Presupuesto, type TipoCosto } from '@/lib/controlProyecto';
import { totalLinea, type LineaPresupuesto } from '@/lib/anteproyecto';
import { costoExterno } from '@/lib/manoObra';

const n = (v: unknown) => Number(v) || 0;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CL');
/** Horas de una jornada cuando no se sabe la de la persona. */
export const HORAS_JORNADA = 9;

// ── Semáforo ────────────────────────────────────────────────────────────────
export type Semaforo = 'ok' | 'alerta' | 'sobre';
/** Rojo si lo gastado pasa lo presupuestado; amarillo desde el 90 %; si no, verde. */
export function semaforo(presupuesto: number, gastado: number): Semaforo {
  const p = Math.round(n(presupuesto)), g = Math.round(n(gastado));
  if (g > p) return 'sobre';
  if (p > 0 && g >= p * UMBRAL_ALERTA) return 'alerta';
  return 'ok';
}

// ── Entrada y salida ────────────────────────────────────────────────────────
/** Una línea del presupuesto (guardada o del borrador mientras se edita). */
export type LineaEntrada = LineaPresupuesto & { id?: string; clave: string };

export interface EntradaAnalisis {
  /** La cotización calculada: las partidas y su venta. */
  presupuesto: Presupuesto;
  lineas: LineaEntrada[];
  movimientos: Movimiento[];
  /** Cantidad de cada línea de la cotización (por su id): lo «cotizado» de cada material. */
  cotizado?: Record<string, number>;
  /** Horas de la jornada de cada persona del equipo (para pasar horas a días). */
  horasDia?: Record<string, number>;
  /** Para los nombres: categoría de gasto → nombre; id de usuario → nombre (horas de antes). */
  categorias?: Record<string, string>;
  nombres?: Record<string, string>;
}

export interface Celda { presupuesto: number; gastado: number; queda: number; estado: Semaforo }

export interface LineaAnalisis {
  linea: LineaEntrada;
  presupuesto: number; gastado: number; queda: number; estado: Semaforo;
  /** En la unidad de la línea. Material: lo comprado; mano de obra: jornadas; servicio: horas. */
  hecho: number;
  /** Lo que falta para la cantidad presupuestada. */
  pendiente: number;
  /** Lo hecho por sobre la cantidad presupuestada. */
  demas: number;
  /** La cantidad de la cotización (null = agregada en el presupuesto: no cotizada). */
  cotizado: number | null;
  movimientos: Movimiento[];
}

/** Lo real que no está en ninguna línea del presupuesto. */
export interface SinLinea {
  clave: string;
  partidaId: string;
  tipo: TipoCosto;
  /** Lo que dice el detalle, la persona, la categoría del gasto o el documento. */
  etiqueta: string;
  /** Una compra o un gasto sin detalle: no se sabe qué se compró. */
  sinDetalle: boolean;
  hecho: number; gastado: number;
  movimientos: Movimiento[];
}

export interface PartidaAnalisis {
  id: string; numero: number | null; nombre: string; venta: number;
  celdas: Record<TipoCosto, Celda>;
  total: Celda;
}

export interface AvisoAnalisis { clave: string; nivel: 'sobre' | 'alerta' | 'info'; texto: string }

export interface Analisis {
  venta: number;
  paraGastar: number; gastado: number; queda: number;
  margenProyectado: number; margenProyectadoPct: number | null;
  partidas: PartidaAnalisis[];
  porTipo: Record<TipoCosto, Celda>;
  total: Celda;
  lineas: LineaAnalisis[];
  sinLinea: SinLinea[];
  /** Operación: lo gastado por categoría (combustible, alimentación, peajes…). */
  operacionPorCategoria: { categoria: string; nombre: string; monto: number }[];
  paraMirar: AvisoAnalisis[];
}

const celda = (presupuesto: number, gastado: number): Celda => {
  const p = Math.round(presupuesto), g = Math.round(gastado);
  return { presupuesto: p, gastado: g, queda: p - g, estado: semaforo(p, g) };
};
const porTipoVacio = () => Object.fromEntries(TIPOS_COSTO.map(t => [t.clave, 0])) as Record<TipoCosto, number>;

/** Lo hecho de un movimiento en la unidad de la línea (días, horas o cantidad comprada). */
function hechoDe(m: Movimiento, tipoLinea: TipoCosto, horasDia: Record<string, number>): number {
  const jornada = (m.trabajadorId && n(horasDia[m.trabajadorId])) || HORAS_JORNADA;
  if (tipoLinea === 'mano_obra') return m.jornadas ?? (m.horas !== null ? m.horas / jornada : 0);
  if (tipoLinea === 'servicio') return m.horas ?? (m.jornadas !== null ? m.jornadas * jornada : 0);
  return n(m.cantidad);
}

export function analizar(e: EntradaAnalisis): Analisis {
  const { presupuesto: p, lineas } = e;
  const horasDia = e.horasDia || {};
  const ids = new Set(p.partidas.map(x => x.id));
  const partidaDe = (id: string | null | undefined) => (id && ids.has(id) ? id : SIN_PARTIDA);
  const etiquetaPartida = new Map<string, string>([...p.partidas.map(x => [x.id, `${x.numero}. ${x.nombre}`] as const), [SIN_PARTIDA, 'Sin partida']]);

  // 1. Cada movimiento a una línea (o «sin línea»).
  const porId = new Map(lineas.filter(l => l.id).map(l => [l.id!, l]));
  const deLinea = new Map<string, Movimiento[]>(lineas.map(l => [l.clave, []]));
  const sueltos: Movimiento[] = [];
  for (const m of e.movimientos) {
    const pm = partidaDe(m.partidaId);
    let l = m.presupuestoLineaId ? porId.get(m.presupuestoLineaId) : undefined;
    if (!l && m.origen === 'mano_obra' && m.trabajadorId) {
      l = lineas.find(x => x.tipo === m.tipo && x.trabajador_id === m.trabajadorId && partidaDe(x.partida_id) === pm);
    }
    if (!l && m.tipo === 'operacion' && !m.presupuestoLineaId) {
      l = lineas.find(x => x.tipo === 'operacion' && partidaDe(x.partida_id) === pm);
    }
    if (l) deLinea.get(l.clave)!.push(m);
    else sueltos.push(m);
  }

  // 2. Cada línea: presupuesto, gastado, hecho, pendiente.
  const lineasAn: LineaAnalisis[] = lineas.map(l => {
    const movs = deLinea.get(l.clave) || [];
    const pres = Math.round(totalLinea(l));
    const gastado = Math.round(movs.reduce((s, m) => s + m.monto, 0));
    const hecho = r3(movs.reduce((s, m) => s + hechoDe(m, l.tipo, horasDia), 0));
    const cant = n(l.cantidad);
    return {
      linea: l, presupuesto: pres, gastado, queda: pres - gastado, estado: semaforo(pres, gastado),
      hecho, pendiente: r3(Math.max(cant - hecho, 0)), demas: r3(Math.max(hecho - cant, 0)),
      cotizado: l.linea_id ? (e.cotizado?.[l.linea_id] ?? null) : null,
      movimientos: movs,
    };
  });

  // 3. Lo que no está en ninguna línea, agrupado.
  const grupos = new Map<string, SinLinea>();
  for (const m of sueltos) {
    const pm = partidaDe(m.partidaId);
    const sinDetalle = (m.origen === 'compra' || m.origen === 'gasto') && !m.detallado;
    const etiqueta = m.origen === 'mano_obra' ? m.quien
      : m.origen === 'hora' ? e.nombres?.[m.quien] || 'Horas de antes'
      : m.detallado ? m.detalle.trim() || 'Sin descripción'
      : m.origen === 'gasto' ? e.categorias?.[m.documento] || m.documento
      : `${m.documento} · ${m.quien}`;
    const clave = `${pm}|${m.tipo}|${sinDetalle ? 'sd:' : ''}${etiqueta.toLowerCase()}`;
    const g = grupos.get(clave) || { clave, partidaId: pm, tipo: m.tipo, etiqueta, sinDetalle, hecho: 0, gastado: 0, movimientos: [] };
    g.hecho = r3(g.hecho + hechoDe(m, m.tipo, horasDia));
    g.gastado += m.monto;
    g.movimientos.push(m);
    grupos.set(clave, g);
  }
  const sinLinea = [...grupos.values()].map(g => ({ ...g, gastado: Math.round(g.gastado) }));

  // 4. Resumen: partidas × tipos (lo gastado en la partida que dice cada movimiento).
  const plan = new Map<string, Record<TipoCosto, number>>(), real = new Map<string, Record<TipoCosto, number>>();
  const sumar = (m: Map<string, Record<TipoCosto, number>>, partida: string, tipo: TipoCosto, v: number) => {
    const fila = m.get(partida) || porTipoVacio();
    fila[tipo] += v;
    m.set(partida, fila);
  };
  for (const l of lineas) sumar(plan, partidaDe(l.partida_id), l.tipo, totalLinea(l));
  for (const m of e.movimientos) sumar(real, partidaDe(m.partidaId), m.tipo, m.monto);
  const filaDe = (id: string, numero: number | null, nombre: string, venta: number): PartidaAnalisis => {
    const pl = plan.get(id) || porTipoVacio(), re = real.get(id) || porTipoVacio();
    const celdas = Object.fromEntries(TIPOS_COSTO.map(t => [t.clave, celda(pl[t.clave], re[t.clave])])) as Record<TipoCosto, Celda>;
    const tp = Object.values(celdas).reduce((s, c) => s + c.presupuesto, 0), tg = Object.values(celdas).reduce((s, c) => s + c.gastado, 0);
    return { id, numero, nombre, venta, celdas, total: celda(tp, tg) };
  };
  const partidas = p.partidas.map(x => filaDe(x.id, x.numero, x.nombre, x.venta));
  const sin = filaDe(SIN_PARTIDA, null, 'Sin partida', p.sinPartida.venta);
  if (sin.venta || sin.total.presupuesto || sin.total.gastado) partidas.push(sin);
  const porTipo = Object.fromEntries(TIPOS_COSTO.map(t => [t.clave, celda(
    partidas.reduce((s, f) => s + f.celdas[t.clave].presupuesto, 0), partidas.reduce((s, f) => s + f.celdas[t.clave].gastado, 0),
  )])) as Record<TipoCosto, Celda>;
  const total = celda(partidas.reduce((s, f) => s + f.total.presupuesto, 0), partidas.reduce((s, f) => s + f.total.gastado, 0));

  // 5. Margen proyectado: cada partida cuesta lo mayor entre lo presupuestado y lo gastado.
  const venta = partidas.reduce((s, f) => s + f.venta, 0);
  const proyectado = partidas.reduce((s, f) => s + Math.max(f.total.presupuesto, f.total.gastado), 0);
  const margenProyectado = venta - proyectado;

  // 6. Operación por categoría.
  const cat = new Map<string, number>();
  for (const m of e.movimientos) {
    if (m.tipo !== 'operacion') continue;
    const k = m.origen === 'gasto' ? m.documento : m.origen === 'compra' ? 'compras' : m.origen;
    cat.set(k, (cat.get(k) || 0) + m.monto);
  }
  const operacionPorCategoria = [...cat].map(([categoria, monto]) => ({
    categoria, monto: Math.round(monto),
    nombre: categoria === 'compras' ? 'Compras a proveedores' : e.categorias?.[categoria] || categoria,
  })).sort((a, b) => b.monto - a.monto);

  // 7. Para mirar.
  const paraMirar: AvisoAnalisis[] = [];
  for (const f of partidas) {
    if (f.total.estado !== 'sobre') continue;
    const nombre = etiquetaPartida.get(f.id) || f.nombre;
    paraMirar.push({ clave: `p:${f.id}`, nivel: 'sobre', texto: f.total.presupuesto > 0
      ? `${nombre}: se pasó en ${fmt(-f.total.queda)} (${fmt(f.total.gastado)} de ${fmt(f.total.presupuesto)})`
      : `${nombre}: ${fmt(f.total.gastado)} gastados sin presupuesto` });
  }
  for (const t of TIPOS_COSTO) {
    const c = porTipo[t.clave];
    if (c.estado === 'sobre') paraMirar.push({ clave: `t:${t.clave}`, nivel: 'sobre', texto: `${nombreTipo(t.clave)}: se pasó en ${fmt(-c.queda)} (${fmt(c.gastado)} de ${fmt(c.presupuesto)})` });
  }
  const materiales = lineasAn.filter(x => x.linea.tipo === 'material');
  const pendientes = materiales.filter(x => x.pendiente > 0);
  if (pendientes.length) {
    const nombres = pendientes.slice(0, 3).map(x => x.linea.descripcion).join(', ');
    paraMirar.push({ clave: 'pendientes', nivel: 'info', texto: `${pendientes.length} ${pendientes.length === 1 ? 'material pendiente' : 'materiales pendientes'} de comprar: ${nombres}${pendientes.length > 3 ? '…' : ''}` });
  }
  for (const x of materiales.filter(y => y.demas > 0)) {
    paraMirar.push({ clave: `d:${x.linea.clave}`, nivel: 'alerta', texto: `${x.linea.descripcion}: se compró de más (${r3(x.demas).toLocaleString('es-CL')} ${x.linea.unidad || ''} sobre lo presupuestado)`.replace(/ \)/, ')') });
  }
  const adicional = sinLinea.filter(s => s.tipo === 'material' && !s.sinDetalle).reduce((s, x) => s + x.gastado, 0);
  if (adicional > 0) paraMirar.push({ clave: 'adicional', nivel: 'info', texto: `Materiales no cotizados (adicionales): ${fmt(adicional)}` });

  return {
    venta, paraGastar: total.presupuesto, gastado: total.gastado, queda: total.queda,
    margenProyectado, margenProyectadoPct: venta > 0 ? (margenProyectado / venta) * 100 : null,
    partidas, porTipo, total, lineas: lineasAn, sinLinea, operacionPorCategoria, paraMirar,
  };
}

/**
 * El saldo a favor del trabajo: lo que el cliente ya abonó, sin el IVA (ese va al SII), menos lo
 * gastado (que también va sin IVA: las compras con factura cuentan su neto). Negativo = se ha
 * gastado más de lo que ha entrado. `venta` (neta) y `total` (con IVA) son de la cotización, en pesos.
 * `ppmPct` (fase 25): el PPM que se descuenta del neto abonado, en % (lo define el contador).
 */
export function saldoAFavor(o: { abonado: number; venta: number; total: number; gastado: number; ppmPct?: number }) {
  const abonado = Math.round(n(o.abonado));
  const sinIva = n(o.total) > 0 ? Math.round(abonado * Math.min(n(o.venta) / n(o.total), 1)) : abonado;
  const ppm = Math.round((sinIva * Math.max(n(o.ppmPct), 0)) / 100);
  return { abonado, sinIva, ppm, saldo: sinIva - ppm - Math.round(n(o.gastado)) };
}

// ── Editar el presupuesto: mano de obra por día y servicios por hora ────────
/** Días de una línea de mano de obra (la cantidad es personas × días). */
export const diasDeLinea = (l: Pick<LineaPresupuesto, 'cantidad' | 'personas'>) => r3(n(l.cantidad) / (n(l.personas) || 1));

/** Lo que una persona del equipo trae para calcular (sin sueldos). */
export interface FichaCosto { costo_dia: number | null; horas_dia: number }

/** El costo por día (mano de obra) o por hora (servicio) de una línea, según su modalidad.
 *  null = no se puede calcular (interno sin ficha o sin permiso de ver su costo): queda el que tenía. */
export function valorDeLinea(
  l: Pick<LineaPresupuesto, 'tipo' | 'modalidad' | 'valor_liquido' | 'honorarios'>, ficha: FichaCosto | null, retencionPct: number,
): number | null {
  if (l.modalidad === 'interno') {
    if (!ficha || ficha.costo_dia === null) return null;
    return l.tipo === 'servicio' ? Math.round(ficha.costo_dia / (n(ficha.horas_dia) || HORAS_JORNADA)) : Math.round(ficha.costo_dia);
  }
  if (l.modalidad === 'externo') return costoExterno(n(l.valor_liquido), !!l.honorarios, retencionPct);
  if (l.modalidad === 'liquido') return Math.round(n(l.valor_liquido));
  return null;
}

/** Lo que va a costar un registro de mano de obra (lo mismo que calcula mano_obra_reglas en la base). */
export function costoRegistro(o: {
  modalidad: ModalidadPago; clase: 'mano_obra' | 'servicio';
  /** Días (mano de obra) u horas (servicio). */
  cantidad: number;
  /** Externo o líquido: lo que se paga por día u hora. */
  valor: number; honorarios: boolean;
}, ficha: FichaCosto | null, retencionPct: number): number {
  const cant = n(o.cantidad);
  if (o.modalidad === 'interno') {
    if (!ficha || ficha.costo_dia === null) return 0;
    return o.clase === 'servicio' ? Math.round((ficha.costo_dia * cant) / (n(ficha.horas_dia) || HORAS_JORNADA)) : Math.round(ficha.costo_dia * cant);
  }
  const liquido = Math.round(n(o.valor) * cant);
  return o.modalidad === 'externo' ? costoExterno(liquido, o.honorarios, retencionPct) : liquido;
}

// ── Excel ───────────────────────────────────────────────────────────────────
const NOMBRE_ESTADO: Record<Semaforo, string> = { ok: 'OK', alerta: 'ALERTA', sobre: 'SOBRE PRESUPUESTO' };

/** Las hojas del análisis para el Excel del trabajo: Análisis (partida × tipo) y Presupuesto (línea por línea). */
export function hojasAnalisis(a: Analisis, etiquetaPartida: (id: string | null) => string): { nombre: string; filas: Record<string, unknown>[] }[] {
  const filaPartida = (nombre: string, celdas: Record<TipoCosto, Celda>, t: Celda) => ({
    Partida: nombre,
    ...Object.fromEntries(TIPOS_COSTO.flatMap(x => [[`${x.nombre} presupuesto`, celdas[x.clave].presupuesto], [`${x.nombre} gastado`, celdas[x.clave].gastado]])),
    'Total presupuesto': t.presupuesto, 'Total gastado': t.gastado, Queda: t.queda, Estado: NOMBRE_ESTADO[t.estado],
  });
  return [
    {
      nombre: 'Análisis',
      filas: [
        ...a.partidas.map(f => filaPartida(f.numero === null ? f.nombre : `${f.numero}. ${f.nombre}`, f.celdas, f.total)),
        filaPartida('Total', a.porTipo, a.total),
      ],
    },
    {
      nombre: 'Presupuesto',
      filas: [
        ...a.lineas.map(x => ({
          Partida: etiquetaPartida(x.linea.partida_id), Tipo: nombreTipo(x.linea.tipo), Descripción: x.linea.descripcion,
          Cotizado: x.cotizado ?? 'No cotizado', Cantidad: n(x.linea.cantidad), Unidad: x.linea.unidad || '', 'Costo unitario': n(x.linea.costo_unitario),
          Presupuesto: x.presupuesto, Hecho: x.hecho, Pendiente: x.pendiente, 'De más': x.demas, Gastado: x.gastado, Queda: x.queda, Estado: NOMBRE_ESTADO[x.estado],
        })),
        ...a.sinLinea.map(s => ({
          Partida: etiquetaPartida(s.partidaId || null), Tipo: nombreTipo(s.tipo), Descripción: s.etiqueta,
          Cotizado: s.sinDetalle ? 'Sin detalle' : 'Adicional (sin línea)', Cantidad: '', Unidad: '', 'Costo unitario': '',
          Presupuesto: 0, Hecho: s.hecho, Pendiente: '', 'De más': '', Gastado: s.gastado, Queda: -s.gastado, Estado: '',
        })),
      ],
    },
  ];
}
