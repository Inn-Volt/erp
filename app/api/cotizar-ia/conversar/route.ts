import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { generarJSON } from '@/lib/ia';
import { normalizarComponentes, normalizarTurno, type CandidatoProducto, type CandidatoReceta, type MensajeIA, type PlanPartida } from '@/lib/cotizador/iaConversacion';
import { pedidoConversar, pedidoPartida, SCHEMA_CONVERSAR, SCHEMA_PARTIDA, SYSTEM_CONVERSAR, SYSTEM_PARTIDA } from '@/lib/cotizador/iaConversacionPrompt';

/**
 * Cotizar con IA conversando (cualquier servicio de InnVolt). Dos modos:
 *   · «conversar»: recibe la conversación y devuelve preguntas (con opciones) o el plan de partidas.
 *   · «partida»: recibe una partida del plan y una preselección de la biblioteca (productos y
 *     recetas) y devuelve sus componentes.
 * Cada llamada es corta: la función del servidor corta a los ~10 s.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const error = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const texto = (v: unknown, max: number) => String(v ?? '').slice(0, max);

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'ia.usar')) return sinPermiso();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return error('Cuerpo de la solicitud inválido.', 400); }

  try {
    if (body.modo === 'partida') {
      const p = (body.partida || {}) as Partial<PlanPartida>;
      const partida: PlanPartida = {
        nombre: texto(p.nombre, 160), descripcion: texto(p.descripcion, 600), cantidad: Number(p.cantidad) || 1,
        unidad: texto(p.unidad, 20) || 'global', alcance: texto(p.alcance, 2000),
      };
      if (!partida.nombre) return error('Falta la partida.', 400);
      const productos = (Array.isArray(body.productos) ? body.productos : []).slice(0, 90) as CandidatoProducto[];
      const recetas = (Array.isArray(body.recetas) ? body.recetas : []).slice(0, 15) as CandidatoReceta[];
      const user = pedidoPartida(texto(body.contexto, 3000), partida, productos, recetas);
      const componentes = normalizarComponentes(await generarJSON<unknown>({ system: SYSTEM_PARTIDA, user, schema: SCHEMA_PARTIDA, rescatar: true }));
      if (!componentes.length) return error('La IA no armó componentes para esta partida. Intenta de nuevo.', 502);
      return NextResponse.json({ ok: true, componentes });
    }

    const mensajes: MensajeIA[] = (Array.isArray(body.mensajes) ? body.mensajes : []).slice(-24)
      .map((m: { rol?: string; texto?: string }) => ({ rol: m?.rol === 'asistente' ? 'asistente' as const : 'usuario' as const, texto: texto(m?.texto, 3000) }))
      .filter(m => m.texto.trim());
    if (!mensajes.length || mensajes[0].rol !== 'usuario' || mensajes[0].texto.trim().length < 5) return error('Escribe el requerimiento para empezar.', 400);
    const recetas = (Array.isArray(body.recetas) ? body.recetas : []).map(r => texto(r, 80)).filter(Boolean);
    const { user, debePlan } = pedidoConversar(mensajes, !!body.generarYa, recetas);
    const turno = normalizarTurno(await generarJSON<unknown>({ system: SYSTEM_CONVERSAR, user, schema: SCHEMA_CONVERSAR, rescatar: true }));
    if (debePlan && turno.tipo !== 'plan') return error('La IA no alcanzó a armar el plan. Intenta «Generar cotización» de nuevo.', 502);
    if (turno.tipo === 'preguntas' && !turno.preguntas.length && !turno.mensaje) return error('La IA respondió vacío. Intenta de nuevo.', 502);
    return NextResponse.json({ ok: true, turno });
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Error desconocido', 500);
  }
}
