// IA (fase 22): el JSON de una respuesta (sin el razonamiento <think> ni el texto alrededor) y el
// orden de los proveedores que leen boletas y facturas. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonDeRespuesta, modeloVisionGroq, proveedoresConImagen } from '../../lib/ia.ts';

test('jsonDeRespuesta: saca el <think>…</think> y el texto alrededor', () => {
  assert.deepEqual(jsonDeRespuesta('<think>Veamos la boleta: dice {total}…</think>\n{"total": 11900, "folio": "77"}'), { total: 11900, folio: '77' });
  assert.deepEqual(jsonDeRespuesta('Aquí está el JSON:\n```json\n{"lineas": [{"monto": 1}]}\n```\nListo.'), { lineas: [{ monto: 1 }] });
  assert.deepEqual(jsonDeRespuesta('pensando sin abrir…</think>{"ok": true}'), { ok: true });
  assert.throws(() => jsonDeRespuesta('No pude leer el documento.'), /no trae JSON/);
  assert.throws(() => jsonDeRespuesta('{"total": 119'), /no trae JSON|incompleto/);
});

test('Los que leen documentos van en el orden de la cadena (Groq primero) y IA_PROVIDER adelanta a uno', () => {
  const antes = { ...process.env };
  try {
    for (const k of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'IA_PROVIDER']) delete process.env[k];
    assert.deepEqual(proveedoresConImagen(), []);
    process.env.GROQ_API_KEY = 'x';
    assert.deepEqual(proveedoresConImagen(), ['groq']);                 // con solo Groq ya se leen boletas
    process.env.GEMINI_API_KEY = 'x'; process.env.ANTHROPIC_API_KEY = 'x';
    assert.deepEqual(proveedoresConImagen(), ['groq', 'gemini', 'anthropic']);
    process.env.IA_PROVIDER = 'anthropic';
    assert.deepEqual(proveedoresConImagen(), ['anthropic', 'groq', 'gemini']);
    process.env.IA_PROVIDER = 'gemini';
    delete process.env.GROQ_API_KEY;
    assert.deepEqual(proveedoresConImagen(), ['gemini', 'anthropic']);
  } finally {
    for (const k of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'IA_PROVIDER']) {
      if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k];
    }
  }
});

test('El modelo de visión de Groq se puede cambiar con GROQ_MODEL_VISION', () => {
  const antes = process.env.GROQ_MODEL_VISION;
  try {
    delete process.env.GROQ_MODEL_VISION;
    assert.equal(modeloVisionGroq(), 'qwen/qwen3.8-27b');
    process.env.GROQ_MODEL_VISION = 'meta-models/muse-spark-open';
    assert.equal(modeloVisionGroq(), 'meta-models/muse-spark-open');
  } finally {
    if (antes === undefined) delete process.env.GROQ_MODEL_VISION; else process.env.GROQ_MODEL_VISION = antes;
  }
});
