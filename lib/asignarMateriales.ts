/**
 * Registrar una compra con IA (fase 22): lo que dice una boleta, una factura o una lista pegada (de
 * un correo, WhatsApp o una planilla) se cruza con los materiales del presupuesto del trabajo.
 * Sin React ni Supabase (pruebas: tests/unit/asignarMateriales.test.ts).
 *
 *  · A la IA nunca se le pasan los id: cada material va con una clave corta (M1, M2…) y ella
 *    responde con esa clave. También convierte la cantidad a la unidad del material (1 rollo de
 *    100 m → 100 m).
 *  · Si la IA no responde o no asigna, se sugiere comparando palabras (sugerirLinea) y la unidad se
 *    convierte con lo que diga la descripción («rollo 100 m», «caja x 10»).
 *  · previaMateriales: así quedan los materiales con esta compra (comprado, pendiente, de más).
 *  · La cantidad se guarda en la unidad del material, para que el pendiente cuadre.
 */

import type { GeminiSchema } from '@/lib/ia';
import { sugerirLinea } from '@/lib/anteproyecto';
import { ESQUEMA_DOCUMENTO, INSTRUCCIONES_DOCUMENTO, montoLeido, normalizarDocumento, type LecturaDocumento, type LineaLeida } from '@/lib/leerDocumento';

const n = (v: unknown) => Number(v) || 0;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Lo más que se le manda a la IA (materiales y caracteres de una lista pegada). */
export const MAX_MATERIALES = 150;
export const MAX_TEXTO_LISTA = 12000;

/** Un material del presupuesto para asignarle lo comprado. */
export interface MaterialAsignable {
  id: string; descripcion: string; unidad: string | null; cantidad: number; partida_id: string | null;
  /** Lo ya comprado (en la unidad del material). */
  comprado?: number;
}
/** Lo que viaja a la IA: la clave corta en vez del id. */
export interface MaterialClave { clave: string; descripcion: string; unidad: string; cantidad: number }

export function clavesMateriales(lista: MaterialAsignable[]): { claves: MaterialClave[]; idDe: Map<string, string> } {
  const claves: MaterialClave[] = [], idDe = new Map<string, string>();
  lista.slice(0, MAX_MATERIALES).forEach((m, i) => {
    const clave = `M${i + 1}`;
    claves.push({ clave, descripcion: texto(m.descripcion, 120), unidad: texto(m.unidad, 20), cantidad: r3(n(m.cantidad)) });
    idDe.set(clave, m.id);
  });
  return { claves, idDe };
}

// ── Unidades ────────────────────────────────────────────────────────────────
const UNIDADES: [RegExp, string][] = [
  [/^(m|mt|mts|mtr|mtrs|metro|metros|ml)$/, 'm'],
  [/^(un|u|und|unid|unidad|unidades|c\/u|cu|pza|pieza|piezas|ud)$/, 'un'],
  [/^(rollo|rollos|rll|rl)$/, 'rollo'],
  [/^(caja|cajas|cj|cja)$/, 'caja'],
  [/^(kg|kilo|kilos)$/, 'kg'],
  [/^(gl|glb|global)$/, 'gl'],
  [/^(paq|paquete|paquetes|pack|bolsa|bolsas)$/, 'paquete'],
  [/^(lt|l|litro|litros)$/, 'l'],
];
/** «Mts.», «metros» → «m»; «c/u», «unid» → «un». Vacío si no se sabe. */
export function unidadNormal(u: string | null | undefined): string {
  const t = String(u ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '').trim();
  if (!t) return '';
  return UNIDADES.find(([re]) => re.test(t))?.[1] || t;
}

/** La cantidad comprada en la unidad del material, con lo que diga la descripción («rollo 100 m»,
 *  «caja x 10»). Si no se puede saber, la misma cantidad (y `convertida` = false). */
export function convertirUnidad(descripcion: string, cantidad: number | null, unidad: string, unidadMaterial: string | null): { cantidad: number | null; convertida: boolean } {
  if (cantidad === null || !(cantidad > 0)) return { cantidad, convertida: false };
  const de = unidadNormal(unidad), a = unidadNormal(unidadMaterial);
  if (!a || !de || de === a) return { cantidad, convertida: false };
  const d = (descripcion || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  if (a === 'm') {
    const m = d.match(/(\d+(?:\.\d+)?)\s*(?:m|mt|mts|mtrs?|metros?)\b/);
    if (m && n(m[1]) > 1) return { cantidad: r3(cantidad * n(m[1])), convertida: true };
  }
  if (a === 'un') {
    const m = d.match(/(?:x|por|de|caja|pack|bolsa|paquete)\s*(\d+)\s*(?:un|u|und|unid|unidades|pzas?)?\b/) || d.match(/(\d+)\s*(?:un|unid|unidades|pzas?)\b/);
    if (m && n(m[1]) > 1) return { cantidad: r3(cantidad * n(m[1])), convertida: true };
  }
  return { cantidad, convertida: false };
}

// ── La IA ───────────────────────────────────────────────────────────────────
/** El documento con su detalle, y cada línea con su material (clave) y la cantidad en su unidad. */
export const ESQUEMA_ASIGNACION: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    ...ESQUEMA_DOCUMENTO.properties,
    lineas: {
      type: 'ARRAY', description: 'Cada producto comprado, en orden',
      items: {
        type: 'OBJECT',
        properties: {
          descripcion: { type: 'STRING', description: 'El producto como aparece' },
          cantidad: { type: 'NUMBER', description: 'Cantidad como aparece (0 si no aparece)' },
          unidad: { type: 'STRING', description: 'Unidad como aparece: un, m, rollo, caja… (vacío si no aparece)' },
          monto: { type: 'NUMBER', description: 'Total de la línea en pesos, tal como aparece (0 si no aparece)' },
          material: { type: 'STRING', description: 'Clave del material de la lista (M1, M2…) al que corresponde; vacío si no está' },
          cantidad_material: { type: 'NUMBER', description: 'La cantidad convertida a la unidad de ese material (0 si no hay material)' },
        },
        required: ['descripcion', 'cantidad', 'unidad', 'monto', 'material', 'cantidad_material'],
      },
    },
  },
  required: ESQUEMA_DOCUMENTO.required,
};

