/**
 * Cotizar con IA conversando: lo que comparten el navegador y el servidor.
 *
 * Tres pasos, para cualquier servicio de InnVolt:
 *   1. Conversación: el vendedor escribe el requerimiento; la IA pregunta lo que mueve el
 *      precio (con opciones para responder con un toque) y entrega un PLAN de partidas.
 *   2. Armado: cada partida se arma en su propia llamada (cabe en el tiempo del servidor
 *      aunque el proyecto sea grande), con una preselección de la biblioteca hecha para esa
 *      partida: productos (B1, B2…) y recetas (R1, R2…).
 *   3. Resumen: qué sale de la biblioteca (precio real), qué sale de una receta (armada con
 *      el motor de recetas y las respuestas que dio la IA) y qué es nuevo (costo estimado).
 * La IA nunca inventa referencias: si cita una que no se le mandó, el componente pasa a nuevo.
 */

import type { CategoriaItem } from '@/types';
import type { ArticuloCatalogo } from '@/lib/cotizador/tipos';
import { armar, respuestasIniciales, type RecetaCompleta, type Respuestas } from '@/lib/cotizador/recetas';

// ─── Lo que viaja entre el navegador y el servidor ───────────────────────────
export interface MensajeIA { rol: 'usuario' | 'asistente'; texto: string }
export interface PreguntaIA { pregunta: string; opciones: string[] }
export interface PlanPartida { nombre: string; descripcion: string; cantidad: number; unidad: string; alcance: string }
export interface PlanIA { resumen: string; supuestos: string[]; partidas: PlanPartida[] }
export interface TurnoIA { tipo: 'preguntas' | 'plan'; mensaje: string; preguntas: PreguntaIA[]; plan: PlanIA | null }

export interface CandidatoProducto { ref: string; descripcion: string; categoria: CategoriaItem; unidad: string; costo: number }
export interface CandidatoReceta {
  ref: string; nombre: string; unidad: string; contiene: string;
  preguntas: { clave: string; tipo: 'numero' | 'producto' | 'sino'; texto: string; unidad?: string; opciones?: string[] }[];
}
export interface RespuestaReceta { clave: string; valor: string }
export interface ComponenteIA {
  ref: string;               // B12 (producto), R3 (receta) o vacío (nuevo)
  descripcion: string;
  categoria: CategoriaItem;
  unidad: string;
  cantidad: number;          // TOTAL para toda la partida (en una receta sin preguntas: cuántas veces)
  costoUnitario: number;     // solo para los nuevos (CLP neto)
  nota: string;
  respuestas: RespuestaReceta[];   // solo para recetas
}

export const MAX_RONDAS_PREGUNTAS = 3;
export const MAX_PARTIDAS = 6;
const CATEGORIAS: CategoriaItem[] = ['material', 'mano_obra', 'servicio', 'operacion'];

// ─── Preselección de la biblioteca (para cualquier rubro) ────────────────────
export const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const VACIAS = new Set(['para', 'con', 'del', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'que', 'por', 'como', 'mas', 'sin', 'sus', 'este', 'esta', 'esto',
  'requerimiento', 'cotizar', 'cotizacion', 'cliente', 'necesita', 'quiere', 'hacer', 'favor', 'tipo', 'cada', 'todo', 'todos', 'nuevo', 'nueva',
  'segun', 'incluye', 'incluir', 'partida', 'suministro', 'instalacion', 'instalar', 'montaje', 'aprox', 'aproximadamente', 'cantidad', 'total']);
