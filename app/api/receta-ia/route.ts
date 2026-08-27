import { NextResponse } from 'next/server';
import { generarJSON, type GeminiSchema } from '@/lib/ia';
import type { RecetaIA } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM = `Eres un ingeniero eléctrico senior de InnVolt (empresa chilena de servicios eléctricos). Tu tarea es armar una RECETA (ensamble reutilizable) a partir de una descripción. Una receta es una unidad de trabajo repetible — por ejemplo "Punto eléctrico de enchufe", "Punto de red de datos", "Centro de iluminación" — con todos los componentes necesarios para ejecutar UNA unidad.

Cada componente pertenece a una categoría:
- "material": insumos físicos (cable, canalización, cajas, enchufes, conectores, etc.).
- "mano_obra": trabajo de instalación (por hora o global).
- "servicio": servicios de terceros o especializados.
- "operacion": gastos operacionales (consumibles, EPP, fletes).

Reglas:
- La receta cubre 1 (una) unidad; las cantidades de los componentes son POR UNIDAD de la receta.
- Los costos son COSTO INTERNO NETO en CLP (sin IVA, sin margen), realistas para el mercado chileno.
- Sé específico en las descripciones (ej. "Cable EVA 2,5 mm²", "Caja embutida PVC 4x2", "Enchufe doble 10A"), para poder enlazarlos con el catálogo.
- Incluye la mano de obra de instalación de la unidad.
- Elige una unidad adecuada para la receta (un, m, punto, centro, global…).
- Responde SIEMPRE en español.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    nombre: { type: 'STRING', description: 'Nombre corto de la receta (ej. "Punto eléctrico enchufe").' },
    unidad: { type: 'STRING', description: 'Unidad de la receta (un, m, punto, centro, global…).' },
    descripcion: { type: 'STRING', description: 'Nota breve del alcance de la receta (opcional).' },
    componentes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descripcion: { type: 'STRING' },
          categoria: { type: 'STRING', enum: ['material', 'mano_obra', 'servicio', 'operacion'] },
          unidad: { type: 'STRING' },
          cantidad: { type: 'NUMBER', description: 'Cantidad por 1 unidad de la receta.' },
          costoEstimado: { type: 'NUMBER', description: 'Costo unitario interno neto en CLP.' },
        },
        required: ['descripcion', 'categoria', 'unidad', 'cantidad', 'costoEstimado'],
      },
    },
  },
  required: ['nombre', 'unidad', 'componentes'],
};

export async function POST(req: Request) {
  let descripcion = '';
  try {
    const body = await req.json();
    descripcion = String(body?.descripcion ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }
  if (descripcion.length < 4) {
    return NextResponse.json({ error: 'Describe la receta con un poco más de detalle.' }, { status: 400 });
  }

  try {
    const receta = await generarJSON<RecetaIA>({
      system: SYSTEM,
      user: `Arma una receta para:\n\n${descripcion}`,
      schema: SCHEMA,
    });
    if (!receta?.componentes?.length) {
      return NextResponse.json({ error: 'La IA no generó componentes. Da más detalle.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, receta });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
