/**
 * Herramientas del cotizador que venían del cotizador de antes (pre-TecApp), como funciones puras:
 *   · Mano de obra por cuadrilla (técnicos y ayudantes por días de trabajo).
 *   · Traslado por kilómetros (ida y vuelta, peajes y horas de viaje del equipo).
 *   · Materiales consolidados (el mismo producto de varias partidas, sumado) para pedir precios.
 *   · La cotización como Excel: la hoja de ítems se puede volver a importar con «Importar planilla».
 */

import { IVA, type CotizacionDoc, type Linea, type PartidaCot } from './tipos';
import type { Resultado } from './calculo';
import { TIPOS } from './utilidad';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const norm = (x: string | null | undefined) => (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const plural = (n: number, uno: string, varios: string) => `${String(n).replace('.', ',')} ${n === 1 ? uno : varios}`;

// ── Mano de obra por cuadrilla ──
export interface Cuadrilla {
  tecnicos: number; ayudantes: number; dias: number;
  /** Costo de un día (jornada de 8 h) de cada uno: sueldo + leyes ÷ días. */
  costoDiaTecnico: number; costoDiaAyudante: number;
  /** % extra por colación, movilización, herramientas… */
  extra: number;
}
export const JORNADA_HORAS = 8;

export function costoCuadrilla(c: Cuadrilla) {
  const tecnicos = Math.max(Number(c.tecnicos) || 0, 0);
  const ayudantes = Math.max(Number(c.ayudantes) || 0, 0);
  const dias = Math.max(Number(c.dias) || 0, 0);
  const porDia = Math.round((tecnicos * (Number(c.costoDiaTecnico) || 0) + ayudantes * (Number(c.costoDiaAyudante) || 0)) * (1 + (Number(c.extra) || 0) / 100));
  return { personas: tecnicos + ayudantes, hh: (tecnicos + ayudantes) * dias * JORNADA_HORAS, porDia, total: porDia * dias };
}

/** «Mano de obra: 2 técnicos y 1 ayudante» */
export function descripcionCuadrilla(c: Pick<Cuadrilla, 'tecnicos' | 'ayudantes'>) {
  const partes = [c.tecnicos > 0 && plural(c.tecnicos, 'técnico', 'técnicos'), c.ayudantes > 0 && plural(c.ayudantes, 'ayudante', 'ayudantes')].filter(Boolean);
  return `Mano de obra: ${partes.join(' y ') || 'cuadrilla'}`;
}

// ── Traslado por kilómetros ──
export interface TrasladoKm { km: number; valorKm: number; peajes: number; horas: number; personas: number; valorHora: number }

/** Lo que cuesta un viaje: km de ida × 2 × $/km + peajes + horas de viaje × personas × $/hora (en pesos). */
export function costoTrasladoKm(v: TrasladoKm): number {
  const n = (x: number) => Math.max(Number(x) || 0, 0);
  return Math.round(n(v.km) * 2 * n(v.valorKm) + n(v.peajes) + n(v.horas) * n(v.personas) * n(v.valorHora));
}

// ── Materiales para pedir precios al proveedor ──
export interface MaterialPedido { codigo: string | null; descripcion: string; unidad: string; cantidad: number; partidas: string[] }

/**
 * Los materiales de la cotización, con el mismo producto de distintas partidas en una sola fila
 * (20 m + 20 m → 40 m). Mismo producto = mismo artículo de la biblioteca, o misma descripción y
 * unidad. Sin los cargos operacionales ni lo que tiene cantidad 0.
 */
export function materialesConsolidados(lineas: Linea[], partidas: PartidaCot[]): MaterialPedido[] {
  const nombre = new Map(partidas.map((p, i) => [p.id, p.nombre?.trim() || `Partida ${i + 1}`]));
  const cargos = new Set(partidas.filter(p => p.tipo === 'cargo').map(p => p.id));
  const mapa = new Map<string, MaterialPedido>();
  for (const l of lineas) {
    const cantidad = Number(l.cantidad) || 0;
    if (l.categoria !== 'material' || cantidad <= 0 || !l.descripcion?.trim() || cargos.has(l.partidaId || '')) continue;
    const clave = `${l.itemId && !l.fuera ? `id:${l.itemId}` : `d:${norm(l.descripcion)}`}|${norm(l.unidad)}`;
    const p = nombre.get(l.partidaId || '');
    const ya = mapa.get(clave);
    if (ya) {
      ya.cantidad = Math.round((ya.cantidad + cantidad) * 1000) / 1000;
      if (p && !ya.partidas.includes(p)) ya.partidas.push(p);
    } else {
      mapa.set(clave, { codigo: l.codigo || null, descripcion: l.descripcion.trim(), unidad: l.unidad || 'un', cantidad, partidas: p ? [p] : [] });
    }
  }
  return [...mapa.values()];
}

// ── La cotización como Excel ──
const TIPO_NOMBRE = Object.fromEntries(TIPOS.map(t => [t.clave, t.nombre])) as Record<string, string>;
const TIPO_PARTIDA: Record<string, string> = { instalacion: 'Instalación', venta: 'Venta', cargo: 'Cargo operacional' };
const textoPlanoSimple = (t: string | null | undefined) => (t || '').replace(/\*\*|__|~~/g, '').replace(/^\s*[-*]\s+/gm, '· ').trim();

/**
 * Las hojas del Excel: «Items» (mismas columnas que lee «Importar planilla», más precio, descuento
 * y totales, que el importador no lee), «Resumen» por partida y por tipo, y «Textos».
 * Los montos van en la moneda de la cotización.
 */
export function hojasExcel(doc: Pick<CotizacionDoc, 'titulo' | 'descripcion_general' | 'items' | 'partidas' | 'moneda'>, r: Resultado) {
  const lineas = doc.items || [];
  const partidas = doc.partidas || [];
  const redondeo = doc.moneda === 'UF' ? r4 : (n: number) => Math.round(n);
  // Nombres únicos: el importador junta las filas por el nombre de la partida.
  const usados = new Map<string, number>();
  const nombres = new Map(partidas.map((p, i) => {
    const base = p.nombre?.trim() || `Partida ${i + 1}`;
    const n = (usados.get(base) || 0) + 1;
    usados.set(base, n);
    return [p.id, n > 1 ? `${base} (${n})` : base];
  }));
  const sueltas = lineas.filter(l => !nombres.has(l.partidaId || ''));
  const grupos: { p: PartidaCot | null; nombre: string; suyas: Linea[] }[] = [
    ...partidas.map(p => ({ p, nombre: nombres.get(p.id)!, suyas: lineas.filter(l => l.partidaId === p.id) })),
    ...(sueltas.length ? [{ p: null, nombre: 'Líneas sin partida', suyas: sueltas }] : []),
  ];

  const items: Record<string, unknown>[] = [];
  for (const g of grupos) {
    g.suyas.forEach((l, i) => {
      const c = r.lineas.get(l.id);
      const f = l.ivaIncluido && (l.iva ?? IVA) !== 0 ? 1 + IVA / 100 : 1;
      const costo = (Number(l.costo) || 0) / f;
      const costoCI = costo * (1 + (Number(l.imprevistos) || 0) / 100);
      const precio = c?.precio || 0;
      items.push({
        'Partida': g.nombre,
        'Descripción de la partida': i === 0 ? textoPlanoSimple(g.p?.descripcion) : '',
        'Cant. partida': i === 0 && g.p ? Number(g.p.cantidad) || 1 : '',
        'Unidad partida': i === 0 && g.p ? g.p.unidad || 'global' : '',
        'Tipo': TIPO_NOMBRE[l.categoria] || 'Material',
        'Ítem': l.descripcion || '',
        'Unidad': l.unidad || 'un',
        'Cantidad': Number(l.cantidad) || 0,
        'Costo unitario neto': redondeo(costo),
        // Sobre el precio antes del descuento: lo mismo que lee el importador.
        'Utilidad %': precio > 0 && costoCI > 0 ? r2((1 - costoCI / precio) * 100) : '',
        'Imprevistos %': Number(l.imprevistos) || '',
        'Código': l.codigo || '',
        'Precio unitario': precio,
        'Descuento línea %': Number(l.descuento) || '',
        'Subtotal': c?.subtotal ?? 0,
        'Total neto': c?.neto ?? 0,
        'Lleva IVA': (l.iva ?? IVA) === 0 ? 'No (exento)' : 'Sí',
        'Tipo de partida': g.p ? TIPO_PARTIDA[g.p.tipo || 'instalacion'] : '',
        'Desc. partida %': i === 0 && g.p && g.p.tipo !== 'cargo' ? Number(g.p.descuento) || '' : '',
      });
    });
  }

  const resumen: Record<string, unknown>[] = grupos.filter(g => g.p).map((g, i) => {
    const pc = r.partidas.get(g.p!.id);
    const neto = pc?.neto ?? 0;
    return {
      'N°': i + 1, 'Partida': g.nombre, 'Tipo de partida': TIPO_PARTIDA[g.p!.tipo || 'instalacion'],
      'Subtotal': pc?.subtotal ?? 0, 'Descuento': pc?.descuento ?? 0, 'Neto': neto, 'Costo': pc?.costo ?? 0,
      'Utilidad': pc?.utilidad ?? 0, 'Utilidad %': neto > 0 ? r2(((pc?.utilidad ?? 0) / neto) * 100) : '',
    };
  });
  const t = r.totales;
  resumen.push(
    { 'N°': '', 'Partida': 'Subtotal', 'Subtotal': t.subtotal },
    { 'N°': '', 'Partida': 'Descuento', 'Descuento': t.descuento },
    { 'N°': '', 'Partida': 'Neto', 'Neto': t.neto, 'Costo': r.internos.costoConImprevistos, 'Utilidad': r.internos.utilidad, 'Utilidad %': r.internos.margen ?? '' },
    { 'N°': '', 'Partida': `IVA ${IVA} %`, 'Neto': t.iva },
    { 'N°': '', 'Partida': `Total (${doc.moneda})`, 'Neto': t.total },
  );
  const porTipo = r.internos.porCategoria.map(c => ({
    'Tipo': TIPO_NOMBRE[c.categoria] || c.categoria, 'Neto': c.neto, 'Costo directo': c.costo,
    'Costo con imprevistos': c.costoConImprevistos, 'Utilidad': c.utilidad,
  }));
  const textos = [
    { 'Campo': 'Título', 'Texto': doc.titulo || '' },
    ...(doc.descripcion_general?.trim() ? [{ 'Campo': 'Introducción', 'Texto': textoPlanoSimple(doc.descripcion_general) }] : []),
  ];
  return [
    { nombre: 'Items', filas: items },
    { nombre: 'Resumen', filas: resumen },
    { nombre: 'Por tipo', filas: porTipo },
    { nombre: 'Textos', filas: textos },
  ];
}
