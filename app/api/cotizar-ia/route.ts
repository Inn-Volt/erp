import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { BorradorIA } from '@/types';

// La llamada al modelo puede tardar (razonamiento + salida estructurada):
// pedimos hasta 60 s. En Netlify puede requerir subir el límite de la función.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Modelo por defecto (se puede sobreescribir con IA_MODEL en el entorno). */
const MODELO = process.env.IA_MODEL || 'claude-opus-5';

const SYSTEM = `Eres un ingeniero eléctrico senior de InnVolt, una empresa chilena de servicios eléctricos y tecnológicos. Tu tarea es transformar la descripción de un proyecto en un borrador de cotización profesional, listo para que un cotizador humano lo revise y ajuste.

Estructura el trabajo en PARTIDAS (paquetes comerciales). Cada partida es una línea que ve el cliente (por ejemplo "Habilitación de tablero eléctrico", "Instalación de puntos de red", "Suministro y montaje de luminarias") y agrupa internamente sus componentes.

Cada componente pertenece a una de estas categorías:
- "material": insumos físicos (cables, canalización, tableros, luminarias, conectores, etc.).
- "mano_obra": trabajo del personal (instalación, montaje, cableado), normalmente por hora, día o global.
- "servicio": servicios de terceros o especializados (certificación SEC, arriendo de equipos, transporte especial).
- "operacion": gastos operacionales (fletes, viáticos, movilización, EPP, consumibles).

Reglas:
- Todos los costos son COSTO INTERNO NETO en pesos chilenos (CLP), SIN IVA y SIN margen. Usa precios realistas del mercado chileno actual.
- Estima cantidades concretas y coherentes con la descripción. Si el proyecto se repite (N locales, N deptos, N pisos), fija la cantidad de la partida en ese número y expresa las cantidades de los componentes como el TOTAL para toda la partida.
- Incluye mano de obra en casi toda partida de instalación; no entregues solo materiales.
- Sé específico en las descripciones de los componentes (ej. "Cable EVA 2,5 mm² 100 m", no "cable").
- Si la descripción es ambigua, asume un alcance profesional razonable y refléjalo en la descripción comercial de la partida.
- Responde SIEMPRE en español.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resumen: { type: 'string', description: 'Resumen breve (1-2 frases) del alcance interpretado y supuestos clave.' },
    partidas: {
      type: 'array',
      description: 'Partidas comerciales del proyecto.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nombre: { type: 'string', description: 'Nombre comercial de la partida.' },
          descripcion: { type: 'string', description: 'Descripción comercial (alcance, suministro y montaje) que ve el cliente.' },
          cantidad: { type: 'number', description: 'Cantidad de la partida (ej. 1, o 56 si son 56 locales).' },
          unidad: { type: 'string', description: 'Unidad de la partida (un, global, local, depto, piso, m², mes).' },
          componentes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                descripcion: { type: 'string' },
                categoria: { type: 'string', enum: ['material', 'mano_obra', 'servicio', 'operacion'] },
                unidad: { type: 'string' },
                cantidad: { type: 'number', description: 'Cantidad TOTAL de este componente para toda la partida.' },
                costoUnitario: { type: 'number', description: 'Costo unitario interno neto en CLP (sin IVA, sin margen).' },
              },
              required: ['descripcion', 'categoria', 'unidad', 'cantidad', 'costoUnitario'],
            },
          },
        },
        required: ['nombre', 'descripcion', 'cantidad', 'unidad', 'componentes'],
      },
    },
  },
  required: ['resumen', 'partidas'],
} as const;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Falta la clave ANTHROPIC_API_KEY en el entorno del servidor. Agrégala en .env.local (local) y en las variables de entorno de Netlify (producción).' },
      { status: 500 },
    );
  }

  let descripcion = '';
  try {
    const body = await req.json();
    descripcion = String(body?.descripcion ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }
  if (descripcion.length < 10) {
    return NextResponse.json({ error: 'Describe el proyecto con un poco más de detalle (mínimo unas palabras).' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model: MODELO,
      max_tokens: 8000,
      // Razonamiento adaptativo con esfuerzo medio: buen equilibrio calidad/latencia.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Proyecto a cotizar (interpreta y estructura en partidas):\n\n${descripcion}`,
        },
      ],
    });

    const msg = await stream.finalMessage();

    if (msg.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: 'El modelo no pudo procesar esta solicitud. Reformula la descripción del proyecto.' },
        { status: 422 },
      );
    }

    // Salida estructurada: el contenido llega como un bloque de texto con JSON válido.
    const texto = msg.content.find((b) => b.type === 'text')?.text ?? '';
    let data: BorradorIA;
    try {
      data = JSON.parse(texto) as BorradorIA;
    } catch {
      return NextResponse.json({ error: 'La respuesta de la IA no tuvo el formato esperado. Intenta de nuevo.' }, { status: 502 });
    }

    if (!data?.partidas?.length) {
      return NextResponse.json({ error: 'La IA no generó partidas. Agrega más detalle al proyecto.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, borrador: data });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status;
    if (status === 401) {
      return NextResponse.json({ error: 'La clave ANTHROPIC_API_KEY es inválida o fue revocada.' }, { status: 500 });
    }
    if (status === 429) {
      return NextResponse.json({ error: 'Límite de uso alcanzado en la API de Claude. Intenta nuevamente en unos segundos.' }, { status: 429 });
    }
    const detalle = e instanceof Error ? e.message : 'desconocido';
    return NextResponse.json({ error: 'Error al generar la cotización con IA: ' + detalle }, { status: 500 });
  }
}
