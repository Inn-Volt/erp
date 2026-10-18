/**
 * El motor de las recetas (port de `motor_de_recetas.py` de TecApp): decide qué líneas salen
 * de una receta con sus respuestas y cuántas.
 *
 *   cantidad = (fija + por_cada × respuesta) × veces
 *   con «uno cada»: (fija + por_cada × ⌈respuesta ÷ cada⌉) × veces
 *
 * - Solo una receta SIN preguntas pregunta «¿Cuántas?» (veces); una con preguntas va una vez.
 * - Un componente va si se cumple su condición de sí/no u opción, y su rango (las dos, si tiene).
 * - Una cantidad de 0 no es un error: el componente no va.
 */

import type { ArticuloCatalogo, PreguntaReceta, ReglaComponente } from './tipos';

export interface ComponenteReceta {
  id: string;
  item_id?: string | null;
  descripcion: string;
  categoria: string;
  unidad: string;
  costo: number;
  cantidad: number;      // la fija
  orden?: number;
  regla?: ReglaComponente | null;
}

export interface RecetaCompleta {
  id: string;
  nombre: string;
  descripcion?: string | null;
  unidad: string;
  preguntas: PreguntaReceta[];
  componentes: ComponenteReceta[];
  activo?: boolean;
}

export type Respuestas = Record<string, number | boolean | string>;

export interface LineaArmada { componente: ComponenteReceta; articulo: ArticuloCatalogo | null; cantidad: number }
export interface NoVa { componente: ComponenteReceta; nombre: string; porque: string }
export interface Armado { lineas: LineaArmada[]; noVan: NoVa[] }

export const TOPE_CANTIDAD = 1_000_000;

export function porOmision(p: PreguntaReceta): number | boolean | string {
  if (p.tipo === 'numero') return typeof p.defecto === 'number' ? p.defecto : (p.minimo ?? 1);
  if (p.tipo === 'sino') return p.defecto === undefined || p.defecto === null ? true : !!p.defecto;
  const op = (p.opciones || []).find(o => o.defecto) || (p.opciones || [])[0];
  return op?.item_id || '';
}

export function respuestasIniciales(r: RecetaCompleta, antes?: Respuestas): Respuestas {
  const out: Respuestas = {};
  for (const p of r.preguntas) {
    const previa = antes?.[p.clave];
    const valida = previa !== undefined && (
      (p.tipo === 'numero' && typeof previa === 'number') ||
      (p.tipo === 'sino' && typeof previa === 'boolean') ||
      (p.tipo === 'producto' && typeof previa === 'string' && (p.opciones || []).some(o => o.item_id === previa)));
    out[p.clave] = valida ? previa : porOmision(p);
  }
  return out;
}

export const grupos = (respuesta: number, cada: number) => (cada > 0 ? Math.ceil(respuesta / cada - 1e-9) : respuesta);

export function textoDelRango(desde?: number | null, hasta?: number | null): string {
  const n = (v: number) => v.toLocaleString('es-CL');
  if (desde !== null && desde !== undefined && hasta !== null && hasta !== undefined) {
    return desde === hasta ? `es ${n(desde)}` : `está entre ${n(desde)} y ${n(hasta)}`;
  }
  if (hasta !== null && hasta !== undefined) return `es ${n(hasta)} o menos`;
  if (desde !== null && desde !== undefined) return `es ${n(desde)} o más`;
  return '';
}

/** La regla en una frase, para el editor: «2 por cada «¿Cuántas puertas?»». */
export function fraseDeRegla(c: ComponenteReceta, preguntas: PreguntaReceta[]): string {
  const r = c.regla || {};
  const p = (k?: string | null) => preguntas.find(x => x.clave === k);
  const partes: string[] = [];
  const fija = Number(c.cantidad) || 0;
  if (r.por_pregunta && p(r.por_pregunta)) {
    const t = `«${p(r.por_pregunta)!.texto}»`;
    const n = (r.por_cada ?? 1).toLocaleString('es-CL');
    partes.push(r.cada ? `${n} cada ${r.cada.toLocaleString('es-CL')} de ${t}` : `${n} por cada ${t}`);
    if (fija) partes.push(`+ ${fija.toLocaleString('es-CL')} fijo`);
  } else {
    partes.push(`${fija.toLocaleString('es-CL')} fijo`);
  }
  if (r.si_pregunta && p(r.si_pregunta)) {
    const q = p(r.si_pregunta)!;
    if (q.tipo === 'sino') partes.push(`solo si «${q.texto}» es ${r.si_es === false ? 'No' : 'Sí'}`);
    else partes.push(`solo si en «${q.texto}» se elige esa opción`);
  }
  if (r.rango_pregunta && p(r.rango_pregunta)) partes.push(`solo si «${p(r.rango_pregunta)!.texto}» ${textoDelRango(r.desde, r.hasta)}`);
  return partes.join(' · ');
}

