// ══════════════════════════════════════════════════════════════════════════════
// Cliente de IA server-side con VARIOS proveedores y respaldo automático.
//
//   · Groq (gpt-oss-120b)      — GRATIS, sin tarjeta, ~1.000 consultas/día y muy
//                                 rápido. GROQ_API_KEY. (Recomendado como principal)
//                                 Las fotos de boletas y facturas, con su modelo de
//                                 visión (GROQ_MODEL_VISION); los PDF, por su texto.
//   · Gemini (flash-lite)      — GRATIS, ~500 consultas/día por modelo. GEMINI_API_KEY.
//   · Anthropic (Claude Haiku) — de pago por uso (centavos por consulta).
//                                 ANTHROPIC_API_KEY. Es APARTE del plan Claude Pro.
//
// Se prueban en ese orden (gratis y rápidos primero); si uno falla, se agota o
// tarda, se salta al siguiente. IA_PROVIDER fuerza cuál va primero.
//
// Todo corre dentro de un PRESUPUESTO de tiempo común: Netlify corta la función
// a los ~10 s, así que respondemos antes con un error claro en vez de un 504.
//
// Los esquemas se declaran en formato Gemini (tipos en MAYÚSCULA) y se convierten
// a JSON Schema para Groq y Anthropic.
// ══════════════════════════════════════════════════════════════════════════════

import type Anthropic from '@anthropic-ai/sdk';

/** Esquema estilo Gemini (subconjunto de OpenAPI). */
export interface GeminiSchema {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  enum?: string[];
  description?: string;
}

export type ProveedorIA = 'groq' | 'gemini' | 'anthropic';

/** Presupuesto total: por debajo del límite de la función serverless (Netlify ≈ 10 s). */
const BUDGET_MS = 9300;

/** Error de un proveedor. Siempre se intenta el siguiente de la cadena. */
class IAError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IAError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Proveedores con key configurada, en orden de uso (IA_PROVIDER va primero). */
export function cadenaProveedores(): ProveedorIA[] {
  const disponibles: ProveedorIA[] = [];
  if (process.env.GROQ_API_KEY) disponibles.push('groq');
  if (process.env.GEMINI_API_KEY) disponibles.push('gemini');
  if (process.env.ANTHROPIC_API_KEY) disponibles.push('anthropic');
  const pref = (process.env.IA_PROVIDER || '').toLowerCase() as ProveedorIA;
  const i = disponibles.indexOf(pref);
  if (i > 0) { disponibles.splice(i, 1); disponibles.unshift(pref); }
  return disponibles;
}

/**
 * Convierte un esquema Gemini a JSON Schema. Con `estricto` todos los campos
 * pasan a ser obligatorios (requisito del modo strict de Groq/OpenAI).
 */
function aJsonSchema(g: GeminiSchema, estricto = false): Record<string, unknown> {
  const t = g.type.toLowerCase();
  const out: Record<string, unknown> = { type: t };
  if (g.enum) out.enum = g.enum;
  if (g.description) out.description = g.description;
  if (t === 'object') {
    const props = g.properties || {};
    out.additionalProperties = false;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, aJsonSchema(v, estricto)]));
    out.required = estricto ? Object.keys(props) : (g.required || Object.keys(props));
  }
  if (t === 'array' && g.items) out.items = aJsonSchema(g.items, estricto);
  return out;
}

/** fetch que se aborta si va a exceder el presupuesto (o el tope por llamada). */
async function fetchConPresupuesto(url: string, init: RequestInit, deadline: number, capMs: number): Promise<Response> {
  const restante = deadline - Date.now();
  if (restante < 1500) throw new IAError('sin tiempo suficiente');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(capMs, restante - 350));
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    const abort = e instanceof Error && e.name === 'AbortError';
    throw new IAError(abort ? 'la petición tardó demasiado' : 'error de red');
  } finally {
    clearTimeout(timer);
  }
}

