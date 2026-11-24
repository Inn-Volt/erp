/**
 * Calculadora HH (fase 23): una línea del cálculo tal como se edita en la pantalla y como se guarda.
 * Cada línea lleva una foto (snapshot) de la persona y del cargo: nombre, moneda y tarifa base. Así
 * un cálculo guardado no cambia aunque después cambien la UF, las tarifas o se desactive el cargo.
 */

import {
  calcularTotales, enUF, formatoHoras, tarifaHoyCLP,
  type EntradaTotales, type Indicadores, type LineaCalculo, type MonedaHH, type ParametrosHH, type ResultadoLinea, type Totales,
} from './calculo';

export interface LineaHH {
  key: string;
  /** El entregable, como lo verá el cliente. */
  descripcion: string;
  unidad: string;
  trabajo_tipo_id: string | null;
  hh_referencia: number | null;
  /** Vacío = tarifa general del cargo (nadie del equipo tiene ese cargo). */
  persona_id: string | null;
  persona_nombre: string | null;
  /** Vacío mientras no se elige. */
  cargo_id: string;
  cargo_nombre: string;
  cargo_moneda: MonedaHH;
  /** La tarifa efectiva: la propia de la persona o la del cargo. */
  cargo_tarifa_base: number;
  tipo_tarea_clave: string | null;
  multiplicador: number;
  multiplicador_editado: boolean;
  cantidad: number;
  /** Por unidad. */
  horas_reales: number | null;
  cargo_apoyo_id: string | null;
  cargo_apoyo_nombre: string | null;
  cargo_apoyo_moneda: MonedaHH | null;
  cargo_apoyo_tarifa_base: number | null;
  /** Por unidad, sin multiplicador. */
  horas_apoyo: number;
}

let correlativo = 0;
const claveLinea = () => `l${Date.now().toString(36)}${(++correlativo).toString(36)}`;

export const lineaVacia = (): LineaHH => ({
  key: claveLinea(), descripcion: '', unidad: '', trabajo_tipo_id: null, hh_referencia: null,
  persona_id: null, persona_nombre: null, cargo_id: '', cargo_nombre: '', cargo_moneda: 'UF', cargo_tarifa_base: 0,
  tipo_tarea_clave: null, multiplicador: 1, multiplicador_editado: false, cantidad: 1, horas_reales: null,
  cargo_apoyo_id: null, cargo_apoyo_nombre: null, cargo_apoyo_moneda: null, cargo_apoyo_tarifa_base: null, horas_apoyo: 0,
});

/** Tarifa del cargo principal y del apoyo con la UF o el dólar del cálculo. */
export function tarifasDeLinea(l: LineaHH, ind: Indicadores, p: ParametrosHH) {
  const principal = l.cargo_id ? tarifaHoyCLP(l.cargo_tarifa_base, l.cargo_moneda, ind, p) : 0;
  const apoyo = l.cargo_apoyo_id && l.cargo_apoyo_moneda && l.cargo_apoyo_tarifa_base
    ? tarifaHoyCLP(l.cargo_apoyo_tarifa_base, l.cargo_apoyo_moneda, ind, p) : null;
  return { principal, apoyo };
}

function aLineaCalculo(l: LineaHH, ind: Indicadores, p: ParametrosHH): LineaCalculo {
  const t = tarifasDeLinea(l, ind, p);
  return {
    cantidad: l.cantidad, horas_reales: l.horas_reales, multiplicador: l.multiplicador, tarifa_clp: t.principal,
    horas_apoyo: l.horas_apoyo, tarifa_apoyo_clp: t.apoyo, hh_referencia: l.hh_referencia,
  };
}

export type CabeceraHH = Omit<EntradaTotales, 'lineas'>;

export function totalesDe(lineas: LineaHH[], cab: CabeceraHH, ind: Indicadores, p: ParametrosHH): Totales {
  const e: EntradaTotales = { ...cab, lineas: lineas.map(l => aLineaCalculo(l, ind, p)) };
  return calcularTotales(e, ind, p);
}

/** Lo que le falta a una línea para guardarse (vacío = está lista). */
export function faltaEnLinea(l: LineaHH): string | null {
  if (!l.cargo_id) return 'elige el cargo';
  if (!(Number(l.horas_reales) > 0)) return 'faltan las horas reales';
  if (!(Number(l.cantidad) > 0)) return 'la cantidad tiene que ser mayor que 0';
  if (!(Number(l.multiplicador) > 0)) return 'el multiplicador tiene que ser mayor que 0';
  if (!l.descripcion.trim()) return 'falta la descripción';
  return null;
}

