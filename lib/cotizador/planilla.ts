/**
 * Importar una cotización desde una planilla Excel (formato InnVolt).
 * Funciones puras: reciben las hojas ya leídas (filas de celdas) y devuelven partidas listas
 * para el cotizador, los textos de la introducción y el plan de ejecución (carta Gantt).
 *
 * Hojas que se reconocen por sus encabezados (el nombre de la hoja no importa):
 *   · Ítems: Partida · Descripción de la partida · Cant. partida · Unidad partida · Tipo ·
 *     Ítem · Unidad · Cantidad · Costo unitario neto · Utilidad % · Imprevistos % · Código.
 *     Basta con Partida, Ítem y Costo; una fila sin partida sigue en la partida de arriba.
 *   · Textos: Campo · Texto («Título» va al título; lo demás, a la introducción).
 *   · Plan: Etapa · Inicio (día) · Días.
 * Un código que existe en la biblioteca usa el precio de la biblioteca; sin código, manda el costo escrito.
 */

import type { CategoriaItem, PartidaIAResuelta } from '@/types';

export interface EtapaPlan { nombre: string; inicio: number; dias: number }
export interface BloqueTexto { titulo: string; texto: string }
export interface PlanillaLeida {
  titulo: string;
  textos: BloqueTexto[];
  etapas: EtapaPlan[];
  partidas: PartidaIAResuelta[];
  avisos: string[];
}

const clave = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