// ── Groq (API compatible con OpenAI) ──────────────────────────────────────────
async function generarGroq<T>(system: string, user: string, schema: GeminiSchema, deadline: number, rescatar = false): Promise<T> {
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const res = await fetchConPresupuesto('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'respuesta', strict: true, schema: aJsonSchema(schema, true) },
      },
      // Razonamiento mínimo y oculto: ahorra tokens del cupo gratis y tiempo.
      reasoning_effort: 'low',
      include_reasoning: false,
      max_completion_tokens: 6000,
    }),
  }, deadline, 9000);

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    if (res.status === 401) throw new IAError('GROQ_API_KEY inválida');
    if (res.status === 429) throw new IAError('cupo de Groq agotado');
    // Groq rechaza la respuesta si no calza EXACTO con el esquema, pero la adjunta en
    // `failed_generation`. Casi siempre es JSON válido con un detalle menor (un número
    // como texto, un campo de más). Solo se rescata si quien llama la normaliza.
    if (res.status === 400 && rescatar) {
      let generado = '';
      try { generado = JSON.parse(detalle)?.error?.failed_generation || ''; } catch { /* sin detalle */ }
      if (generado) {
        try { return JSON.parse(generado) as T; } catch { /* JSON cortado: no se puede rescatar */ }
      }
      throw new IAError(generado ? 'respuesta incompleta' : `HTTP 400 ${detalle.slice(0, 120)}`);
    }
    throw new IAError(`HTTP ${res.status} ${detalle.slice(0, 120)}`);
  }
  const data = await res.json();
  const texto: string = data?.choices?.[0]?.message?.content || '';
  if (!texto) throw new IAError('respuesta vacía');
  return JSON.parse(texto) as T;
}

// ── Gemini (REST) ─────────────────────────────────────────────────────────────
/**
 * Modelos Gemini a intentar: el elegido (GEMINI_MODEL) y respaldos "lite" con
 * más cuota gratuita. Cada modelo tiene su propia cuota diaria.
 */
function cadenaModelosGemini(): string[] {
  const principal = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const respaldos = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'];
  return [principal, ...respaldos.filter((m) => m !== principal)];
}

async function pedirModeloGemini<T>(model: string, body: string, key: string, deadline: number): Promise<T> {
  const MAX_INTENTOS = 2;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const res = await fetchConPresupuesto(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body },
      deadline, 9000,
    );
    if (res.ok) {
      const data = await res.json();
      const cand = data?.candidates?.[0];
      if (cand?.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
        throw new IAError('respuesta bloqueada por filtro de contenido');
      }
      const texto: string = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
      if (!texto) throw new IAError('respuesta vacía');
      return JSON.parse(texto) as T;
    }
    const detalle = await res.text().catch(() => '');
    if (res.status === 429) throw new IAError(`cuota de ${model} agotada`);
    if (res.status === 400 && /API key not valid/i.test(detalle)) throw new IAError('GEMINI_API_KEY inválida');
    const transitorio = [500, 502, 503, 504].includes(res.status);
    if (transitorio && intento < MAX_INTENTOS && deadline - Date.now() > 3000) { await sleep(700); continue; }
    throw new IAError(`${model} HTTP ${res.status}`);
  }
  throw new IAError(`${model} no respondió`);
}

/** Pide a Gemini (probando sus modelos) con estas partes en el mensaje: texto, imagen o PDF. */
async function pedirGemini<T>(system: string, partes: unknown[], schema: GeminiSchema, deadline: number, temperature: number): Promise<T> {
  const key = process.env.GEMINI_API_KEY as string;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: partes }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
  });
  const errores: string[] = [];
  for (const model of cadenaModelosGemini()) {
    if (deadline - Date.now() < 1500) break;
    try {
      return await pedirModeloGemini<T>(model, body, key, deadline);
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
      if (e instanceof Error && /API key/.test(e.message)) break; // misma key para todos
    }
  }
  throw new IAError(errores.join('; ') || 'sin respuesta');
}

function generarGemini<T>(system: string, user: string, schema: GeminiSchema, deadline: number): Promise<T> {
  return pedirGemini<T>(system, [{ text: user }], schema, deadline, 0.4);
}