export function instruccionesAsignacion(materiales: MaterialClave[], fuente: 'documento' | 'lista'): string {
  const lista = materiales.length
    ? materiales.map(m => `${m.clave} · ${m.descripcion} · unidad: ${m.unidad || 'sin unidad'} · presupuestado: ${m.cantidad}`).join('\n')
    : '(el trabajo no tiene materiales presupuestados)';
  return `${fuente === 'documento' ? INSTRUCCIONES_DOCUMENTO : `Lees una lista de materiales comprados pegada desde un correo, WhatsApp o una planilla (Chile).
Cada línea suele traer cantidad, unidad, producto y a veces el precio. Si no hay proveedor, folio, fecha ni montos del documento, deja el texto vacío y los números en 0.
Montos en pesos chilenos como números enteros (el punto separa miles: 12.500 = 12500).`}

Además cruza cada línea con los materiales presupuestados del trabajo:
- material: la clave (M1, M2…) del material que es el mismo producto (aunque esté escrito distinto: abreviado, con la marca, en otro orden). Si no está en la lista, deja vacío. No inventes claves.
- cantidad_material: la cantidad comprada convertida a la unidad de ese material. Ejemplos: 1 rollo de 100 m con material en m → 100; 2 cajas x 10 con material en un → 20; si la unidad es la misma, la misma cantidad.

Materiales presupuestados:
${lista}

Responde SIEMPRE con el JSON pedido.`;
}

/** Una línea ya cruzada: la clave de la IA pasa a ser el id del material. */
export interface LineaAsignada extends LineaLeida {
  /** null = no cotizado (adicional). */
  presupuesto_linea_id: string | null;
  /** La cantidad en la unidad del material (la que se guarda). */
  cantidad_material: number | null;
  /** Quién sugirió el material: la IA, la comparación de palabras o nadie. */
  sugerida: 'ia' | 'palabras' | null;
}
export interface LecturaAsignada extends LecturaDocumento { lineas: LineaAsignada[] }

/** Lo que responde la ruta (sin id): el documento y cada línea con su clave. */
export interface RespuestaAsignacion extends LecturaDocumento {
  lineas: (LineaLeida & { material: string | null; cantidad_material: number | null })[];
}

/** En el servidor: ordena lo que respondió la IA (claves que existen, cantidades válidas). */
export function normalizarRespuesta(raw: unknown, claves: MaterialClave[]): RespuestaAsignacion {
  const base = normalizarDocumento(raw);
  // normalizarDocumento deja las primeras 80 con descripción, en orden: se emparejan por posición.
  const crudas = (Array.isArray((raw as { lineas?: unknown })?.lineas) ? (raw as { lineas: unknown[] }).lineas : [])
    .slice(0, 80).filter(x => texto((x as Record<string, unknown> | null)?.descripcion, 160));
  const validas = new Set(claves.map(c => c.clave));
  const lineas = base.doc.lineas.map((l, i) => {
    const c = (crudas[i] || {}) as Record<string, unknown>;
    const clave = texto(c.material, 10).toUpperCase();
    const cm = Number(String(c.cantidad_material ?? '').replace(',', '.'));
    return { ...l, material: validas.has(clave) ? clave : null, cantidad_material: validas.has(clave) && Number.isFinite(cm) && cm > 0 ? r3(cm) : null };
  });
  return { ...base, lineas };
}

/** En el navegador: pasa las claves a los id; lo que la IA no asignó se sugiere comparando palabras. */
export function resolverAsignacion(r: RespuestaAsignacion, materiales: MaterialAsignable[], idDe: Map<string, string>): LecturaAsignada {
  const porId = new Map(materiales.map(m => [m.id, m]));
  const candidatas = materiales.map(m => ({ id: m.id, descripcion: m.descripcion, tipo: 'material' }));
  const lineas: LineaAsignada[] = r.lineas.map(({ material, cantidad_material, ...l }) => {
    const idIA = material ? idDe.get(material) ?? null : null;
    const id = idIA ?? sugerirLinea(l.descripcion, candidatas);
    const mat = id ? porId.get(id) : undefined;
    const cantidad = idIA && cantidad_material !== null ? cantidad_material
      : mat ? convertirUnidad(l.descripcion, l.cantidad, l.unidad, mat.unidad).cantidad : l.cantidad;
    return { ...l, presupuesto_linea_id: id, cantidad_material: cantidad, sugerida: idIA ? 'ia' : id ? 'palabras' : null };
  });
  return { ...r, lineas };
}

