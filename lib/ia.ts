// ══════════════════════════════════════════════════════════════════════════════
// Cliente de IA server-side, con proveedor configurable.
//   · Gemini (Google AI Studio) — GRATIS con GEMINI_API_KEY.
//   · Anthropic (Claude)        — de pago, con ANTHROPIC_API_KEY.
// Selección: IA_PROVIDER ('gemini' | 'anthropic') o auto-detección por la key
// disponible (prioriza Gemini por ser gratuito).
//
// Los esquemas se declaran en formato Gemini (tipos en MAYÚSCULA). Para Anthropic
// se convierten a JSON Schema al vuelo.
// ══════════════════════════════════════════════════════════════════════════════

/** Esquema estilo Gemini (subconjunto de OpenAPI). */
export interface GeminiSchema {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  enum?: string[];
  description?: string;
}

type Proveedor = 'gemini' | 'anthropic';

function proveedorActivo(): Proveedor | null {
  const p = (process.env.IA_PROVIDER || '').toLowerCase();
  if (p === 'gemini' || p === 'anthropic') return p;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** Convierte un esquema Gemini a JSON Schema (para output_config.format de Anthropic). */
function aJsonSchema(g: GeminiSchema): Record<string, unknown> {
  const t = g.type.toLowerCase();
  const out: Record<string, unknown> = { type: t };
  if (g.enum) out.enum = g.enum;
  if (t === 'object') {
    out.additionalProperties = false;
    out.properties = Object.fromEntries(
      Object.entries(g.properties || {}).map(([k, v]) => [k, aJsonSchema(v)]),
    );
    out.required = g.required || Object.keys(g.properties || {});
  }
  if (t === 'array' && g.items) out.items = aJsonSchema(g.items);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Error interno de Gemini. `fallback=true` → conviene probar el siguiente modelo. */
class GeminiError extends Error {
  constructor(message: string, public fallback: boolean) {
    super(message);
    this.name = 'GeminiError';
  }
}

/**
 * Construye la cadena de modelos a intentar: primero el elegido (GEMINI_MODEL o
 * el default), luego respaldos con MÁS cuota gratuita (500 pedidos/día). Como
 * cada modelo tiene su propia cuota, si el primero da 429/503 el siguiente sigue
 * funcionando. Sin duplicados.
 */
function cadenaModelos(): string[] {
  const principal = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const respaldos = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  return [principal, ...respaldos.filter((m) => m !== principal)];
}

/**
 * Intenta un modelo concreto, con reintentos ante errores transitorios, SIN
 * pasarse del `deadline` (epoch ms). Cada fetch se aborta si va a exceder el
 * presupuesto, para que la función serverless responda antes del timeout de la
 * plataforma (Netlify corta ~10 s) y nunca devuelva un 504 crudo.
 */
async function pedirModeloGemini<T>(model: string, body: string, key: string, deadline: number): Promise<T> {
  const MAX_INTENTOS = 2;
  const CALL_CAP_MS = 7000; // tope duro por llamada
  let ultimoDetalle = '';

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const restante = deadline - Date.now();
    if (restante < 1500) throw new GeminiError(`${model}: sin tiempo suficiente (presupuesto agotado).`, true);

    const ctrl = new AbortController();
    const callMs = Math.min(CALL_CAP_MS, restante - 300);
    const timer = setTimeout(() => ctrl.abort(), callMs);

    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body,
          signal: ctrl.signal,
        },
      );
    } catch (e) {
      clearTimeout(timer);
      // Abort por presupuesto o error de red → transitorio, probar siguiente modelo.
      const abort = e instanceof Error && e.name === 'AbortError';
      throw new GeminiError(abort ? `${model}: la petición tardó demasiado.` : `${model}: error de red.`, true);
    }
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const cand = data?.candidates?.[0];
      if (cand?.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
        // Filtro de contenido: cambiar de modelo no ayuda → error fatal.
        throw new GeminiError('La IA no pudo completar la respuesta (posible filtro de contenido). Reformula la descripción.', false);
      }
      const texto: string = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
      if (!texto) throw new GeminiError('La IA no devolvió contenido. Intenta de nuevo.', true);
      return JSON.parse(texto) as T;
    }

    ultimoDetalle = await res.text().catch(() => '');

    // Cuota agotada de ESTE modelo → probar el siguiente (tiene cuota aparte).
    if (res.status === 429) throw new GeminiError(`Cuota diaria de ${model} agotada.`, true);
    // Llave inválida: es la misma para todos → fatal, no reintentar con otros.
    if (res.status === 400 && /API key not valid/i.test(ultimoDetalle)) throw new GeminiError('La GEMINI_API_KEY es inválida.', false);

    const transitorio = res.status === 503 || res.status === 500 || res.status === 502 || res.status === 504;
    // Reintentar solo si queda presupuesto para un backoff corto + otra llamada.
    if (transitorio && intento < MAX_INTENTOS && deadline - Date.now() > 3000) {
      await sleep(700);
      continue;
    }
    // Transitorio agotado (o modelo inexistente 404) → probar el siguiente modelo.
    throw new GeminiError(`${model}: HTTP ${res.status}. ${ultimoDetalle.slice(0, 140)}`, true);
  }

  throw new GeminiError(`${model} no respondió tras ${MAX_INTENTOS} intentos.`, true);
}