// ── Anthropic (Claude) ────────────────────────────────────────────────────────
/** Pide a Claude con este contenido (texto, o bloques con imagen o PDF). `pensar`: razonamiento breve (no en Haiku). */
async function pedirAnthropic<T>(system: string, content: string | Anthropic.ContentBlockParam[], schema: GeminiSchema, deadline: number,
                                 o: { maxTokens: number; pensar: boolean }): Promise<T> {
  const restante = deadline - Date.now();
  if (restante < 2500) throw new IAError('sin tiempo suficiente');
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk');
  // Sin reintentos internos: el presupuesto de tiempo lo controlamos aquí.
  const client = new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  // Haiku 4.5 por defecto: rápido (cabe en el límite de Netlify) y el más barato.
  const model = process.env.IA_MODEL || 'claude-haiku-4-5';
  const esHaiku = /haiku/i.test(model);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: o.maxTokens,
    system,
    messages: [{ role: 'user', content }],
    output_config: esHaiku
      ? { format: { type: 'json_schema', schema: aJsonSchema(schema) } }
      : { effort: 'low', format: { type: 'json_schema', schema: aJsonSchema(schema) } },
    ...(esHaiku || !o.pensar ? {} : { thinking: { type: 'adaptive' as const } }),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), restante - 350);
  try {
    const msg = await client.messages.create(params, { signal: ctrl.signal });
    if (msg.stop_reason === 'refusal') throw new IAError('el modelo rechazó la solicitud');
    const bloque = msg.content.find((b) => b.type === 'text');
    const texto = bloque && bloque.type === 'text' ? bloque.text : '';
    if (!texto) throw new IAError('respuesta vacía');
    return JSON.parse(texto) as T;
  } catch (e) {
    if (e instanceof IAError) throw e;
    const m = e instanceof Error ? e.message : String(e);
    throw new IAError(/abort/i.test(m) ? 'la petición tardó demasiado' : m.slice(0, 120));
  } finally {
    clearTimeout(timer);
  }
}

function generarAnthropic<T>(system: string, user: string, schema: GeminiSchema, deadline: number): Promise<T> {
  return pedirAnthropic<T>(system, user, schema, deadline, { maxTokens: 6000, pensar: true });
}

const GENERADORES: Record<ProveedorIA, <T>(s: string, u: string, sc: GeminiSchema, d: number, rescatar?: boolean) => Promise<T>> = {
  groq: generarGroq,
  gemini: generarGemini,
  anthropic: generarAnthropic,
};

/**
 * Genera un objeto JSON estructurado probando los proveedores en cadena.
 * `rescatar`: acepta una respuesta que no calzó exacto con el esquema (Groq la
 * adjunta al error). Úsalo SOLO si el resultado se normaliza después.
 */
