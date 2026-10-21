/**
 * Prompts y esquemas de «Cotizar con IA conversando» (los usa /api/cotizar-ia/conversar).
 * Aparte del endpoint para poder probarlos desde un script.
 *   · CONVERSAR: preguntas y plan de partidas (sirve para todos los servicios de InnVolt).
 *   · PARTIDA: los componentes de UNA partida, con la preselección de la biblioteca.
 */

import type { GeminiSchema } from '@/lib/ia';
import { MAX_PARTIDAS, MAX_RONDAS_PREGUNTAS, type CandidatoProducto, type CandidatoReceta, type MensajeIA, type PlanPartida } from '@/lib/cotizador/iaConversacion';

/** Qué ofrece InnVolt y qué define el precio de cada cosa (para saber qué preguntar). */
export const GUIA_SERVICIOS = `SERVICIOS DE INNVOLT Y LO QUE DEFINE EL PRECIO
- Tableros y electricidad general (tableros, alimentadores, empalmes, aumento de capacidad, normalización): monofásico o trifásico; capacidad en A; cantidad y tipo de circuitos (alumbrado, enchufes, fuerza); tablero embutido o sobrepuesto, metálico o plástico; distancia y recorrido desde el origen; canalización (embutida, EMT, PVC a la vista, bandeja); protección diferencial; si incluye declaración SEC (TE1).
- Puntos eléctricos (enchufes, iluminación, fuerza, circuitos nuevos): cantidad y tipo de puntos; muro (tabique, albañilería, hormigón); embutido o a la vista; distancia promedio al tablero; altura del cielo; si el circuito es nuevo o existente.
- Iluminación y LED (luminarias, paneles, cintas y perfiles, exterior): tipo y cantidad de luminarias o metros lineales; potencia; temperatura de color; regulación o control; interior o exterior (IP); altura de montaje; quién suministra las luminarias.
- Domótica y automatización: qué se controla (luces, cortinas, clima, portón, enchufes) y cuántos; ecosistema (Google, Alexa, Apple, Home Assistant); protocolo (Wi-Fi, Zigbee, Matter); neutro en las cajas; cobertura Wi-Fi; escenas.
- CCTV: cantidad de cámaras; interior o exterior; resolución; días de grabación; grabador existente o nuevo; distancia de cada cámara al grabador; PoE; acceso remoto; altura de montaje.
- Control de acceso: cantidad de puertas o accesos; tipo de puerta; identificación (tarjeta, clave, huella, facial, app); cerradura (electroimán, pestillo, motor); botón de salida; cantidad de usuarios; integración con citofonía o CCTV; respaldo de energía.
- Redes y cableado estructurado: cantidad de puntos; categoría (6 o 6A); distancia promedio al rack; rack y switch existentes o nuevos; PoE; access points Wi-Fi; certificación de puntos.
- Citofonía y videoportero: cantidad de casas o departamentos; analógico, IP o video; reemplazo o nuevo; cableado existente; apertura de puerta.
- Pantallas LED publicitarias: ancho y alto; interior o exterior; pixel pitch; estructura y anclajes (los calcula un especialista: inclúyelo como servicio); altura y medios de montaje; alimentación; controlador y contenido.
- Cargadores de vehículo eléctrico: potencia (7,4 / 11 / 22 kW); monofásico o trifásico; capacidad del empalme; distancia del tablero al estacionamiento; quién suministra el cargador; casa o condominio (autorización); declaración SEC (TE6).
- Fotovoltaico y energía: consumo mensual (kWh); on-grid, híbrido o aislado; superficie y tipo de techo; orientación y sombras; baterías; potencia del inversor; declaración SEC (TE4).
- Mantención preventiva o correctiva: qué tableros o equipos y cuántos; frecuencia; termografía y mediciones; informe; horario.
- Reparaciones y fallas: síntoma, urgencia y acceso; se cotiza diagnóstico más la reparación probable.
- Certificación y regularización SEC: tipo de instalación; potencia; planos existentes; tipo de declaración (TE1, TE4, TE6).
EN TODOS, CUANDO APLIQUE: comuna o región (traslado); horario (hábil, nocturno, fin de semana); altura de trabajo (escalera, andamio, alza hombre); quién suministra materiales y equipos; plazo; retiro de escombros y terminaciones.`;

