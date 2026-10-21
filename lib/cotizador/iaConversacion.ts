/**
 * Cotizar con IA conversando: lo que comparten el navegador y el servidor.
 *
 * Flujo: el usuario escribe el requerimiento → la IA hace preguntas (con opciones para
 * responder con un toque) → cuando tiene lo necesario, propone partidas. Cada componente
 * de la propuesta es:
 *   · «biblioteca»: un artículo de TU biblioteca, elegido por su referencia (B1, B2…) de una
 *     preselección que se le manda en cada turno. Entra con su precio real.
 *   · «nuevo»: algo que no está en la biblioteca; la IA estima su costo (queda marcado).
 * La IA nunca inventa referencias: si devuelve una que no se le mandó, el componente pasa
 * a «nuevo». Antes de agregar nada se muestra un resumen que separa una cosa de la otra.
 */

import type { CategoriaItem } from '@/types';

// ─── Lo que viaja entre el navegador y el servidor ───────────────────────────
export interface MensajeIA { rol: 'usuario' | 'asistente'; texto: string }
export interface CandidatoIA { ref: string; descripcion: string; categoria: CategoriaItem; unidad: string; costo: number; familia?: string | null }
export interface PreguntaIA { pregunta: string; opciones: string[] }
export interface ComponenteIA {
  ref: string;               // «B12» si es de la biblioteca; vacío si es nuevo
  descripcion: string;
  categoria: CategoriaItem;
  unidad: string;
  cantidad: number;
  costoUnitario: number;     // solo para los nuevos (CLP neto)
  nota: string;
}
export interface PartidaIA { nombre: string; descripcion: string; cantidad: number; unidad: string; componentes: ComponenteIA[] }
export interface PropuestaIA { resumen: string; supuestos: string[]; partidas: PartidaIA[] }
export interface TurnoIA { tipo: 'preguntas' | 'propuesta'; mensaje: string; preguntas: PreguntaIA[]; propuesta: PropuestaIA | null }

export const MAX_RONDAS_PREGUNTAS = 3;
const CATEGORIAS: CategoriaItem[] = ['material', 'mano_obra', 'servicio', 'operacion'];

// ─── Preselección de la biblioteca ───────────────────────────────────────────
// La biblioteca puede tener miles de artículos: a la IA se le manda una lista corta con lo
// que tiene relación con la conversación (más algo de mano de obra y servicios).
const VACIAS = new Set(['para', 'con', 'del', 'los', 'las', 'una', 'uno', 'que', 'por', 'como', 'mas', 'sin', 'sus', 'este', 'esta',
  'requerimiento', 'instalacion', 'cotizar', 'cliente', 'necesita', 'quiere', 'hacer', 'favor', 'tipo', 'cada', 'todo', 'todos', 'nuevo', 'nueva']);
/** Palabras de terreno → lo que suele llevar (para encontrar artículos relacionados). */
const RELACIONADAS: Record<string, string[]> = {
  tablero: ['tablero', 'gabinete', 'automatico', 'interruptor', 'diferencial', 'riel', 'barra', 'peineta', 'canaleta', 'terminal', 'conductor', 'cable'],
  enchufe: ['enchufe', 'toma', 'caja', 'placa', 'cable', 'conductor', 'tubo', 'conduit'],
  iluminacion: ['led', 'luminaria', 'panel', 'foco', 'interruptor', 'cable', 'tubo'],
  luminaria: ['led', 'luminaria', 'panel', 'foco', 'proyector'],
  cargador: ['cargador', 'wallbox', 'diferencial', 'automatico', 'cable', 'tubo', 'conduit', 'tablero'],
  camara: ['camara', 'nvr', 'dvr', 'disco', 'utp', 'cable', 'poe', 'switch', 'conector'],
  cctv: ['camara', 'nvr', 'dvr', 'disco', 'utp', 'poe', 'switch'],
  red: ['utp', 'cat', 'patch', 'rack', 'switch', 'jack', 'conector', 'canaleta'],
  acceso: ['cerradura', 'electroiman', 'lector', 'boton', 'fuente', 'controlador'],
  tierra: ['tierra', 'barra', 'cobre', 'electrodo', 'cable'],
  solar: ['panel', 'inversor', 'estructura', 'solar', 'fotovoltaico'],
  empalme: ['empalme', 'medidor', 'acometida', 'cable', 'automatico'],
};
export const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabras = (t: string) => normalizar(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !VACIAS.has(w) && !/^\d+$/.test(w));