export async function generarJSON<T>(opts: { system: string; user: string; schema: GeminiSchema; rescatar?: boolean }): Promise<T> {
  const proveedores = cadenaProveedores();
  if (!proveedores.length) {
    throw new Error('No hay IA configurada. Agrega GROQ_API_KEY (gratis, recomendada — console.groq.com), GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el entorno del servidor.');
  }
  const deadline = Date.now() + BUDGET_MS;
  const errores: string[] = [];
  for (const p of proveedores) {
    if (deadline - Date.now() < 1500) { errores.push(`${p}: sin tiempo`); break; }
    try {
      return await GENERADORES[p]<T>(opts.system, opts.user, opts.schema, deadline, opts.rescatar);
    } catch (e) {
      errores.push(`${p}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
  throw new Error(`La IA no está disponible en este momento; intenta de nuevo en unos minutos. (${errores.join(' · ')})`);
}

/**
 * Prueba un proveedor puntual con una consulta mínima (para el diagnóstico en
 * Configuración). Devuelve latencia o el error.
 */
export async function probarProveedor(p: ProveedorIA): Promise<{ ok: boolean; ms: number; detalle: string }> {
  const t0 = Date.now();
  const schema: GeminiSchema = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] };
  try {
    await GENERADORES[p]<{ ok: boolean }>('Responde en JSON.', 'Devuelve {"ok": true}.', schema, Date.now() + BUDGET_MS);
    return { ok: true, ms: Date.now() - t0, detalle: 'Funciona' };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detalle: e instanceof Error ? e.message : 'error' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Leer documentos (fases 20 y 22): una foto o PDF de una boleta o factura → JSON.
// Misma cadena que generarJSON (Groq → Gemini → Claude; IA_PROVIDER adelanta a uno), con el mismo
// presupuesto de tiempo:
//   · Groq: las fotos con su modelo de visión (GROQ_MODEL_VISION, modo JSON: el esquema va escrito
//     en el mensaje). Un PDF no lo recibe: se le saca el texto (unpdf; las facturas electrónicas lo
//     traen adentro) y va al modelo de texto de siempre. Un PDF escaneado (casi sin texto) no se
//     puede leer así: si Groq es el único proveedor, la ruta responde 422 «pdf_escaneado» y el
//     navegador lo reintenta como foto.
//   · Gemini y Claude leen la imagen o el PDF directo.
// ══════════════════════════════════════════════════════════════════════════════

export type ProveedorImagen = ProveedorIA;
export interface ArchivoIA { base64: string; mime: string }
type MedioImagen = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** Modelo de visión de Groq (console.groq.com/docs/vision; hasta 3 imágenes por consulta). */
export const modeloVisionGroq = () => process.env.GROQ_MODEL_VISION || 'qwen/qwen3.8-27b';
/** Menos letras que esto en un PDF = es una imagen escaneada. */
const MIN_TEXTO_PDF = 40;

/** El PDF es una imagen escaneada: sin texto que leer (el navegador lo reintenta como foto). */
export class PdfEscaneadoError extends Error {
  readonly codigo = 'pdf_escaneado';
  constructor() {
    super('El PDF es una imagen escaneada y Groq solo lee el texto de los PDF: se reintenta como foto.');
    this.name = 'PdfEscaneadoError';
  }
}

/** Proveedores configurados que leen documentos (vacío = no hay cómo): todos, en el orden de la cadena. */
export function proveedoresConImagen(): ProveedorImagen[] {
  return cadenaProveedores();
}

/** El JSON de una respuesta: sin el razonamiento (<think>…</think>), sin ```json y sin texto alrededor. */
export function jsonDeRespuesta<T = unknown>(texto: string): T {
  const s = String(texto || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*<\/think>/i, '')        // un cierre sin su apertura
    .replace(/```(?:json)?/gi, '');
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) throw new IAError('la respuesta no trae JSON');
  try {
    return JSON.parse(s.slice(i, j + 1)) as T;
  } catch {
    throw new IAError('la respuesta trae un JSON incompleto');
  }
}

/** El error de Groq en palabras (401, 429, 413, modelo retirado…). */
function errorGroq(status: number, detalle: string, model: string): IAError {
  if (status === 401) return new IAError('GROQ_API_KEY inválida');
  if (status === 429) return new IAError('cupo de Groq agotado');
  if (status === 413) return new IAError('el archivo pesa demasiado para Groq');
  if (/decommission|deprecat|model_not_found|does not exist|not found/i.test(detalle) || status === 404) {
    return new IAError(`el modelo ${model} de Groq fue retirado o no existe: cambia GROQ_MODEL_VISION`);
  }
  return new IAError(`HTTP ${status} ${detalle.slice(0, 120)}`);
}

/** Una foto con el modelo de visión de Groq en modo JSON (el esquema va escrito en el mensaje). */
async function leerImagenGroq<T>(system: string, user: string, schema: GeminiSchema, archivo: ArchivoIA, deadline: number): Promise<T> {
  const model = modeloVisionGroq();
  const res = await fetchConPresupuesto('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: `${user}\n\nResponde SOLO con un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(aJsonSchema(schema, true))}` },
            { type: 'image_url', image_url: { url: `data:${archivo.mime};base64,${archivo.base64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      // Sin razonamiento: más rápido (cabe en el límite de Netlify) y el modo JSON no admite el «raw».
      reasoning_effort: 'none',
      reasoning_format: 'hidden',
      temperature: 0.1,
      max_completion_tokens: 6000,
    }),
  }, deadline, 9000);
  if (!res.ok) throw errorGroq(res.status, await res.text().catch(() => ''), model);
  const data = await res.json();
  const texto: string = data?.choices?.[0]?.message?.content || '';
  if (!texto) throw new IAError('respuesta vacía');
  return jsonDeRespuesta<T>(texto);
}

/** El texto de un PDF (unpdf, cargado solo aquí). */
async function textoDePdf(base64: string): Promise<string> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } finally {
    // PDFDocumentProxy no tiene destroy(): se libera con su tarea de carga.
    await pdf.loadingTask.destroy().catch(() => {});
  }
}

