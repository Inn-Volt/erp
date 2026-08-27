import { NextResponse } from 'next/server';
import { generarJSON, type GeminiSchema } from '@/lib/ia';
import type { BorradorIA } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING', description: 'Resumen breve (1-2 frases) del alcance interpretado y supuestos clave.' },
    partidas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING' },
          descripcion: { type: 'STRING', description: 'Descripción comercial (alcance, suministro y montaje) que ve el cliente.' },
          cantidad: { type: 'NUMBER' },
          unidad: { type: 'STRING', description: 'un, global, local, depto, piso, m², mes…' },
          componentes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                descripcion: { type: 'STRING' },
                categoria: { type: 'STRING', enum: ['material', 'mano_obra', 'servicio', 'operacion'] },
                unidad: { type: 'STRING' },
                cantidad: { type: 'NUMBER', description: 'Cantidad TOTAL para toda la partida.' },
                costoUnitario: { type: 'NUMBER', description: 'Costo unitario interno neto en CLP (sin IVA, sin margen).' },
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
};

export async function POST(req: Request) {
  let descripcion = '';
  try {
    const body = await req.json();
    descripcion = String(body?.descripcion ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }
  if (descripcion.length < 10) {
    return NextResponse.json({ error: 'Describe el proyecto con un poco más de detalle.' }, { status: 400 });
  }

  try {
    const borrador = await generarJSON<BorradorIA>({
      system: SYSTEM,
      user: `Proyecto a cotizar (interpreta y estructura en partidas):\n\n${descripcion}`,
      schema: SCHEMA,
    });
    if (!borrador?.partidas?.length) {
      return NextResponse.json({ error: 'La IA no generó partidas. Agrega más detalle al proyecto.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, borrador });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