/** Sin IA: cruza las líneas comparando palabras (y convierte la unidad con la descripción). */
export function asignarPorPalabras(lineas: LineaLeida[], materiales: MaterialAsignable[]): LineaAsignada[] {
  return resolverAsignacion({ doc: vacio(), leidos: [], avisos: [], lineas: lineas.map(l => ({ ...l, material: null, cantidad_material: null })) }, materiales, new Map()).lineas;
}
const vacio = () => normalizarDocumento({}).doc;

// ── Una lista pegada, sin IA ────────────────────────────────────────────────
/** ¿Es una unidad conocida? («m», «mts», «un», «rollo», «caja»…) */
const esUnidad = (u: string) => {
  const t = u.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '');
  return UNIDADES.some(([re]) => re.test(t));
};

/** «10 m Cable 6 mm² $12.500», «Cable 6mm2 - 10 mts - 12500», «2 x Tablero 24 mód.» → líneas.
 *  Solo se usa si la IA no responde: la persona revisa todo antes de guardar. */
export function parsearLista(txt: string): LineaLeida[] {
  const out: LineaLeida[] = [];
  for (const crudo of String(txt || '').slice(0, MAX_TEXTO_LISTA).split(/\r?\n/)) {
    let s = crudo.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').replace(/\t/g, ' ').trim();
    if (!s || /^(total|subtotal|neto|iva)\b/i.test(s)) continue;
    // El monto: lo que sigue a un «$», o un número grande (con punto de miles o de 4 cifras o más) al final.
    let monto = 0;
    const precio = s.match(/\$\s*([\d.,]+)\s*$/) || s.match(/(?:^|\s|[-–:|,;])\s*(\d{1,3}(?:\.\d{3})+|\d{4,})\s*$/);
    if (precio && precio.index !== undefined) {
      monto = montoLeido(precio[1]);
      s = s.slice(0, precio.index).replace(/[\s\-–:|,;]+$/, '').trim();
    }
    // La cantidad y la unidad: al comienzo («10 m Cable», «2 x Tablero») o al final tras un separador
    // («Cable - 10 mts»). Un número pegado al final sin separador («Cinta 3M») es parte del nombre.
    let cantidad: number | null = null, unidad = '';
    const inicio = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:(x)\s+|([a-záéíóú/.]{1,8})\s+)?(.*\D.*)$/i);
    const fin = s.match(/^(.+?)\s*[-–:|,;]\s*(\d+(?:[.,]\d+)?)\s*([a-záéíóú/.]{0,8})$/i);
    if (inicio) {
      cantidad = n(inicio[1].replace(',', '.'));
      const u = inicio[3] || '';
      if (u && esUnidad(u)) { unidad = unidadNormal(u); s = inicio[4]; }
      else s = u ? `${u} ${inicio[4]}` : inicio[4];
    } else if (fin) {
      cantidad = n(fin[2].replace(',', '.'));
      unidad = fin[3] && esUnidad(fin[3]) ? unidadNormal(fin[3]) : '';
      s = fin[1];
    }
    const descripcion = texto(s.replace(/[\s\-–:|,;]+$/, ''), 160);
    if (!descripcion) continue;
    out.push({ descripcion, cantidad: cantidad && cantidad > 0 ? r3(cantidad) : null, unidad, monto });
  }
  return out.slice(0, 80);
}

// ── Así quedan los materiales ───────────────────────────────────────────────
export interface PreviaMaterial {
  id: string; descripcion: string; unidad: string | null; cantidad: number;
  antes: number; ahora: number; despues: number; pendiente: number; demas: number;
}

/** Cada material que toca esta compra: lo comprado antes, lo de ahora y cómo queda. */
export function previaMateriales(materiales: MaterialAsignable[], lineas: Pick<LineaAsignada, 'presupuesto_linea_id' | 'cantidad_material'>[]): PreviaMaterial[] {
  const ahora = new Map<string, number>();
  for (const l of lineas) if (l.presupuesto_linea_id) ahora.set(l.presupuesto_linea_id, (ahora.get(l.presupuesto_linea_id) || 0) + n(l.cantidad_material));
  return materiales.filter(m => ahora.has(m.id)).map(m => {
    const antes = r3(n(m.comprado)), suma = r3(ahora.get(m.id) || 0), despues = r3(antes + suma), cant = n(m.cantidad);
    return { id: m.id, descripcion: m.descripcion, unidad: m.unidad, cantidad: cant, antes, ahora: suma, despues,
      pendiente: r3(Math.max(cant - despues, 0)), demas: r3(Math.max(despues - cant, 0)) };
  });
}
