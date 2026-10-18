/**
 * «Revisar y enviar» (TecApp): lo rojo no deja enviar; lo ámbar avisa pero deja.
 * Cada aviso dice dónde está el problema (`ir`: id del elemento al que se salta).
 */

import type { Cliente } from '@/types';
import type { CotizacionDoc } from './tipos';
import type { Resultado } from './calculo';

export interface Aviso { nivel: 'rojo' | 'ambar'; texto: string; ir?: string }

const CUENTA = /\b(cta\.?|cuenta)\s*(cte|corriente|vista|rut)?\b[^\n]{0,30}\d{6,}/i;
// Lo que la fuente Helvetica del PDF no imprime: emojis y símbolos fuera de Latin-1.
const NO_IMPRIMIBLE = /[^\u0000-ÿ–—‘’“”•…€]/u;

export function revisar(doc: CotizacionDoc, r: Resultado, cliente: Cliente | null, extra: {
  hoy: string; diasDeSiempre: number; correoContacto?: string | null; importante?: string | null; esQuienCotiza: boolean;
}): Aviso[] {
  const a: Aviso[] = [];
  const lineas = doc.items || [];
  if (!lineas.length) a.push({ nivel: 'rojo', texto: 'La cotización no tiene ninguna línea.', ir: 'cot-presupuesto' });
  if (lineas.length && !(r.totales.total > 0)) a.push({ nivel: 'rojo', texto: 'El total da $0.', ir: 'cot-presupuesto' });
  if (doc.moneda === 'UF' && !(Number(doc.valor_uf) > 0)) a.push({ nivel: 'rojo', texto: 'Está en UF y falta el valor de la UF.', ir: 'cot-bloque-cotizacion' });
  if (doc.valida_hasta_a_mano && doc.valida_hasta && doc.valida_hasta < extra.hoy) a.push({ nivel: 'rojo', texto: 'La «válida hasta» escrita a mano ya pasó.', ir: 'cot-bloque-cotizacion' });
  if (!cliente) a.push({ nivel: 'rojo', texto: 'Falta el cliente.', ir: 'cot-bloque-cliente' });

  for (const l of lineas) {
    const c = r.lineas.get(l.id);
    if (!l.descripcion?.trim()) a.push({ nivel: 'ambar', texto: 'Una línea no tiene descripción.', ir: `cot-partida-${l.partidaId}` });
    else if (c && !(c.precio > 0)) a.push({ nivel: 'ambar', texto: `«${l.descripcion}» tiene precio $0.`, ir: `cot-partida-${l.partidaId}` });
    if (extra.esQuienCotiza && c && c.margenReal !== null && c.margenReal < 0) a.push({ nivel: 'ambar', texto: `«${l.descripcion}» se vende bajo el costo (solo lo ves tú).`, ir: `cot-partida-${l.partidaId}` });
    if (l.fuera && (l.costo || 0) > 0 && (l.ganancia === null || l.ganancia === undefined)) a.push({ nivel: 'ambar', texto: `«${l.descripcion || 'Una línea fuera del catálogo'}» no tiene ganancia: se vende a costo.`, ir: `cot-partida-${l.partidaId}` });
  }
  for (const p of doc.partidas || []) {
    if (!p.nombre?.trim()) a.push({ nivel: 'ambar', texto: 'Hay una partida sin nombre.', ir: `cot-partida-${p.id}` });
    if (!lineas.some(l => l.partidaId === p.id)) a.push({ nivel: 'ambar', texto: `La partida «${p.nombre || 'sin nombre'}» no tiene líneas.`, ir: `cot-partida-${p.id}` });
    if (doc.que_ve_cliente === 'partidas' && (Number(p.cantidad) !== 1 || p.unidad !== 'global') && r.partidas.get(p.id)?.valorUnitario === null) {
      a.push({ nivel: 'ambar', texto: `En «${p.nombre}» el valor unitario no da exacto: el PDF imprime solo el total.`, ir: `cot-partida-${p.id}` });
    }
  }
  if (cliente && !cliente.rut) a.push({ nivel: 'ambar', texto: 'El cliente no tiene RUT.', ir: 'cot-bloque-cliente' });
  if (cliente && !extra.correoContacto && !cliente.email && !cliente.telefono) a.push({ nivel: 'ambar', texto: 'No hay a quién mandarla: ni el contacto ni el cliente tienen correo o teléfono.', ir: 'cot-bloque-cliente' });
  if (!doc.descripcion_general?.trim()) a.push({ nivel: 'ambar', texto: 'Falta la introducción.', ir: 'cot-bloque-descripcion' });
  if (!doc.aclaraciones?.trim()) a.push({ nivel: 'ambar', texto: 'No hay aclaraciones y garantías.', ir: 'cot-bloque-aclaraciones' });
  const textos = [doc.descripcion_general, doc.aclaraciones, ...(doc.partidas || []).map(p => p.descripcion || ''), ...(doc.secciones || []).map(x => x.texto), extra.importante || ''];
  if (textos.some(t => CUENTA.test(t || ''))) a.push({ nivel: 'ambar', texto: 'Algo que se imprime parece una cuenta bancaria: los datos para transferir ya salen solos al final.', ir: 'cot-bloque-aclaraciones' });
  if ([doc.titulo, ...textos].some(t => NO_IMPRIMIBLE.test(t || ''))) a.push({ nivel: 'ambar', texto: 'Hay caracteres que el PDF no puede imprimir (emojis o símbolos como ★): saldrán como un cuadro.' });
  for (const x of doc.secciones || []) if (x.tipo === 'texto' && !x.texto?.trim()) a.push({ nivel: 'ambar', texto: `La sección «${x.titulo || 'sin título'}» está vacía.`, ir: 'cot-bloque-presentacion' });
  if (doc.valida_hasta_a_mano && doc.valida_hasta && doc.valida_hasta >= extra.hoy) {
    const dias = Math.round((new Date(doc.valida_hasta).getTime() - new Date(extra.hoy).getTime()) / 86_400_000);
    if (dias < extra.diasDeSiempre) a.push({ nivel: 'ambar', texto: `Validez corta: le quedan ${dias} día${dias === 1 ? '' : 's'}.`, ir: 'cot-bloque-cotizacion' });
  }
  // Sin repetir el mismo texto.
  return a.filter((x, i) => a.findIndex(y => y.texto === x.texto) === i);
}

/** Llena una plantilla de mensaje: {cliente} {numero} {titulo} {total} {enlace} {vendedor} {empresa}. */
export function llenarMensaje(plantilla: string, datos: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (_, k) => datos[k] ?? '');
}
