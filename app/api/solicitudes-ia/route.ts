import { NextResponse } from 'next/server';
import { usuarioAutenticado, noAutorizado } from '@/lib/authServidor';
import { generarJSON, type GeminiSchema } from '@/lib/ia';
import type { AnalisisIA } from '@/types/solicitud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM = `Eres un ingeniero de proyectos senior de InnVolt, empresa chilena de servicios eléctricos y tecnológicos (electricidad, control de acceso, CCTV, redes/datos, domótica/automatización, citofonía, energías renovables, iluminación/LED y mantención).

Tu tarea es ANALIZAR una solicitud de un cliente y transformarla en una propuesta técnica estructurada para que un cotizador humano la revise. NO cotizas ni pones precios: solo identificas el alcance técnico y qué información falta.

Debes entregar:
1. "resumen": 1-2 frases con el alcance interpretado.
2. "necesidades": los sistemas/trabajos técnicos que el proyecto requiere (con un detalle breve y, cuando aplique, el tipo de servicio).
3. "items_sugeridos": materiales, mano de obra, servicios y operaciones que probablemente se necesiten, con una cantidad y unidad SUGERIDAS (estimación técnica, NO precio). Cada uno con su categoría: material, mano_obra, servicio u operacion.
4. "informacion_faltante": preguntas concretas cuya respuesta permitiría cotizar con más precisión (cantidad de puertas/usuarios, distancias de cableado, canalización existente, alimentación eléctrica disponible, tipo de equipos, etc.). Explica por qué cada dato importa.

Reglas:
- NUNCA inventes precios ni montos en pesos. Las cantidades son estimaciones técnicas.
- Sé específico y realista para el mercado chileno.
- Si el usuario entregó "información adicional", incorpórala SIN perder el requerimiento original.
- Responde SIEMPRE en español.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING', description: 'Resumen breve del alcance interpretado.' },
    necesidades: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          titulo: { type: 'STRING' },
          detalle: { type: 'STRING' },
          tipo_servicio: { type: 'STRING', description: 'ej: Control de acceso, CCTV, Electricidad…' },
        },
        required: ['titulo', 'detalle'],
      },
    },
    items_sugeridos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descripcion: { type: 'STRING' },
          categoria: { type: 'STRING', enum: ['material', 'mano_obra', 'servicio', 'operacion'] },
          cantidad_sugerida: { type: 'NUMBER' },
          unidad: { type: 'STRING' },
        },
        required: ['descripcion', 'categoria', 'cantidad_sugerida', 'unidad'],
      },
    },
    informacion_faltante: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          pregunta: { type: 'STRING' },
          por_que: { type: 'STRING' },
        },
        required: ['pregunta', 'por_que'],
      },
    },
  },
  required: ['resumen', 'necesidades', 'items_sugeridos', 'informacion_faltante'],
};

export async function POST(req: Request) {
  if (!(await usuarioAutenticado(req))) return noAutorizado();
  let descripcion = '';
  let infoAdicional = '';
  let tipos = '';
  try {
    const body = await req.json();
    descripcion = String(body?.descripcion ?? '').trim();
    infoAdicional = String(body?.info_adicional ?? '').trim();
    tipos = Array.isArray(body?.tipos_servicio) ? body.tipos_servicio.join(', ') : '';
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }
  if (descripcion.length < 10) {
    return NextResponse.json({ error: 'Describe la solicitud con un poco más de detalle.' }, { status: 400 });
  }

  const user = [
    `Solicitud del cliente:\n${descripcion}`,
    tipos ? `\nTipos de servicio indicados: ${tipos}` : '',
    infoAdicional ? `\nInformación adicional aportada por el usuario:\n${infoAdicional}` : '',
  ].join('');

  try {
    const analisis = await generarJSON<Omit<AnalisisIA, 'generado_at'>>({ system: SYSTEM, user, schema: SCHEMA });
    return NextResponse.json({ ok: true, analisis: { ...analisis, generado_at: new Date().toISOString() } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