/** Palabras de terreno → lo que suele llevar ese trabajo (raíces de 4+ letras). */
const RELACIONADAS: [RegExp, string[]][] = [
  [/^tabler|^gabinet/, ['tabler', 'gabinet', 'automat', 'interrupt', 'diferenc', 'riel', 'barra', 'peinet', 'terminal', 'conduct', 'cable', 'prensa']],
  [/^alimentad|^empalm|^acomet|^medidor|^capacid/, ['empalm', 'medidor', 'acomet', 'cable', 'conduct', 'automat', 'tubo', 'ducto', 'mufa']],
  [/^enchuf|^toma|^punto|^fuerza/, ['enchuf', 'toma', 'caja', 'placa', 'modulo', 'cable', 'conduct', 'tubo', 'conduit', 'canalet']],
  [/^ilumin|^lumin|^foco|^lampar|^led$|^panel|^cinta|^perfil|^proyect/, ['led', 'lumin', 'foco', 'panel', 'cinta', 'perfil', 'driver', 'fuente', 'proyect', 'interrupt', 'sensor', 'dimmer']],
  [/^domot|^inteligen|^smart|^zigbee|^matter|^alexa|^google|^cortin|^persian/, ['inteligen', 'smart', 'zigbee', 'wifi', 'hub', 'sensor', 'modulo', 'rele', 'interrupt', 'motor', 'cortin']],
  [/^camar|^cctv|^vigilan|^seguridad|^nvr|^dvr/, ['camar', 'nvr', 'dvr', 'disco', 'utp', 'poe', 'switch', 'conector', 'balun', 'fuente', 'caja']],
  [/^acceso|^cerradur|^electroim|^lector|^torniquet|^porton|^barrera/, ['cerradur', 'electroim', 'lector', 'boton', 'fuente', 'control', 'tarjet', 'llaver', 'bateria', 'motor']],
  [/^red$|^redes|^datos|^cableado|^utp|^rack|^wifi|^router|^switch|^access/, ['utp', 'cat6', 'patch', 'rack', 'switch', 'jack', 'conector', 'canalet', 'access', 'router', 'organiz', 'face']],
  [/^citof|^portero|^videoport|^intercom/, ['citof', 'portero', 'videoport', 'intercom', 'monitor', 'fuente', 'cerradur', 'cable']],
  [/^pantall|^display|^letrer/, ['pantall', 'modulo', 'control', 'fuente', 'estructur', 'receiv', 'gabinet']],
  [/^cargad|^electromov|^vehicul|^wallbox|^auto$/, ['cargad', 'wallbox', 'diferenc', 'automat', 'cable', 'tubo', 'conduit', 'tabler', 'ducto']],
  [/^solar|^fotovolt|^panel|^inversor|^bateri|^ongrid|^hibrid/, ['solar', 'fotovolt', 'inversor', 'estructur', 'bateri', 'conector', 'cable', 'string']],
  [/^tierra|^malla|^pararray|^electrod/, ['tierra', 'barra', 'cobre', 'electrod', 'malla', 'cable', 'gel', 'camar']],
  [/^mantenc|^mantenim|^revision|^termogr|^limpiez/, ['mantenc', 'revision', 'termogr', 'limpiez', 'informe', 'hora']],
  [/^certific|^declarac|^sec$|^te1|^te4|^te6|^regulariz|^plano/, ['certific', 'declarac', 'sec', 'tramit', 'plano', 'te1', 'proyect']],
];
/** Lo que casi todo trabajo usa (con poco peso). */
const APOYO = ['tubo', 'conduit', 'canalet', 'abrazad', 'tarugo', 'tornill', 'caja', 'cable', 'conduct', 'cinta'];
const palabras = (t: string) => normalizar(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !VACIAS.has(w) && !/^\d+$/.test(w));
const raiz = (w: string) => (w.length > 6 ? w.slice(0, 6) : w.length > 4 ? w.slice(0, w.length - 1) : w);

/** Puntaje de un texto de la biblioteca frente a lo que se está cotizando. */
function puntuador(texto: string) {
  const base = [...new Set(palabras(texto).map(raiz))];
  const rel = new Set<string>();
  for (const w of palabras(texto)) for (const [re, xs] of RELACIONADAS) if (re.test(w)) xs.forEach(x => rel.add(x));
  return (descripcion: string) => {
    const ws = palabras(descripcion);
    let p = 0;
    for (const b of base) if (ws.some(w => w.startsWith(b))) p += 3;
    for (const r of rel) if (!base.includes(r) && ws.some(w => w.startsWith(r))) p += 1;
    for (const a of APOYO) if (ws.some(w => w.startsWith(a))) p += 0.2;
    return p;
  };
}

type Articulo = Pick<ArticuloCatalogo, 'id' | 'descripcion' | 'categoria' | 'unidad' | 'costo' | 'codigo' | 'familia' | 'activo'>;
export type RefBiblioteca = { tipo: 'producto'; a: Articulo } | { tipo: 'receta'; r: RecetaCompleta };

/**
 * La lista corta que se le manda a la IA para UNA partida: hasta ~60 productos relacionados,
 * 15 de mano de obra / servicios / operación y 12 recetas.
 */