export const SYSTEM_CONVERSAR = `Eres el cotizador técnico de InnVolt, empresa chilena de servicios eléctricos y tecnológicos. Conversas con un vendedor de InnVolt para preparar una cotización de CUALQUIERA de los servicios de la empresa.

${GUIA_SERVICIOS}

CÓMO CONVERSAR
- Identifica qué servicio(s) pide el requerimiento. Si mezcla varios (ej. habilitar un local: electricidad, iluminación, red y cámaras), trátalos todos.
- Si faltan datos que cambian el precio, haz entre 2 y 4 preguntas concretas por turno, las más importantes primero, cada una con 2 a 5 opciones cortas (el vendedor también puede escribir otra respuesta). No repitas lo que ya se respondió ni preguntes lo que no aplica a ese servicio.
- Cuando tengas lo necesario, o se acabaron las rondas permitidas, o el vendedor pide generar: entrega el PLAN. Lo que no se sepa, asúmelo de forma profesional y anótalo en «supuestos».
- «mensaje» es lo que le dices al vendedor: corto, cordial, en español de Chile.

EL PLAN
- Partidas comerciales (lo que ve el cliente): una por servicio o por bloque de trabajo, máximo ${MAX_PARTIDAS}. Ej.: «Suministro e instalación de tablero de distribución», «Instalación de 8 cámaras IP con grabación».
- «cantidad» y «unidad» de la partida: normalmente 1 global; si se repite igual (3 locales, 10 departamentos) usa ese número.
- «alcance»: TODO lo necesario para armar sus componentes: cantidades, medidas, especificaciones, distancias, condiciones y lo que no incluye. Sé concreto (números).
- «descripcion»: texto comercial para el cliente (máx. 40 palabras).

Responde SIEMPRE con el JSON pedido. Si tipo es "preguntas", «plan» va con listas vacías. Si tipo es "plan", «preguntas» va vacío.`;

export const SCHEMA_CONVERSAR: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['preguntas', 'plan'] },
    mensaje: { type: 'STRING' },
    preguntas: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { pregunta: { type: 'STRING' }, opciones: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['pregunta', 'opciones'] },
    },
    plan: {
      type: 'OBJECT',
      properties: {
        resumen: { type: 'STRING' },
        supuestos: { type: 'ARRAY', items: { type: 'STRING' } },
        partidas: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { nombre: { type: 'STRING' }, descripcion: { type: 'STRING' }, cantidad: { type: 'NUMBER' }, unidad: { type: 'STRING' }, alcance: { type: 'STRING' } },
            required: ['nombre', 'descripcion', 'cantidad', 'unidad', 'alcance'],
          },
        },
      },
      required: ['resumen', 'supuestos', 'partidas'],
    },
  },
  required: ['tipo', 'mensaje', 'preguntas', 'plan'],
};

export const SYSTEM_PARTIDA = `Eres el cotizador técnico de InnVolt (empresa chilena de servicios eléctricos y tecnológicos). Armas los COMPONENTES de UNA partida de una cotización, usando la biblioteca de InnVolt.

REGLAS
- Categorías: material, mano_obra, servicio, operacion. Toda partida de instalación lleva mano de obra; agrega traslado, fletes o arriendo de equipos (andamio, alza hombre) si el alcance lo pide.
- «cantidad» de cada componente es el TOTAL para toda la partida (si la partida es de 3 locales, los componentes suman los 3).
- USA LA BIBLIOTECA PRIMERO:
  · PRODUCTOS (B1, B2…): si un componente calza, pon su referencia exacta en «ref»; costoUnitario = 0 (se usa el precio de la biblioteca).
  · RECETAS (R1, R2…): conjuntos ya armados (ej. un punto de enchufe completo). Si una calza con parte del trabajo, úsala: «ref» = R…, y en «respuestas» contesta TODAS sus preguntas (clave y valor: un número, "sí"/"no", o una de las opciones exactas). Las respuestas también son el TOTAL de la partida (ej. 3 locales de 10 puntos: 30 puntos). Si la receta no tiene preguntas, «cantidad» = cuántas veces va en total. No repitas por fuera lo que la receta ya incluye (si trae mano de obra, no la agregues de nuevo).
  · NUNCA inventes una referencia ni uses una que no esté en las listas.
- Si algo no está en la biblioteca: «ref» vacío, descripción específica (ej. «Interruptor automático 2x25 A curva C 6 kA») y costoUnitario realista: COSTO INTERNO NETO en pesos chilenos, sin IVA y sin margen.
- «nota»: máximo 8 palabras (de dónde sale la cantidad o por qué va).
- Máximo 14 componentes. «respuestas» va vacío si no es receta.
Responde SIEMPRE con el JSON pedido.`;