/** Un PDF con Groq: su texto al modelo de texto (esquema estricto; se rescata lo que no calce exacto). */
async function leerPdfGroq<T>(system: string, user: string, schema: GeminiSchema, archivo: ArchivoIA, deadline: number): Promise<T> {
  let texto: string;
  try { texto = await textoDePdf(archivo.base64); } catch { throw new IAError('no se pudo abrir el PDF'); }
  if (texto.replace(/\s/g, '').length < MIN_TEXTO_PDF) throw new PdfEscaneadoError();
  return generarGroq<T>(system, `${user}\n\nTexto del documento (sacado del PDF):\n${texto.slice(0, 20000)}`, schema, deadline, true);
}

function leerGroq<T>(system: string, user: string, schema: GeminiSchema, archivo: ArchivoIA, deadline: number): Promise<T> {
  return archivo.mime === 'application/pdf'
    ? leerPdfGroq<T>(system, user, schema, archivo, deadline)
    : leerImagenGroq<T>(system, user, schema, archivo, deadline);
}

function leerGemini<T>(system: string, user: string, schema: GeminiSchema, archivo: ArchivoIA, deadline: number): Promise<T> {
  return pedirGemini<T>(system, [{ inlineData: { mimeType: archivo.mime, data: archivo.base64 } }, { text: user }], schema, deadline, 0.1);
}

function leerAnthropic<T>(system: string, user: string, schema: GeminiSchema, archivo: ArchivoIA, deadline: number): Promise<T> {
  const adjunto: Anthropic.ContentBlockParam = archivo.mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivo.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: archivo.mime as MedioImagen, data: archivo.base64 } };
  // Una factura larga trae muchas líneas: espacio de sobra para el detalle.
  return pedirAnthropic<T>(system, [adjunto, { type: 'text', text: user }], schema, deadline, { maxTokens: 6000, pensar: false });
}

const LECTORES: Record<ProveedorImagen, <T>(s: string, u: string, sc: GeminiSchema, a: ArchivoIA, d: number) => Promise<T>> = {
  groq: leerGroq,
  gemini: leerGemini,
  anthropic: leerAnthropic,
};

/** Lee una imagen o un PDF y devuelve el JSON del esquema, probando los proveedores en cadena.
 *  Lanza PdfEscaneadoError si el PDF es una imagen y Groq era el único que podía leerlo. */
export async function leerArchivoJSON<T>(opts: { system: string; user: string; schema: GeminiSchema; archivo: ArchivoIA }): Promise<T> {
  const proveedores = proveedoresConImagen();
  if (!proveedores.length) {
    throw new Error('No hay IA que lea documentos: agrega GROQ_API_KEY (gratis), GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el entorno del servidor.');
  }
  const deadline = Date.now() + BUDGET_MS;
  const errores: string[] = [];
  let escaneado = false;
  for (const p of proveedores) {
    if (deadline - Date.now() < 1500) { errores.push(`${p}: sin tiempo`); break; }
    try {
      return await LECTORES[p]<T>(opts.system, opts.user, opts.schema, opts.archivo, deadline);
    } catch (e) {
      if (e instanceof PdfEscaneadoError) escaneado = true;
      errores.push(`${p}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
  if (escaneado && proveedores.length === 1) throw new PdfEscaneadoError();
  throw new Error(`La IA no pudo leer el documento; intenta de nuevo en unos minutos. (${errores.join(' · ')})`);
}