export function armar(r: RecetaCompleta, respuestas: Respuestas, veces: number, catalogo: Map<string, ArticuloCatalogo>): Armado {
  const preguntas = new Map(r.preguntas.map(p => [p.clave, p]));
  const lineas: LineaArmada[] = [];
  const noVan: NoVa[] = [];
  const vecesReal = r.preguntas.length ? 1 : Math.min(Math.max(Math.round(veces) || 1, 1), 1000);
  const comps = [...r.componentes].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  for (const c of comps) {
    const regla = c.regla || {};
    const itemId = regla.elegido_en ? String(respuestas[regla.elegido_en] || '') : (c.item_id || '');
    const articulo = itemId ? catalogo.get(itemId) || null : null;
    const nombre = articulo?.descripcion || c.descripcion || 'Componente';
    // Condición de sí/no u opción
    if (regla.si_pregunta && preguntas.has(regla.si_pregunta)) {
      const q = preguntas.get(regla.si_pregunta)!;
      const resp = respuestas[regla.si_pregunta];
      const cumple = q.tipo === 'sino' ? resp === (regla.si_es !== false) : resp === regla.si_opcion;
      if (!cumple) {
        noVan.push({ componente: c, nombre, porque: `Solo si «${q.texto}» es ${q.tipo === 'sino' ? (regla.si_es === false ? 'No' : 'Sí') : 'esa opción'}.` });
        continue;
      }
    }
    if (regla.rango_pregunta && preguntas.has(regla.rango_pregunta)) {
      const v = Number(respuestas[regla.rango_pregunta]) || 0;
      if ((regla.desde !== null && regla.desde !== undefined && v < regla.desde) || (regla.hasta !== null && regla.hasta !== undefined && v > regla.hasta)) {
        noVan.push({ componente: c, nombre, porque: `Solo si «${preguntas.get(regla.rango_pregunta)!.texto}» ${textoDelRango(regla.desde, regla.hasta)}.` });
        continue;
      }
    }
    let bruto = Number(c.cantidad) || 0;
    if (regla.por_pregunta && preguntas.has(regla.por_pregunta)) {
      const v = Number(respuestas[regla.por_pregunta]) || 0;
      bruto += (regla.por_cada ?? 1) * (regla.cada ? grupos(v, regla.cada) : v);
    }
    bruto *= vecesReal;
    if (bruto <= 0) { noVan.push({ componente: c, nombre, porque: 'Con esas respuestas, la cantidad da 0.' }); continue; }
    const cantidad = Math.max(Math.round(bruto * 1000) / 1000, 0.001);
    if (cantidad > TOPE_CANTIDAD) { noVan.push({ componente: c, nombre, porque: `Da ${cantidad.toLocaleString('es-CL')}: una línea admite hasta 1.000.000.` }); continue; }
    if (itemId && !articulo) { noVan.push({ componente: c, nombre, porque: 'Ya no está en el catálogo.' }); continue; }
    if (articulo && articulo.activo === false) { noVan.push({ componente: c, nombre, porque: 'Está desactivado en el catálogo.' }); continue; }
    if (articulo && articulo.precio_venta === null) { noVan.push({ componente: c, nombre, porque: 'No tiene precio: ponle familia o ganancia en la Biblioteca.' }); continue; }
    lineas.push({ componente: c, articulo, cantidad });
  }
  return { lineas, noVan };
}

/** Avisos al editar una receta (no bloquean). */
export function avisosDeReceta(r: RecetaCompleta, catalogo: Map<string, ArticuloCatalogo>): string[] {
  const avisos: string[] = [];
  const usadas = new Set<string>();
  for (const c of r.componentes) {
    const g = c.regla || {};
    [g.elegido_en, g.por_pregunta, g.si_pregunta, g.rango_pregunta].forEach(k => k && usadas.add(k));
    if (c.item_id) {
      const a = catalogo.get(c.item_id);
      if (!a) avisos.push(`«${c.descripcion}» ya no está en el catálogo.`);
      else if (a.activo === false) avisos.push(`«${a.descripcion}» está desactivado.`);
      else if (a.precio_venta === null) avisos.push(`«${a.descripcion}» no tiene precio (sin familia ni ganancia).`);
    }
    if (g.rango_pregunta && g.desde !== null && g.desde !== undefined && g.hasta !== null && g.hasta !== undefined && g.desde > g.hasta) {
      avisos.push(`El rango de «${c.descripcion}» nunca se alcanza (desde mayor que hasta).`);
    }
  }
  for (const p of r.preguntas) if (!usadas.has(p.clave)) avisos.push(`La pregunta «${p.texto}» no la usa ningún componente.`);
  return avisos;
}
