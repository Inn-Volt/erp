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

// ── Gemini (REST, sin SDK) ────────────────────────────────────────────────────
async function generarGemini<T>(system: string, user: string, schema: GeminiSchema): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GEMINI_API_KEY. Consíguela gratis en https://aistudio.google.com/apikey y agrégala al entorno.');
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.4,
        },
      }),
    },
  );

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('Límite del tier gratuito de Gemini alcanzado. Espera un momento e intenta de nuevo.');
    if (res.status === 400 && /API key not valid/i.test(detalle)) throw new Error('La GEMINI_API_KEY es inválida.');
    throw new Error(`Gemini respondió HTTP ${res.status}. ${detalle.slice(0, 180)}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
    throw new Error('La IA no pudo completar la respuesta (posible filtro de contenido). Reformula la descripción.');
  }
  const texto: string = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
  if (!texto) throw new Error('La IA no devolvió contenido. Intenta de nuevo.');
  return JSON.parse(texto) as T;
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