/** «$1.050.000», «2,5», «10 %», 0.25 → número (NaN si no hay). */
export function numeroCelda(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = texto(v).replace(/[$\s%]|clp|uf/gi, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}
/** Un porcentaje escrito como 25, «25 %» o 0,25 (formato % de Excel) → 25. */
const porcentajeCelda = (v: unknown) => {
  const n = numeroCelda(v);
  if (!Number.isFinite(n)) return undefined;
  return n > 0 && n < 1 ? Math.round(n * 10000) / 100 : n;
};

const TIPOS: [CategoriaItem, string[]][] = [
  ['mano_obra', ['manodeobra', 'manoobra', 'mo', 'mdo', 'instalacion', 'montaje', 'trabajo']],
  ['servicio', ['servicio', 'servicios', 'ingenieria', 'subcontrato', 'tercero', 'terceros']],
  ['operacion', ['operacion', 'operaciones', 'gasto', 'gastos', 'flete', 'movilizacion', 'traslado', 'logistica']],
  ['material', ['material', 'materiales', 'equipo', 'equipos', 'suministro', 'insumo', 'insumos']],
];
export function tipoCelda(v: unknown): CategoriaItem | null {
  const k = clave(v);
  if (!k) return 'material';
  for (const [tipo, alias] of TIPOS) if (k === tipo.replace('_', '') || alias.includes(k)) return tipo;
  return null;
}

// Encabezados reconocidos (sin tildes, espacios ni signos).
const COLUMNAS = {
  partida: ['partida', 'nombrepartida', 'nombredelapartida'],
  descPartida: ['descripciondelapartida', 'descripcionpartida', 'alcancepartida', 'alcance'],
  cantPartida: ['cantpartida', 'cantidadpartida', 'cantidaddelapartida'],
  unidadPartida: ['unidadpartida', 'unpartida', 'unidaddelapartida'],
  tipo: ['tipo', 'categoria'],
  item: ['item', 'descripciondelitem', 'descripcionitem', 'descripcion', 'detalle', 'componente'],
  unidad: ['unidad', 'un', 'u'],
  cantidad: ['cantidad', 'cant'],
  costo: ['costounitarioneto', 'costounitario', 'costoneto', 'costo', 'costounit', 'valorunitario'],
  utilidad: ['utilidad', 'utilidadporcentaje'],
  imprevistos: ['imprevistos', 'contingencia', 'imprevistosporcentaje'],
  codigo: ['codigo', 'cod', 'sku'],
  campo: ['campo', 'seccion', 'apartado'],
  texto: ['texto', 'contenido', 'valor'],
  etapa: ['etapa', 'actividad', 'tarea'],
  inicio: ['inicio', 'diainicio', 'iniciodia', 'desde'],
  dias: ['dias', 'duracion', 'diashabiles', 'duraciondias'],
} as const;
type Columna = keyof typeof COLUMNAS;

/** La fila de encabezados (de las 10 primeras) y qué columna es cada cosa. */
function encabezados(filas: unknown[][], requeridas: Columna[]): { fila: number; col: Partial<Record<Columna, number>> } | null {
  for (let f = 0; f < Math.min(filas.length, 10); f++) {
    const col: Partial<Record<Columna, number>> = {};
    (filas[f] || []).forEach((celda, i) => {
      const k = clave(String(celda ?? '').replace(/%/g, ' porcentaje').replace(/\(.*?\)/g, '')).replace(/porcentaje$/, '');
      for (const [nombre, alias] of Object.entries(COLUMNAS) as [Columna, readonly string[]][]) {
        if (col[nombre] === undefined && alias.includes(k)) { col[nombre] = i; break; }
      }
    });
    if (requeridas.every(r => col[r] !== undefined)) return { fila: f, col };
  }
  return null;
}

// Filas de cierre de la planilla (totales, IVA): no son partidas.
const esTotal = (s: string) => /^((sub)?total|resumen|iva|neto)\b/i.test(s);

function leerItems(filas: unknown[][], avisos: string[]): PartidaIAResuelta[] | null {
  const h = encabezados(filas, ['partida', 'item', 'costo']);
  if (!h) return null;
  const c = h.col;
  const celda = (fila: unknown[], k: Columna) => (c[k] === undefined ? undefined : fila[c[k]!]);
  const partidas: PartidaIAResuelta[] = [];
  let actual = null as PartidaIAResuelta | null;
  for (let f = h.fila + 1; f < filas.length; f++) {
    const fila = filas[f] || [];
    const nombre = texto(celda(fila, 'partida'));
    const item = texto(celda(fila, 'item'));
    if (esTotal(nombre) || esTotal(item)) continue;
    if (nombre && nombre !== actual?.nombre) {
      actual = partidas.find(p => p.nombre === nombre) || null;
      if (!actual) {
        actual = { nombre, descripcion: '', cantidad: 1, unidad: 'global', componentes: [] };
        partidas.push(actual);
      }
    }
    if (!actual) {
      if (item) avisos.push(`Fila ${f + 1}: «${item}» no tiene partida; se omitió.`);
      continue;
    }
    // Los datos de la partida se toman de la primera fila que los trae.
    const desc = texto(celda(fila, 'descPartida'));
    if (desc && !actual.descripcion) actual.descripcion = desc;
    const cantP = numeroCelda(celda(fila, 'cantPartida'));
    if (cantP > 0 && actual.cantidad === 1) actual.cantidad = cantP;
    const unP = texto(celda(fila, 'unidadPartida'));
    if (unP && actual.unidad === 'global') actual.unidad = unP;
    if (!item) continue;

    let categoria = tipoCelda(celda(fila, 'tipo'));
    if (!categoria) {
      avisos.push(`Fila ${f + 1}: tipo «${texto(celda(fila, 'tipo'))}» no reconocido; entra como material.`);
      categoria = 'material';
    }
    const cantidad = numeroCelda(celda(fila, 'cantidad'));
    const costo = numeroCelda(celda(fila, 'costo'));
    if (!Number.isFinite(costo)) avisos.push(`Fila ${f + 1}: «${item}» sin costo; entra en 0.`);
    const utilidad = porcentajeCelda(celda(fila, 'utilidad'));
    const imprevistos = porcentajeCelda(celda(fila, 'imprevistos'));
    const codigo = texto(celda(fila, 'codigo'));
    actual.componentes.push({
      descripcion: item, categoria, unidad: texto(celda(fila, 'unidad')) || 'un',
      cantidad: Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : 1,
      costo: Number.isFinite(costo) && costo > 0 ? costo : 0,
      matched: false,
      ...(codigo ? { codigo } : {}),
      ...(utilidad !== undefined ? { utilidad } : {}),
      ...(imprevistos ? { imprevistos } : {}),
    });
  }
  const vacias = partidas.filter(p => !p.componentes.length);
  if (vacias.length) avisos.push(`Sin ítems (se omiten): ${vacias.map(p => p.nombre).join(', ')}.`);
  return partidas.filter(p => p.componentes.length);
}

function leerTextos(filas: unknown[][]): { titulo: string; textos: BloqueTexto[] } | null {
  const h = encabezados(filas, ['campo', 'texto']);
  if (!h) return null;
  let titulo = '';
  const textos: BloqueTexto[] = [];
  for (let f = h.fila + 1; f < filas.length; f++) {
    const campo = texto(filas[f]?.[h.col.campo!]);
    // El texto conserva sus saltos de línea (viñetas escritas en la celda).
    const t = String(filas[f]?.[h.col.texto!] ?? '').trim();
    if (!campo || !t) continue;
    if (clave(campo) === 'titulo') titulo = t.replace(/\s+/g, ' ');
    else textos.push({ titulo: campo, texto: t });
  }
  return { titulo, textos };
}

function leerPlan(filas: unknown[][]): EtapaPlan[] | null {
  const h = encabezados(filas, ['etapa', 'dias']);
  if (!h) return null;
  const etapas: EtapaPlan[] = [];
  let siguiente = 1;
  for (let f = h.fila + 1; f < filas.length; f++) {
    const nombre = texto(filas[f]?.[h.col.etapa!]);
    const dias = numeroCelda(filas[f]?.[h.col.dias!]);
    if (!nombre || esTotal(nombre) || !(dias > 0)) continue;
    const ini = h.col.inicio === undefined ? NaN : numeroCelda(filas[f]?.[h.col.inicio]);
    const inicio = ini > 0 ? ini : siguiente;
    etapas.push({ nombre, inicio, dias });
    siguiente = Math.max(siguiente, inicio + dias);
  }
  return etapas;
}

export function leerPlanilla(hojas: { nombre: string; filas: unknown[][] }[]): PlanillaLeida {
  const out: PlanillaLeida = { titulo: '', textos: [], etapas: [], partidas: [], avisos: [] };
  let conItems = false;
  for (const h of hojas) {
    const avisosHoja: string[] = [];
    const items = leerItems(h.filas, avisosHoja);
    if (items) {
      conItems = true;
      out.partidas.push(...items);
      out.avisos.push(...avisosHoja.map(a => (hojas.length > 1 ? `${h.nombre}: ${a}` : a)));
      continue;
    }
    const t = leerTextos(h.filas);
    if (t) { out.titulo ||= t.titulo; out.textos.push(...t.textos); continue; }
    const plan = leerPlan(h.filas);
    if (plan) out.etapas.push(...plan);
  }
  if (!conItems) out.avisos.push('No se encontró la hoja de ítems: necesita las columnas Partida, Ítem y Costo unitario neto.');
  return out;
}

/** Días hábiles de punta a punta del plan. */
export const duracionPlan = (etapas: EtapaPlan[]) => etapas.reduce((m, e) => Math.max(m, e.inicio + e.dias - 1), 0);

/** El plan como texto para la introducción: «- Etapa: días 1–2 (2 días)». */
export function planEnTexto(etapas: EtapaPlan[]): string {
  if (!etapas.length) return '';
  const dias = (n: number) => `${n.toLocaleString('es-CL')} día${n === 1 ? '' : 's'}`;
  const lineas = etapas.map(e => {
    const fin = e.inicio + e.dias - 1;
    return `- ${e.nombre}: ${fin > e.inicio ? `días ${e.inicio}–${fin}` : `día ${e.inicio}`} (${dias(e.dias)})`;
  });
  return `**Plan de ejecución (días hábiles):**\n${lineas.join('\n')}\n- Plazo total estimado: ${dias(duracionPlan(etapas))} hábiles.`;
}

/** Los textos y el plan, listos para sumar a la introducción. */
export function introduccionDePlanilla(p: Pick<PlanillaLeida, 'textos' | 'etapas'>): string {
  return [...p.textos.map(t => `**${t.titulo}:**\n${t.texto}`), planEnTexto(p.etapas)].filter(Boolean).join('\n\n');
}

/** La planilla de ejemplo para descargar (mismas columnas que lee `leerPlanilla`). */
export const PLANILLA_EJEMPLO: { nombre: string; filas: (string | number)[][] }[] = [
  {
    nombre: 'Items',
    filas: [
      ['Partida', 'Descripción de la partida', 'Cant. partida', 'Unidad partida', 'Tipo', 'Ítem', 'Unidad', 'Cantidad', 'Costo unitario neto', 'Utilidad %', 'Imprevistos %', 'Código'],
      ['Tablero general', 'Suministro, armado y montaje de tablero nuevo', 1, 'global', 'Material', 'Gabinete metálico 2000×800×600 mm', 'un', 1, 1050000, '', 10, ''],
      ['', '', '', '', 'Material', 'Interruptor caja moldeada 160 A 3P', 'un', 2, 400000, '', 10, ''],
      ['', '', '', '', 'Mano de obra', 'Armado y cableado en taller', 'global', 1, 850000, '', 10, ''],
      ['Pruebas y entrega', 'Ensayos, puesta en servicio y documentación', 1, 'global', 'Servicio', 'Pruebas y puesta en servicio', 'global', 1, 300000, '', '', ''],
    ],
  },
  {
    nombre: 'Textos',
    filas: [
      ['Campo', 'Texto'],
      ['Título', 'Normalización de tablero eléctrico'],
      ['Alcance', 'Reemplazo de gabinete, barras y protecciones.'],
      ['Exclusiones', '- Obras civiles\n- Trámites SEC'],
    ],
  },
  {
    nombre: 'Plan',
    filas: [
      ['Etapa', 'Inicio (día)', 'Días'],
      ['Levantamiento e ingeniería', 1, 2],
      ['Armado en taller', 3, 2],
      ['Montaje y pruebas', 5, 2],
    ],
  },
];
