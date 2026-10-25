/**
 * Cotizar más rápido: entender «12 enchufes dobles», «tablero 12 polos x 2» o una lista pegada
 * (de WhatsApp, un correo o Excel) y encontrar en la biblioteca lo que más se parece.
 * Funciones puras: no tocan la base ni la pantalla.
 */

import type { ArticuloCatalogo } from '@/lib/cotizador/tipos';

export interface FilaPegada { texto: string; cantidad: number }

export const normalizar = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIDAD = String.raw`(?:u|un|und|unid|unidad|unidades|uds?|pzas?|piezas?)\.?`;
const aNumero = (s: string) => Number(s.replace(',', '.'));

/**
 * Separa la cantidad del texto: «12 enchufe doble», «12x enchufe», «enchufe doble x 12»,
 * «enchufe: 12 un», «12 un. enchufe». Medidas como «60x60» o «2,5 mm» no se toman por cantidad.
 */
export function separarCantidad(linea: string): FilaPegada {
  const t = linea.replace(/\s+/g, ' ').trim();
  let m = t.match(new RegExp(String.raw`^${NUM}\s*(?:[x×*]\s*|${UNIDAD}\s+|\s+)(.+)$`, 'i'));
  // «2,5 mm cable» o «220 v»: un número seguido de una unidad de medida no es cantidad.
  if (m && !/^(mm2?|mm²|cm|m|mts?|metros?|v|kv|w|kw|a|amp|hz|pulg(adas)?|"|°)\b/i.test(m[2])) {
    const n = aNumero(m[1]);
    if (n > 0 && n < 100000) return { cantidad: n, texto: m[2].trim() };
  }
  m = t.match(new RegExp(String.raw`^(.+?)(?:\s+[x×*]\s*|\s*[:=]\s*|\s+-\s+|\s+)${NUM}\s*${UNIDAD}$`, 'i'))
    || t.match(new RegExp(String.raw`^(.+?)(?:\s+[x×*]\s*|\s*[:=]\s*|\s+-\s+)${NUM}$`, 'i'));
  if (m) {
    const n = aNumero(m[2]);
    if (n > 0 && n < 100000) return { cantidad: n, texto: m[1].trim() };
  }
  return { cantidad: 1, texto: t };
}

/** Una lista pegada → filas con cantidad. Acepta viñetas, numeración 1. 2. 3. y columnas de Excel. */
export function parsearLista(texto: string): FilaPegada[] {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^[-–—=_*·•.\s]+$/.test(l));
  // «1. … 2. … 3. …» seguidos: es numeración de la lista, no cantidad.
  const numeradas = lineas.length > 1 && lineas.every((l, i) => new RegExp(`^${i + 1}\\s*[.)-]\\s+`).test(l));
  return lineas.map(l => {
    let x = l.replace(/^[-–—*·•▪●○]\s*/, '');
    if (numeradas) x = x.replace(/^\d+\s*[.)-]\s+/, '');
    else x = x.replace(/^\d+\)\s+/, '');
    // Columnas pegadas desde Excel: una celda con número y otra con texto.
    const celdas = x.split('\t').map(c => c.trim()).filter(Boolean);
    if (celdas.length >= 2) {
      const iNum = celdas.findIndex(c => /^\d+(?:[.,]\d+)?$/.test(c));
      const textos = celdas.filter((_, i) => i !== iNum && !/^\$?\s*[\d.,]+$/.test(celdas[i]));
      if (iNum >= 0 && textos.length) return { cantidad: aNumero(celdas[iNum]) || 1, texto: textos.join(' ') };
      x = celdas.join(' ');
    }
    return separarCantidad(x);
  }).filter(f => f.texto.length > 1);
}

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'por', 'y', 'en', 'un', 'una', 'unos', 'unas', 'al', 'a', 'o', 'tipo', 'marca']);
/** Palabras para comparar: sin tildes, sin palabras vacías, singular aproximado («enchufes» → «enchufe»). */
function palabras(s: string): string[] {
  return normalizar(s).split(/[^a-z0-9.,/]+/).filter(w => w.length > 1 && !VACIAS.has(w))
    .map(w => (w.length > 5 && w.endsWith('es') && !/[aeiou]es$/.test(w.slice(-3)) ? w.slice(0, -2) : w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

/** Lo de la biblioteca que más se parece a un texto (los primeros, el mejor primero). Solo lo que tiene precio. */
export function candidatos(texto: string, catalogo: ArticuloCatalogo[], max = 5): ArticuloCatalogo[] {
  const buscadas = palabras(texto);
  if (!buscadas.length) return [];
  const codigo = normalizar(texto);
  const puntaje: { a: ArticuloCatalogo; p: number }[] = [];
  for (const a of catalogo) {
    if (a.activo === false || a.precio_venta === null) continue;
    if (a.codigo && normalizar(a.codigo) === codigo) { puntaje.push({ a, p: 10 }); continue; }
    const hay = normalizar(`${a.descripcion} ${a.marca || ''} ${a.modelo || ''} ${a.codigo || ''}`);
    const halladas = buscadas.filter(w => hay.includes(w)).length;
    const p = halladas / buscadas.length;
    // Que calce al menos la mitad de lo escrito (y si es una sola palabra, esa).
    if (p >= 0.5 && halladas >= Math.min(buscadas.length, 1)) {
      // Desempate: la descripción más corta es la más parecida («Enchufe doble» antes que «Enchufe doble con USB»).
      puntaje.push({ a, p: p - Math.min(hay.length, 200) / 10000 });
    }
  }
  return puntaje.sort((x, y) => y.p - x.p).slice(0, max).map(x => x.a);
}