// ── Gemini (REST, sin SDK) ────────────────────────────────────────────────────
async function generarGemini<T>(system: string, user: string, schema: GeminiSchema): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GEMINI_API_KEY. Consíguela gratis en https://aistudio.google.com/apikey y agrégala al entorno.');

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.4,
    },
  });

  // Presupuesto total de tiempo. Debe quedar por DEBAJO del límite de la función
  // serverless (Netlify free ≈ 10 s) para responder con un error limpio en vez
  // de que la plataforma corte con un 504.
  const BUDGET_MS = 8500;
  const deadline = Date.now() + BUDGET_MS;

  const modelos = cadenaModelos();
  let ultimoError: GeminiError | null = null;

  for (const model of modelos) {
    if (deadline - Date.now() < 1500) break; // sin tiempo para otro modelo
    try {
      return await pedirModeloGemini<T>(model, body, key, deadline);
    } catch (e) {
      if (e instanceof GeminiError) {
        ultimoError = e;
        if (e.fallback) continue; // probar el siguiente modelo de la cadena
        throw new Error(e.message); // error fatal (llave inválida, filtro)
      }
      throw e;
    }
  }

  // Se agotaron todos los modelos de la cadena.
  const detalle = ultimoError?.message || '';
  throw new Error(`Sin cupo de IA disponible en este momento (se probaron ${modelos.length} modelos de Gemini). Espera unos minutos e intenta de nuevo. ${detalle}`);
}

// ── Anthropic (Claude) ────────────────────────────────────────────────────────
async function generarAnthropic<T>(system: string, user: string, schema: GeminiSchema): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const model = process.env.IA_MODEL || 'claude-opus-5';

  const stream = client.messages.stream({
    model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: aJsonSchema(schema) } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('El modelo no pudo procesar esta solicitud. Reformula la descripción.');
  const texto = msg.content.find((b) => b.type === 'text')?.text ?? '';
  return JSON.parse(texto) as T;
}

/** Genera un objeto JSON estructurado con el proveedor activo. */
export async function generarJSON<T>(opts: { system: string; user: string; schema: GeminiSchema }): Promise<T> {
  const prov = proveedorActivo();
  if (!prov) {
    throw new Error('No hay proveedor de IA configurado. Agrega GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el entorno del servidor.');
  }
  return prov === 'gemini'
    ? generarGemini<T>(opts.system, opts.user, opts.schema)
    : generarAnthropic<T>(opts.system, opts.user, opts.schema);
}