export function preseleccionar<T extends { id: string; descripcion: string; categoria: CategoriaItem; unidad: string; costo: number; familia?: string | null }>(
  conversacion: string, catalogo: T[], max = 70,
): { candidatos: CandidatoIA[]; porRef: Map<string, T> } {
  const base = palabras(conversacion);
  const claves = new Set(base);
  for (const w of base) for (const [k, rel] of Object.entries(RELACIONADAS)) if (w.startsWith(k)) rel.forEach(r => claves.add(r));
  const puntaje = (a: T) => {
    const txt = normalizar(`${a.descripcion} ${a.familia || ''}`);
    let p = 0;
    for (const k of claves) if (txt.includes(k)) p += base.includes(k) ? 3 : 1;
    return p;
  };
  const conPuntaje = catalogo.map(a => ({ a, p: puntaje(a) })).filter(x => x.p > 0).sort((x, y) => y.p - x.p);
  const elegidos = conPuntaje.slice(0, max - 15).map(x => x.a);
  // Siempre algo de mano de obra, servicios y operación (la IA los necesita para armar partidas).
  const apoyo = catalogo.filter(a => a.categoria !== 'material' && !elegidos.includes(a))
    .sort((x, y) => puntaje(y) - puntaje(x)).slice(0, 15);
  const porRef = new Map<string, T>();
  const candidatos = [...elegidos, ...apoyo].map((a, i) => {
    const ref = `B${i + 1}`;
    porRef.set(ref, a);
    return { ref, descripcion: a.descripcion, categoria: a.categoria, unidad: a.unidad, costo: Math.round(a.costo || 0), familia: a.familia || null };
  });
  return { candidatos, porRef };
}

// ─── Normalizar lo que devuelve la IA (que nunca rompa la pantalla) ──────────
/** Número desde lo que mande la IA, también «$3.500» o «1,5» (formato chileno: punto de miles, coma decimal). */
const num = (v: unknown, d = 0) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  let s = String(v ?? '').replace(/[$\s]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : d;
};
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
export function normalizarTurno(raw: unknown): TurnoIA {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = (r.propuesta && typeof r.propuesta === 'object' ? r.propuesta : null) as Record<string, unknown> | null;
  const partidas: PartidaIA[] = (Array.isArray(p?.partidas) ? p!.partidas as Record<string, unknown>[] : []).map(x => ({
    nombre: txt(x.nombre) || 'Partida', descripcion: txt(x.descripcion), cantidad: num(x.cantidad, 1) || 1, unidad: txt(x.unidad) || 'global',
    componentes: (Array.isArray(x.componentes) ? x.componentes as Record<string, unknown>[] : []).map(c => ({
      ref: txt(c.ref).toUpperCase(), descripcion: txt(c.descripcion),
      categoria: (CATEGORIAS.includes(c.categoria as CategoriaItem) ? c.categoria : 'material') as CategoriaItem,
      unidad: txt(c.unidad) || 'un', cantidad: Math.max(0, num(c.cantidad, 1)), costoUnitario: Math.max(0, Math.round(num(c.costoUnitario))), nota: txt(c.nota),
    })).filter(c => c.descripcion || c.ref),
  })).filter(x => x.componentes.length);
  const preguntas = (Array.isArray(r.preguntas) ? r.preguntas as Record<string, unknown>[] : [])
    .map(q => ({ pregunta: txt(q.pregunta), opciones: (Array.isArray(q.opciones) ? q.opciones : []).map(txt).filter(Boolean).slice(0, 6) }))
    .filter(q => q.pregunta).slice(0, 4);
  const tipo = partidas.length && (r.tipo === 'propuesta' || !preguntas.length) ? 'propuesta' : 'preguntas';
  return {
    tipo, mensaje: txt(r.mensaje), preguntas: tipo === 'preguntas' ? preguntas : [],
    propuesta: tipo === 'propuesta' ? { resumen: txt(p?.resumen), supuestos: (Array.isArray(p?.supuestos) ? p!.supuestos as unknown[] : []).map(txt).filter(Boolean), partidas } : null,
  };
}

// ─── La propuesta, lista para revisar: qué es de la biblioteca y qué es nuevo ─
export interface ComponenteRevisado {
  id: string; incluir: boolean; origen: 'biblioteca' | 'nuevo';
  itemId?: string; codigo?: string | null;
  descripcion: string; categoria: CategoriaItem; unidad: string; cantidad: number; costo: number; nota: string;
  /** La IA pidió algo de la biblioteca con una referencia que no existía: se dejó como nuevo. */
  refInvalida?: boolean;
}
export interface PartidaRevisada { id: string; nombre: string; descripcion: string; cantidad: number; unidad: string; componentes: ComponenteRevisado[] }

let n = 0;
export function revisarPropuesta<T extends { id: string; codigo?: string | null; descripcion: string; unidad: string; costo: number }>(
  prop: PropuestaIA, porRef: Map<string, T>,
): PartidaRevisada[] {
  return prop.partidas.map(p => ({
    id: `p${++n}`, nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad,
    componentes: p.componentes.map(c => {
      const a = c.ref ? porRef.get(c.ref) : undefined;
      if (a) {
        return { id: `c${++n}`, incluir: true, origen: 'biblioteca' as const, itemId: a.id, codigo: a.codigo || null, descripcion: a.descripcion,
          categoria: c.categoria, unidad: a.unidad || c.unidad, cantidad: c.cantidad, costo: a.costo || 0, nota: c.nota };
      }
      return { id: `c${++n}`, incluir: true, origen: 'nuevo' as const, descripcion: c.descripcion || '(sin descripción)', categoria: c.categoria,
        unidad: c.unidad, cantidad: c.cantidad, costo: c.costoUnitario, nota: c.nota, refInvalida: !!c.ref };
    }),
  }));
}
