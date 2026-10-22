import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { generarJSON, type GeminiSchema } from '@/lib/ia';

/**
 * «Mejorar con IA» de los textos de una cotización (introducción, presentación, descripción de
 * una partida, aclaraciones…). Devuelve una propuesta con el mismo formato simple del editor;
 * el usuario la revisa antes de usarla. Si el texto viene vacío, lo escribe desde el contexto.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GUIA: Record<string, string> = {
  introduccion: 'Introducción de una cotización: saluda o presenta brevemente, explica qué se cotiza y para qué, y el alcance general. Entre 50 y 150 palabras.',
  presentacion: 'Sección de la presentación de la cotización (quiénes somos, metodología, alcance, garantías…): clara y profesional. Entre 60 y 200 palabras.',
  portada: 'Texto corto de portada: una o dos líneas.',
  partida: 'Descripción comercial de una partida (lo que lee el cliente bajo su nombre): qué incluye, suministro e instalación. Máximo 50 palabras.',
  aclaraciones: 'Aclaraciones y garantías de una cotización: condiciones, exclusiones, garantía, plazos y formas de pago. CONSERVA TODAS las condiciones y cifras que ya existen (no quites ninguna); solo ordénalas y redáctalas mejor, idealmente con viñetas o numeradas.',
  importante: 'Texto «Importante» de la cotización: breve y directo.',
  general: 'Texto de un documento comercial de InnVolt.',
};

const SYSTEM = `Eres el redactor comercial y técnico de InnVolt SpA, empresa chilena de servicios eléctricos y tecnológicos (instalaciones eléctricas, iluminación, CCTV, redes, control de acceso, domótica, cargadores de vehículo eléctrico, fotovoltaico, mantención).

Mejoras textos de cotizaciones: claros, profesionales, cercanos y en español de Chile, de usted al cliente. Sin exagerar ni prometer lo que no está.

REGLAS
- No inventes datos: ni precios, ni plazos, ni marcas, ni cantidades, ni garantías que no aparezcan en el texto o en el contexto. Si falta un dato, no lo pongas.
- Conserva los nombres, cifras y condiciones que ya están.
- Formato permitido (el editor solo entiende esto): **negrita**, _cursiva_, líneas que empiezan con "- " para viñetas, "1. " para numeradas, "# " para título y "## " para subtítulo. Cada párrafo en su propia línea; una línea en blanco solo para separar bloques distintos (no entre cada párrafo ni dentro de una lista). Nada de tablas, enlaces ni emojis.
- Si el texto viene vacío, escríbelo desde cero con el contexto.
- Sigue la indicación del vendedor si la hay (más corto, más técnico, más formal…).
- «cambios»: una frase corta con lo que mejoraste.
Responde SIEMPRE con el JSON pedido.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: { texto: { type: 'STRING' }, cambios: { type: 'STRING' } },
  required: ['texto', 'cambios'],
};

const corto = (v: unknown, max: number) => String(v ?? '').slice(0, max);

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'ia.usar')) return sinPermiso();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 }); }

  const texto = corto(body.texto, 6000).trim();
  const contexto = corto(body.contexto, 3000).trim();
  const instruccion = corto(body.instruccion, 300).trim();
  const anterior = corto(body.anterior, 6000).trim();
  const tipo = typeof body.tipo === 'string' && GUIA[body.tipo] ? body.tipo : 'general';
  if (!texto && !contexto) return NextResponse.json({ error: 'Escribe algo primero (o agrega partidas para que la IA tenga de dónde partir).' }, { status: 400 });

  const user = `QUÉ ES ESTE TEXTO: ${GUIA[tipo]}
${contexto ? `\nCONTEXTO DE LA COTIZACIÓN:\n${contexto}\n` : ''}${instruccion ? `\nINDICACIÓN DEL VENDEDOR: ${instruccion}\n` : ''}
TEXTO ACTUAL:
${texto || '(vacío: escríbelo desde el contexto)'}${anterior ? `

YA PROPUSISTE ESTA VERSIÓN Y EL VENDEDOR PIDIÓ OTRA: haz una claramente distinta (otro orden, otras palabras), con las mismas reglas.
${anterior}` : ''}`;

  try {
    const r = await generarJSON<{ texto?: unknown; cambios?: unknown }>({ system: SYSTEM, user, schema: SCHEMA, rescatar: true });
    // En el editor cada línea es un párrafo y una línea en blanco es un hueco: a lo más uno seguido.
    const nuevo = typeof r?.texto === 'string' ? r.texto.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim() : '';
    if (!nuevo) return NextResponse.json({ error: 'La IA no devolvió texto. Intenta de nuevo.' }, { status: 502 });
    return NextResponse.json({ ok: true, texto: nuevo, cambios: typeof r.cambios === 'string' ? r.cambios.trim() : '' });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error desconocido' }, { status: 500 });
  }
}
