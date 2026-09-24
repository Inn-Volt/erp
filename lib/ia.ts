// ══════════════════════════════════════════════════════════════════════════════
// Cliente de IA server-side con VARIOS proveedores y respaldo automático.
//
//   · Groq (gpt-oss-120b)      — GRATIS, sin tarjeta, ~1.000 consultas/día y muy
//                                 rápido. GROQ_API_KEY. (Recomendado como principal)
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
async function generarGroq<T>(system: string, user: string, schema: GeminiSchema, deadline: number): Promise<T> {
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

async function generarGemini<T>(system: string, user: string, schema: GeminiSchema, deadline: number): Promise<T> {
  const key = process.env.GEMINI_API_KEY as string;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 },
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

// ── Anthropic (Claude) ────────────────────────────────────────────────────────
async function generarAnthropic<T>(system: string, user: string, schema: GeminiSchema, deadline: number): Promise<T> {
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
    max_tokens: 6000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: esHaiku
      ? { format: { type: 'json_schema', schema: aJsonSchema(schema) } }
      : { effort: 'low', format: { type: 'json_schema', schema: aJsonSchema(schema) } },
    ...(esHaiku ? {} : { thinking: { type: 'adaptive' as const } }),
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

const GENERADORES: Record<ProveedorIA, <T>(s: string, u: string, sc: GeminiSchema, d: number) => Promise<T>> = {
  groq: generarGroq,
  gemini: generarGemini,
  anthropic: generarAnthropic,
};

/** Genera un objeto JSON estructurado probando los proveedores en cadena. */
export async function generarJSON<T>(opts: { system: string; user: string; schema: GeminiSchema }): Promise<T> {
  const proveedores = cadenaProveedores();
  if (!proveedores.length) {
    throw new Error('No hay IA configurada. Agrega GROQ_API_KEY (gratis, recomendada — console.groq.com), GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el entorno del servidor.');
  }
  const deadline = Date.now() + BUDGET_MS;
  const errores: string[] = [];
  for (const p of proveedores) {
    if (deadline - Date.now() < 1500) { errores.push(`${p}: sin tiempo`); break; }
    try {
      return await GENERADORES[p]<T>(opts.system, opts.user, opts.schema, deadline);
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