export function preseleccionar(texto: string, catalogo: Articulo[], recetas: RecetaCompleta[], nombreDeItem: (id: string) => string) {
  const puntaje = puntuador(texto);
  const activos = catalogo.filter(a => a.activo !== false);
  const conP = activos.map(a => ({ a, p: puntaje(`${a.descripcion} ${a.familia || ''}`) }));
  const materiales = conP.filter(x => x.p >= 1 && x.a.categoria === 'material').sort((x, y) => y.p - x.p).slice(0, 60).map(x => x.a);
  const otros = conP.filter(x => x.a.categoria !== 'material').sort((x, y) => y.p - x.p).slice(0, 15).map(x => x.a);
  const recs = recetas.filter(r => r.activo !== false)
    .map(r => ({ r, p: puntaje(`${r.nombre} ${r.descripcion || ''}`) * 2 + puntaje(r.componentes.map(c => c.descripcion).join(' ')) * 0.3 }))
    .filter(x => x.p >= 2).sort((x, y) => y.p - x.p).slice(0, 12).map(x => x.r);

  const porRef = new Map<string, RefBiblioteca>();
  const productos: CandidatoProducto[] = [...materiales, ...otros].map((a, i) => {
    const ref = `B${i + 1}`;
    porRef.set(ref, { tipo: 'producto', a });
    return { ref, descripcion: a.descripcion, categoria: a.categoria, unidad: a.unidad, costo: Math.round(a.costo || 0) };
  });
  const candidatosRecetas: CandidatoReceta[] = recs.map((r, i) => {
    const ref = `R${i + 1}`;
    porRef.set(ref, { tipo: 'receta', r });
    return {
      ref, nombre: r.nombre, unidad: r.unidad || 'un',
      contiene: r.componentes.slice(0, 8).map(c => c.descripcion).join(', ').slice(0, 220),
      preguntas: r.preguntas.map(p => ({
        clave: p.clave, tipo: p.tipo, texto: p.texto, unidad: p.unidad || undefined,
        opciones: p.tipo === 'producto' ? (p.opciones || []).map(o => o.etiqueta || nombreDeItem(o.item_id)).filter(Boolean) : undefined,
      })),
    };
  });
  return { productos, recetas: candidatosRecetas, porRef };
}

// ─── Normalizar lo que devuelve la IA (que nunca rompa la pantalla) ──────────
/** Número desde lo que mande la IA, también «$3.500» o «1,5» (formato chileno: punto de miles, coma decimal). */
export const num = (v: unknown, d = 0) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  let s = String(v ?? '').replace(/[$\s]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : d;
};
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];

export function normalizarTurno(raw: unknown): TurnoIA {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = (r.plan && typeof r.plan === 'object' ? r.plan : null) as Record<string, unknown> | null;
  const partidas: PlanPartida[] = lista(p?.partidas).map(x => ({
    nombre: txt(x.nombre), descripcion: txt(x.descripcion), cantidad: Math.max(num(x.cantidad, 1), 0) || 1,
    unidad: txt(x.unidad) || 'global', alcance: txt(x.alcance),
  })).filter(x => x.nombre).slice(0, MAX_PARTIDAS);
  const preguntas = lista(r.preguntas)
    .map(q => ({ pregunta: txt(q.pregunta), opciones: (Array.isArray(q.opciones) ? q.opciones : []).map(txt).filter(Boolean).slice(0, 6) }))
    .filter(q => q.pregunta).slice(0, 4);
  const tipo = partidas.length && (r.tipo === 'plan' || r.tipo === 'propuesta' || !preguntas.length) ? 'plan' : 'preguntas';
  return {
    tipo, mensaje: txt(r.mensaje), preguntas: tipo === 'preguntas' ? preguntas : [],
    plan: tipo === 'plan' ? { resumen: txt(p?.resumen), supuestos: (Array.isArray(p?.supuestos) ? p!.supuestos as unknown[] : []).map(txt).filter(Boolean), partidas } : null,
  };
}

export function normalizarComponentes(raw: unknown): ComponenteIA[] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return lista(r.componentes).map(c => ({
    ref: txt(c.ref).toUpperCase(), descripcion: txt(c.descripcion),
    categoria: (CATEGORIAS.includes(c.categoria as CategoriaItem) ? c.categoria : 'material') as CategoriaItem,
    unidad: txt(c.unidad) || 'un', cantidad: Math.max(0, num(c.cantidad, 1)), costoUnitario: Math.max(0, Math.round(num(c.costoUnitario))),
    nota: txt(c.nota),
    respuestas: lista(c.respuestas).map(x => ({ clave: txt(x.clave), valor: txt(x.valor) })).filter(x => x.clave),
  })).filter(c => c.descripcion || c.ref).slice(0, 20);
}

