// POST /api/asignar-materiales   (form-data)
//   · materiales: JSON [{ clave: 'M1', descripcion, unidad, cantidad }] — los materiales del presupuesto
//     del trabajo con claves cortas (nunca los id).
//   · archivo: foto o PDF de la boleta o factura, O texto: una lista pegada (correo, WhatsApp, planilla).
//   → { doc, leidos, avisos, lineas: [{ descripcion, cantidad, unidad, monto, material: 'M3' | null,
//       cantidad_material }] }: el documento leído y cada línea cruzada con su material (fase 22).
//   Nunca guarda nada: la persona revisa la tabla y guarda la compra (o rinde el gasto).
// Requiere sesión y el permiso «Usar la IA». Fotos y PDF: la cadena de leer documentos (422
// «pdf_escaneado» si hay que reintentar como foto). Texto: la cadena de siempre (Groq → Gemini → Claude).

import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { generarJSON, leerArchivoJSON } from '@/lib/ia';
import {
  ESQUEMA_ASIGNACION, instruccionesAsignacion, MAX_MATERIALES, MAX_TEXTO_LISTA, normalizarRespuesta, type MaterialClave,
} from '@/lib/asignarMateriales';
import { archivoDelFormulario, errorDeLectura } from '@/lib/leerDocumentoServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Los materiales que mandó el navegador, acotados (es solo contexto para la IA). */
function materialesDe(v: FormDataEntryValue | null): MaterialClave[] {
  let lista: unknown = [];
  try { lista = JSON.parse(typeof v === 'string' ? v : '[]'); } catch { /* vacía */ }
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_MATERIALES).map((m, i) => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    return {
      clave: /^M\d{1,3}$/.test(String(o.clave)) ? String(o.clave) : `M${i + 1}`,
      descripcion: String(o.descripcion ?? '').slice(0, 120), unidad: String(o.unidad ?? '').slice(0, 20), cantidad: Number(o.cantidad) || 0,
    };
  }).filter(m => m.descripcion.trim());
}

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'ia.usar')) return sinPermiso();

  const fd = await req.formData().catch(() => null);
  const materiales = materialesDe(fd?.get('materiales') ?? null);
  const texto = typeof fd?.get('texto') === 'string' ? String(fd!.get('texto')).trim() : '';
  try {
    if (texto) {
      if (texto.length > MAX_TEXTO_LISTA) return NextResponse.json({ error: 'La lista es muy larga: pégala en partes.' }, { status: 413 });
      const crudo = await generarJSON<unknown>({
        system: instruccionesAsignacion(materiales, 'lista'),
        user: `Esta es la lista de lo comprado:\n${texto}`,
        schema: ESQUEMA_ASIGNACION,
        rescatar: true,
      });
      return NextResponse.json(normalizarRespuesta(crudo, materiales));
    }
    const archivo = await archivoDelFormulario(fd);
    if (archivo instanceof NextResponse) return archivo;
    const crudo = await leerArchivoJSON<unknown>({
      system: instruccionesAsignacion(materiales, 'documento'),
      user: 'Lee este documento, devuelve sus datos y cruza cada línea con los materiales presupuestados.',
      schema: ESQUEMA_ASIGNACION,
      archivo,
    });
    return NextResponse.json(normalizarRespuesta(crudo, materiales));
  } catch (e) {
    return errorDeLectura(e);
  }
}