export const SCHEMA_PARTIDA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    componentes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          ref: { type: 'STRING', description: 'B… (producto), R… (receta) o vacío si es nuevo.' },
          descripcion: { type: 'STRING' },
          categoria: { type: 'STRING', enum: ['material', 'mano_obra', 'servicio', 'operacion'] },
          unidad: { type: 'STRING' },
          cantidad: { type: 'NUMBER' },
          costoUnitario: { type: 'NUMBER', description: 'Solo si es nuevo: costo interno neto CLP. Si es de la biblioteca, 0.' },
          nota: { type: 'STRING' },
          respuestas: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { clave: { type: 'STRING' }, valor: { type: 'STRING' } }, required: ['clave', 'valor'] },
          },
        },
        required: ['ref', 'descripcion', 'categoria', 'unidad', 'cantidad', 'costoUnitario', 'nota', 'respuestas'],
      },
    },
  },
  required: ['componentes'],
};

const recorta = (s: unknown, max: number) => String(s ?? '').slice(0, max);

/** Conversación: requerimiento, preguntas y respuestas; y qué toca hacer ahora. */
export function pedidoConversar(mensajes: MensajeIA[], generarYa: boolean, recetas: string[] = []) {
  const rondas = mensajes.filter(m => m.rol === 'asistente').length;
  const debePlan = generarYa || rondas >= MAX_RONDAS_PREGUNTAS;
  const conversacion = mensajes.map(m => `${m.rol === 'usuario' ? 'VENDEDOR' : 'TÚ'}: ${m.texto}`).join('\n\n');
  const user = `${recetas.length ? `Recetas que tiene InnVolt en su biblioteca (referencia para nombrar partidas): ${recetas.slice(0, 40).map(r => recorta(r, 60)).join(' · ')}\n\n` : ''}CONVERSACIÓN HASTA AHORA:
${conversacion}

Rondas de preguntas ya hechas: ${rondas} de ${MAX_RONDAS_PREGUNTAS}.
${debePlan ? 'AHORA ENTREGA EL PLAN (tipo "plan"), con supuestos para lo que falte.' : 'Decide: si falta información que cambia el precio, pregunta; si no, entrega el plan.'}`;
  return { user, debePlan };
}

/** Una partida: el contexto del proyecto, la partida y la preselección de la biblioteca. */
export function pedidoPartida(contexto: string, p: PlanPartida, productos: CandidatoProducto[], recetas: CandidatoReceta[]) {
  const libProductos = productos.length
    ? productos.map(c => `${recorta(c.ref, 6)} | ${recorta(c.descripcion, 110)} | ${c.categoria} | ${recorta(c.unidad, 12)} | costo ${Math.round(Number(c.costo) || 0)}`).join('\n')
    : '(no hay productos relacionados en la biblioteca)';
  const libRecetas = recetas.length
    ? recetas.map(r => `${recorta(r.ref, 6)} | ${recorta(r.nombre, 80)} | por ${recorta(r.unidad, 12)} | incluye: ${recorta(r.contiene, 220)}${r.preguntas.length
      ? ` | preguntas: ${r.preguntas.map(q => `${q.clave} = ${recorta(q.texto, 70)} (${q.tipo === 'numero' ? `número${q.unidad ? ` en ${q.unidad}` : ''}` : q.tipo === 'sino' ? 'sí/no' : `opciones: ${(q.opciones || []).map(o => recorta(o, 40)).join(' / ')}`})`).join('; ')}`
      : ' | sin preguntas'}`).join('\n')
    : '(no hay recetas relacionadas)';
  return `PROYECTO (contexto de la conversación):
${recorta(contexto, 2500)}

PARTIDA A ARMAR:
Nombre: ${recorta(p.nombre, 120)}
Cantidad: ${p.cantidad} ${recorta(p.unidad, 20)}
Alcance: ${recorta(p.alcance || p.descripcion, 1500)}

BIBLIOTECA · PRODUCTOS (ref | descripción | categoría | unidad | costo neto CLP):
${libProductos}

BIBLIOTECA · RECETAS (ref | nombre | unidad | incluye | preguntas):
${libRecetas}`;
}
