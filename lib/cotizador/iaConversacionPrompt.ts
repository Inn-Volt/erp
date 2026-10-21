/**
 * Prompt y esquema de «Cotizar con IA conversando» (los usa /api/cotizar-ia/conversar).
 * Aparte del endpoint para poder probarlo desde un script.
 */

import type { GeminiSchema } from '@/lib/ia';
import { MAX_RONDAS_PREGUNTAS, type CandidatoIA, type MensajeIA } from '@/lib/cotizador/iaConversacion';

export const SYSTEM_CONVERSA = `Eres el cotizador técnico de InnVolt, empresa chilena de instalaciones eléctricas, automatización, CCTV, redes, iluminación, cargadores de vehículo eléctrico y energía. Conversas con un vendedor de InnVolt para armar una cotización.

CÓMO CONVERSAR
- Si al requerimiento le faltan datos que cambian el precio, haz entre 2 y 4 preguntas concretas por turno, cada una con 2 a 5 opciones cortas para responder con un toque (el vendedor también puede escribir otra cosa). No preguntes lo que ya se respondió.
- Prioriza lo que más mueve el costo: cantidades, tamaño/capacidad (ej. monofásico o trifásico, cantidad de circuitos, amperaje), distancias y recorridos, tipo de canalización, altura de trabajo, quién suministra los equipos, si incluye trámite SEC, horario y región.
- Cuando tengas lo necesario, o ya hiciste las rondas de preguntas permitidas, o el vendedor pide generar, entrega la PROPUESTA. Lo que no se sepa, asúmelo de forma profesional y anótalo en «supuestos».
- «mensaje» es lo que le dices al vendedor: corto, cordial y en español de Chile.

CÓMO ARMAR LA PROPUESTA
- Ordénala en PARTIDAS comerciales (lo que ve el cliente, ej. «Suministro e instalación de tablero de distribución»), cada una con sus componentes.
- Categorías: material, mano_obra, servicio, operacion. Casi toda partida de instalación lleva mano de obra.
- USA LA BIBLIOTECA DE INNVOLT: si un componente calza con un artículo de la lista «BIBLIOTECA», pon su referencia exacta en «ref» (ej. "B12") y su unidad; en ese caso costoUnitario = 0 (se usa el precio de la biblioteca). NUNCA inventes una referencia ni uses una que no esté en la lista.
- Si algo no está en la biblioteca, deja «ref» vacío, descríbelo de forma específica (ej. «Interruptor automático 2x25 A curva C 6 kA») y estima un costoUnitario realista: COSTO INTERNO NETO en pesos chilenos, sin IVA y sin margen.
- Cantidades concretas y coherentes con lo conversado. «nota»: muy breve (por qué ese componente o de dónde sale la cantidad).
- Máximo 6 partidas y 12 componentes por partida. Sin precios de venta.

Responde SIEMPRE con el JSON pedido. Si tipo es "preguntas", «propuesta» va con listas vacías. Si tipo es "propuesta", «preguntas» va vacío.`;

const COMP: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    ref: { type: 'STRING', description: 'Referencia de la biblioteca (B1, B2…) o vacío si es nuevo.' },
    descripcion: { type: 'STRING' },
    categoria: { type: 'STRING', enum: ['material', 'mano_obra', 'servicio', 'operacion'] },
    unidad: { type: 'STRING' },
    cantidad: { type: 'NUMBER' },
    costoUnitario: { type: 'NUMBER', description: 'Solo si es nuevo: costo interno neto CLP. Si es de la biblioteca, 0.' },
    nota: { type: 'STRING' },
  },
  required: ['ref', 'descripcion', 'categoria', 'unidad', 'cantidad', 'costoUnitario', 'nota'],
};
export const SCHEMA_CONVERSA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['preguntas', 'propuesta'] },
    mensaje: { type: 'STRING' },
    preguntas: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { pregunta: { type: 'STRING' }, opciones: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['pregunta', 'opciones'] },
    },
    propuesta: {
      type: 'OBJECT',
      properties: {
        resumen: { type: 'STRING' },
        supuestos: { type: 'ARRAY', items: { type: 'STRING' } },
        partidas: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              nombre: { type: 'STRING' }, descripcion: { type: 'STRING' }, cantidad: { type: 'NUMBER' }, unidad: { type: 'STRING' },
              componentes: { type: 'ARRAY', items: COMP },
            },
            required: ['nombre', 'descripcion', 'cantidad', 'unidad', 'componentes'],
          },
        },
      },
      required: ['resumen', 'supuestos', 'partidas'],
    },
  },
  required: ['tipo', 'mensaje', 'preguntas', 'propuesta'],
};

const recorta = (s: unknown, max: number) => String(s ?? '').slice(0, max);

/** El mensaje para la IA: la preselección de la biblioteca, la conversación y qué toca hacer. */
export function armarPedido(mensajes: MensajeIA[], candidatos: CandidatoIA[], generarYa: boolean) {
  const rondas = mensajes.filter(m => m.rol === 'asistente').length;
  const debeProponer = generarYa || rondas >= MAX_RONDAS_PREGUNTAS;
  const biblioteca = candidatos.length
    ? candidatos.map(c => `${recorta(c.ref, 6)} | ${recorta(c.descripcion, 110)} | ${c.categoria} | ${recorta(c.unidad, 12)} | costo ${Math.round(Number(c.costo) || 0)}`).join('\n')
    : '(la biblioteca no tiene artículos relacionados: todo será nuevo)';
  const conversacion = mensajes.map(m => `${m.rol === 'usuario' ? 'VENDEDOR' : 'TÚ'}: ${m.texto}`).join('\n\n');
  const user = `BIBLIOTECA DE INNVOLT (preselección; ref | descripción | categoría | unidad | costo neto CLP):
${biblioteca}

CONVERSACIÓN HASTA AHORA:
${conversacion}

Rondas de preguntas ya hechas: ${rondas} de ${MAX_RONDAS_PREGUNTAS}.
${debeProponer ? 'AHORA ENTREGA LA PROPUESTA (tipo "propuesta"), con supuestos para lo que falte.' : 'Decide: si falta información importante, pregunta; si no, entrega la propuesta.'}`;
  return { user, debeProponer };
}