/** La fila de hh_calculo_lineas (con la foto de la tarifa en pesos ya calculada). */
export function filaLinea(l: LineaHH, r: ResultadoLinea, ind: Indicadores, p: ParametrosHH, orden: number) {
  const t = tarifasDeLinea(l, ind, p);
  return {
    orden, descripcion: l.descripcion.trim(), unidad: l.unidad.trim() || null,
    persona_id: l.persona_id, persona_nombre: l.persona_nombre,
    cargo_id: l.cargo_id, cargo_nombre: l.cargo_nombre, cargo_moneda: l.cargo_moneda,
    cargo_tarifa_base: l.cargo_tarifa_base, cargo_tarifa_clp: t.principal,
    trabajo_tipo_id: l.trabajo_tipo_id, hh_referencia: l.hh_referencia,
    tipo_tarea_clave: l.tipo_tarea_clave, multiplicador: l.multiplicador, multiplicador_editado: l.multiplicador_editado,
    cantidad: l.cantidad, horas_reales: l.horas_reales, horas_cobradas: r.horasCobradas,
    cargo_apoyo_id: l.cargo_apoyo_id, cargo_apoyo_nombre: l.cargo_apoyo_nombre, cargo_apoyo_moneda: l.cargo_apoyo_moneda,
    cargo_apoyo_tarifa_base: l.cargo_apoyo_tarifa_base, cargo_apoyo_tarifa_clp: t.apoyo,
    horas_apoyo: l.cargo_apoyo_id ? l.horas_apoyo : 0, subtotal_clp: r.subtotal,
  };
}

export type FilaLineaHH = ReturnType<typeof filaLinea>;

/** De la fila guardada a la línea editable. */
export function lineaDesdeFila(f: Partial<FilaLineaHH>): LineaHH {
  const num = (v: unknown, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));
  return {
    ...lineaVacia(),
    descripcion: f.descripcion || '', unidad: f.unidad || '',
    trabajo_tipo_id: f.trabajo_tipo_id || null, hh_referencia: f.hh_referencia === null || f.hh_referencia === undefined ? null : Number(f.hh_referencia),
    persona_id: f.persona_id || null, persona_nombre: f.persona_nombre || null,
    cargo_id: f.cargo_id || '', cargo_nombre: f.cargo_nombre || '', cargo_moneda: (f.cargo_moneda as MonedaHH) || 'UF',
    cargo_tarifa_base: num(f.cargo_tarifa_base),
    tipo_tarea_clave: f.tipo_tarea_clave || null, multiplicador: num(f.multiplicador, 1), multiplicador_editado: !!f.multiplicador_editado,
    cantidad: num(f.cantidad, 1), horas_reales: f.horas_reales === null || f.horas_reales === undefined ? null : Number(f.horas_reales),
    cargo_apoyo_id: f.cargo_apoyo_id || null, cargo_apoyo_nombre: f.cargo_apoyo_nombre || null,
    cargo_apoyo_moneda: (f.cargo_apoyo_moneda as MonedaHH | null) || null,
    cargo_apoyo_tarifa_base: f.cargo_apoyo_tarifa_base === null || f.cargo_apoyo_tarifa_base === undefined ? null : Number(f.cargo_apoyo_tarifa_base),
    horas_apoyo: num(f.horas_apoyo),
  };
}

/** Las hojas del Excel (vista interna: con horas, multiplicadores y personas). */
export function hojasCalculo(
  datos: { nombre: string; cliente: string; lineas: LineaHH[]; cab: CabeceraHH; nombreTipo: (clave: string | null) => string },
  t: Totales, ind: Indicadores, p: ParametrosHH,
) {
  const filas = datos.lineas.map((l, i) => {
    const r = t.lineas[i];
    const tar = tarifasDeLinea(l, ind, p);
    return {
      'Entregable': l.descripcion,
      'Persona': l.persona_nombre || 'Tarifa general',
      'Cargo': l.cargo_nombre,
      'Tipo de tarea': datos.nombreTipo(l.tipo_tarea_clave),
      'Cantidad': l.cantidad,
      'Unidad': l.unidad,
      'Horas reales (c/u)': l.horas_reales ?? 0,
      'Multiplicador': l.multiplicador,
      'Horas cobradas': r?.horasCobradas ?? 0,
      'Tarifa CLP/h': tar.principal,
      'Tarifa UF/h': enUF(tar.principal, ind.uf),
      'Apoyo': l.cargo_apoyo_nombre || '',
      'Horas apoyo (c/u)': l.cargo_apoyo_id ? l.horas_apoyo : 0,
      'Tarifa apoyo CLP/h': tar.apoyo ?? 0,
      'Subtotal CLP': r?.subtotal ?? 0,
      'HH referencia (c/u)': l.hh_referencia ?? '',
    };
  });
  const resumen: [string, string | number][] = [
    ['Cálculo', datos.nombre],
    ['Cliente', datos.cliente],
    ['UF usada', ind.uf],
    ['Dólar usado', ind.usd],
    ['Subtotal líneas', t.subtotalLineas],
    ['Recargo urgencia', t.recargoUrgencia],
    ['Mano de obra', t.manoObra],
    ['Materiales (venta)', t.materialesVenta],
    ['Utilidad de los materiales', t.utilidadMateriales === null ? '' : `${Math.round(t.utilidadMateriales * 1000) / 10} %`],
    ['Operación', t.operacion],
    ['Gestión de proyecto', t.gestion],
    ['Neto CLP', t.neto],
    ['Neto UF', t.netoUF],
    [`IVA (${Math.round(p.iva * 100)} %)`, t.iva],
    ['Total CLP', t.total],
    ['Horas trabajadas', formatoHoras(t.horasReales)],
    ['Valor por hora real', t.valorHoraReal ?? ''],
  ];
  return [
    { nombre: 'Cálculo', filas },
    { nombre: 'Totales', filas: resumen.map(([k, v]) => ({ Concepto: k, Valor: v })) },
  ];
}