// ─── Las respuestas que dio la IA, como respuestas de la receta ──────────────
export function respuestasDeReceta(r: RecetaCompleta, pares: RespuestaReceta[], nombreDeItem: (id: string) => string): Respuestas {
  const out = respuestasIniciales(r);
  for (const { clave, valor } of pares) {
    const p = r.preguntas.find(x => x.clave === clave) || r.preguntas.find(x => normalizar(x.texto) === normalizar(clave));
    if (!p) continue;
    if (p.tipo === 'numero') {
      let n = num(valor, NaN);
      if (!Number.isFinite(n)) continue;
      if (p.entero) n = Math.round(n);
      if (typeof p.minimo === 'number') n = Math.max(n, p.minimo);
      if (typeof p.maximo === 'number') n = Math.min(n, p.maximo);
      out[p.clave] = n;
    } else if (p.tipo === 'sino') {
      out[p.clave] = /^(s[ií]|true|1|verdadero|va|incluye)/i.test(valor.trim());
    } else {
      const v = normalizar(valor);
      const op = (p.opciones || []).find(o => normalizar(o.etiqueta || nombreDeItem(o.item_id)) === v)
        || (p.opciones || []).find(o => { const e = normalizar(o.etiqueta || nombreDeItem(o.item_id)); return !!e && (e.includes(v) || v.includes(e)); });
      if (op) out[p.clave] = op.item_id;
    }
  }
  return out;
}

// ─── La propuesta, lista para revisar ────────────────────────────────────────
export interface ComponenteRevisado {
  id: string; incluir: boolean; origen: 'biblioteca' | 'nuevo';
  itemId?: string; codigo?: string | null;
  descripcion: string; categoria: CategoriaItem; unidad: string; cantidad: number; costo: number; nota: string;
  /** Viene de esta receta (armada con el motor de recetas). */
  receta?: string;
  /** La IA citó una referencia que no existía: se dejó como nuevo. */
  refInvalida?: boolean;
}
export interface PartidaRevisada {
  id: string; nombre: string; descripcion: string; cantidad: number; unidad: string; alcance: string;
  estado: 'pendiente' | 'armando' | 'lista' | 'error'; error?: string;
  componentes: ComponenteRevisado[];
  /** Lo que una receta no agregó (y por qué). */
  avisos: string[];
}

let n = 0;
const nid = (p: string) => `${p}${++n}${Math.random().toString(36).slice(2, 6)}`;

export function partidasDelPlan(plan: PlanIA): PartidaRevisada[] {
  return plan.partidas.map(p => ({ id: nid('p'), ...p, estado: 'pendiente', componentes: [], avisos: [] }));
}

/** Convierte lo que armó la IA para una partida en componentes revisables. */
export function revisarComponentes(
  comps: ComponenteIA[], porRef: Map<string, RefBiblioteca>, catalogo: Map<string, ArticuloCatalogo>,
): { componentes: ComponenteRevisado[]; avisos: string[] } {
  const out: ComponenteRevisado[] = [];
  const avisos: string[] = [];
  const nombreDeItem = (id: string) => catalogo.get(id)?.descripcion || '';
  for (const c of comps) {
    const b = c.ref ? porRef.get(c.ref) : undefined;
    if (b?.tipo === 'producto') {
      out.push({ id: nid('c'), incluir: true, origen: 'biblioteca', itemId: b.a.id, codigo: b.a.codigo || null, descripcion: b.a.descripcion,
        categoria: b.a.categoria || c.categoria, unidad: b.a.unidad || c.unidad, cantidad: c.cantidad, costo: b.a.costo || 0, nota: c.nota });
    } else if (b?.tipo === 'receta') {
      const r = b.r;
      const armado = armar(r, respuestasDeReceta(r, c.respuestas, nombreDeItem), Math.max(1, Math.round(c.cantidad || 1)), catalogo);
      for (const l of armado.lineas) {
        out.push({
          id: nid('c'), incluir: true, origen: 'biblioteca', receta: r.nombre,
          itemId: l.articulo?.id, codigo: l.articulo?.codigo || null,
          descripcion: l.articulo?.descripcion || l.componente.descripcion,
          categoria: (l.articulo?.categoria || l.componente.categoria || 'material') as CategoriaItem,
          unidad: l.articulo?.unidad || l.componente.unidad || 'un', cantidad: l.cantidad,
          costo: l.articulo ? l.articulo.costo || 0 : l.componente.costo || 0, nota: c.nota,
        });
      }
      armado.noVan.forEach(x => avisos.push(`${r.nombre}: «${x.nombre}» no va — ${x.porque}`));
      if (!armado.lineas.length) avisos.push(`La receta «${r.nombre}» no agregó nada con esas respuestas.`);
    } else {
      out.push({ id: nid('c'), incluir: true, origen: 'nuevo', descripcion: c.descripcion || '(sin descripción)', categoria: c.categoria,
        unidad: c.unidad, cantidad: c.cantidad, costo: c.costoUnitario, nota: c.nota, refInvalida: !!c.ref });
    }
  }
  return { componentes: out, avisos };
}
