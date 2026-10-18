'use client';

/**
 * Plantillas de informe, informes de la visita y actas.
 *   · Plantilla (planilla, como en TecApp): introducción, secciones, preguntas de muchos tipos
 *     (listas con filas, fotos, firma…, obligatorias o condicionales) y checklist, de tipo
 *     «visita» (informes de la cita de la agenda, varios por visita) o «entrega» (el acta).
 *   · Fase 11: código, versión y estado de la plantilla; respuestas alternativas («No medido»),
 *     datos precargados de la visita, alertas de riesgo, origen del dato y etiquetas para cotizar.
 *   · Al llenar un informe se copia la plantilla: si después se edita, lo ya llenado no cambia.
 */

import { supabase } from '@/lib/supabase';

export type TipoCampo =
  | 'seccion' | 'texto' | 'parrafo' | 'numero' | 'fecha' | 'hora' | 'si_no'
  | 'seleccion' | 'multiseleccion' | 'foto' | 'firma' | 'lista'
  | 'si_no_na'    // Sí / No / No aplica / No verificado
  | 'archivo'     // documentos adjuntos (PDF, planos…)
  | 'opciones';   // la de la fase 8: es «seleccion»
export const TIPOS_CAMPO: { clave: TipoCampo; nombre: string }[] = [
  { clave: 'seccion', nombre: '— Sección (paso) —' },
  { clave: 'texto', nombre: 'Texto corto' }, { clave: 'parrafo', nombre: 'Párrafo' },
  { clave: 'numero', nombre: 'Número' }, { clave: 'fecha', nombre: 'Fecha' }, { clave: 'hora', nombre: 'Hora' },
  { clave: 'si_no', nombre: 'Sí / No' }, { clave: 'si_no_na', nombre: 'Sí / No / No aplica / No verificado' },
  { clave: 'seleccion', nombre: 'Elegir una opción' },
  { clave: 'multiseleccion', nombre: 'Elegir varias' }, { clave: 'foto', nombre: 'Fotos' },
  { clave: 'archivo', nombre: 'Archivos adjuntos' },
  { clave: 'firma', nombre: 'Firma' }, { clave: 'lista', nombre: 'Lista (filas: tableros…)' },
];
/** Lo que puede ir en una fila de una lista. */
export const TIPOS_SUBCAMPO: TipoCampo[] = ['texto', 'numero', 'fecha', 'si_no', 'si_no_na', 'seleccion', 'foto'];
export const SI_NO_NA = ['Sí', 'No', 'No aplica', 'No verificado'];

/** Para qué sirve la respuesta al cotizar (fase 11). */
export type EtiquetaCot = 'antecedente' | 'diagnostico' | 'requisito' | 'material' | 'equipo' | 'cantidad'
  | 'mano_obra' | 'servicio' | 'montaje' | 'exclusion' | 'pendiente' | 'evidencia';
export const ETIQUETAS_COT: { clave: EtiquetaCot; nombre: string }[] = [
  { clave: 'antecedente', nombre: 'Antecedente' }, { clave: 'diagnostico', nombre: 'Diagnóstico' },
  { clave: 'requisito', nombre: 'Requisito del cliente' }, { clave: 'material', nombre: 'Material' },
  { clave: 'equipo', nombre: 'Equipo' }, { clave: 'cantidad', nombre: 'Cantidad' },
  { clave: 'mano_obra', nombre: 'Mano de obra' }, { clave: 'servicio', nombre: 'Servicio adicional' },
  { clave: 'montaje', nombre: 'Condición de montaje' }, { clave: 'exclusion', nombre: 'Exclusión' },
  { clave: 'pendiente', nombre: 'Pendiente de confirmar' }, { clave: 'evidencia', nombre: 'Evidencia' },
];
/** De dónde sale el dato (sale en el PDF para distinguir lo medido de lo declarado). */
export type Naturaleza = 'observado' | 'medido' | 'declarado' | 'estimado';
export const NATURALEZAS: { clave: Naturaleza; nombre: string }[] = [
  { clave: 'observado', nombre: 'Observado' }, { clave: 'medido', nombre: 'Medido' },
  { clave: 'declarado', nombre: 'Declarado por el cliente' }, { clave: 'estimado', nombre: 'Estimado / inferido' },
];
/** Datos de la visita que una pregunta puede traer ya llenos. Los «fijos» vienen de la cita y no
 *  se editan en el informe (se muestran en la tarjeta de la visita y se actualizan con ella); el
 *  motivo llega prellenado (lo que pidió el cliente) pero el técnico lo puede precisar. */
export type Precarga = 'cliente' | 'direccion' | 'contacto' | 'telefono' | 'fecha' | 'tecnico' | 'motivo';
export const PRECARGAS: { clave: Precarga; nombre: string }[] = [
  { clave: 'cliente', nombre: 'Cliente (fijo)' }, { clave: 'direccion', nombre: 'Dirección (fija)' }, { clave: 'contacto', nombre: 'Contacto (fijo)' },
  { clave: 'telefono', nombre: 'Teléfono (fijo)' }, { clave: 'fecha', nombre: 'Fecha de la visita (fija)' }, { clave: 'tecnico', nombre: 'Técnico (fijo)' },
  { clave: 'motivo', nombre: 'Lo que pidió el cliente (editable)' },
];
export const PRECARGA_FIJA: Precarga[] = ['cliente', 'direccion', 'contacto', 'telefono', 'fecha', 'tecnico'];
export const esFijo = (c: CampoInforme) => !!c.precarga && PRECARGA_FIJA.includes(c.precarga);
export type DatosPrecarga = Partial<Record<Precarga, string | null | undefined>>;

/** Pone en el informe los datos fijos de la visita tal como están hoy en la cita. */
export function conDatosFijos<T extends InformeLleno>(i: T, datos: DatosPrecarga): { informe: T; cambio: boolean } {
  let cambio = false;
  const respuestas = { ...i.respuestas };
  for (const c of i.campos || []) {
    if (!esFijo(c)) continue;
    const v = datos[c.precarga!] || null;
    if ((respuestas[c.clave] ?? null) !== v) { cambio = true; if (v) respuestas[c.clave] = v; else delete respuestas[c.clave]; }
  }
  return { informe: cambio ? { ...i, respuestas } : i, cambio };
}
export type EstadoPlantilla = 'borrador' | 'activa' | 'archivada';

export interface CondicionCampo { campo: string; op: '=' | '≠'; valor: string }
export interface CampoInforme {
  clave: string; etiqueta: string; tipo: TipoCampo; opciones?: string[]; unidad?: string;
  requerido?: boolean; ayuda?: string; subcampos?: CampoInforme[]; mostrarSi?: CondicionCampo | null;
  /** Fase 11 */
  placeholder?: string;
  alternativas?: string[];          // respuestas cuando no hay dato: «No medido», «No identificado»…
  precarga?: Precarga;
  naturaleza?: Naturaleza;
  alerta?: string[];                // valores que marcan un riesgo destacado
  cotizacion?: EtiquetaCot[];
  interno?: boolean;                // no sale en el PDF del cliente
  min?: number; max?: number;
}
export type TipoPlantillaInforme = 'visita' | 'entrega';
export interface PlantillaInformeCompleta {
  id: string; nombre: string; tipo: TipoPlantillaInforme; tipo_servicio: string | null; intro: string | null;
  campos: CampoInforme[]; checklist: { texto: string }[]; activa: boolean;
  codigo?: string | null; version?: number; estado?: EstadoPlantilla;
  descripcion?: string | null; objetivo?: string | null; instrucciones?: string | null;
}
export interface FotoInforme { path: string; caption: string; nombre?: string }
export type ValorSimple = string | number | boolean | null;
export type FilaLista = Record<string, ValorSimple | FotoInforme[]>;
export type ValorCampo = ValorSimple | string[] | FotoInforme[] | FilaLista[];
/** Un informe lleno (los de la visita van en informes_visita; el acta, en entregas_trabajo). */
export interface InformeLleno {
  plantilla_id?: string | null; plantilla_nombre?: string | null; intro?: string | null;
  campos: CampoInforme[]; respuestas: Record<string, ValorCampo>; checklist: { texto: string; ok: boolean }[];
  plantilla_codigo?: string | null; plantilla_version?: number | null; objetivo?: string | null; instrucciones?: string | null;
}
export interface InformeVisita extends InformeLleno {
  id: string; folio: number; agendamiento_id: string; estado: 'borrador' | 'completado';
  creado_por: string | null; completado_at: string | null; created_at: string; updated_at: string | null;
  modificado_por?: string | null; completado_por?: string | null;
}
export interface EntregaTrabajo extends InformeLleno {
  id: string; folio: number; cotizacion_id: string; estado: 'borrador' | 'firmado'; fecha: string;
  trabajos: string | null; observaciones: string | null; fotos: { path: string; caption: string }[];
  recibido_por: string | null; recibido_rut: string | null; recibido_email: string | null;
  firma_path: string | null; firmado_at: string | null; creado_por: string | null; created_at: string;
}

export const folioActa = (n: number) => `AE-${String(n || 0).padStart(4, '0')}`;
export const folioInforme = (n: number) => `IN-${String(n || 0).padStart(4, '0')}`;
export const claveDe = (etiqueta: string) =>
  (etiqueta || 'campo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo';

/** «opciones» (fase 8) es lo mismo que «seleccion». */
export const tipoDe = (c: CampoInforme): TipoCampo => (c.tipo === 'opciones' ? 'seleccion' : c.tipo);
export const vacio = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Un informe en blanco, copiado de la plantilla (con lo que se sabe de la visita ya puesto). */
export function informeDesde(p: PlantillaInformeCompleta | null, datos: DatosPrecarga = {}): InformeLleno {
  if (!p) return { campos: [], respuestas: {}, checklist: [] };
  const respuestas: Record<string, ValorCampo> = {};
  for (const c of p.campos || []) {
    const v = c.precarga ? datos[c.precarga] : null;
    if (v) respuestas[c.clave] = v;
  }
  return {
    plantilla_id: p.id, plantilla_nombre: p.nombre, intro: p.intro,
    plantilla_codigo: p.codigo || null, plantilla_version: p.version ?? null, objetivo: p.objetivo || null, instrucciones: p.instrucciones || null,
    campos: (p.campos || []).map(c => ({ ...c })), respuestas,
    checklist: (p.checklist || []).filter(c => c.texto?.trim()).map(c => ({ texto: c.texto, ok: false })),
  };
}

/** El valor como texto, para comparar en las condiciones: «Sí», «Trifásico»… */
function comoTexto(c: CampoInforme | undefined, v: ValorCampo | undefined): string {
  if (vacio(v)) return '';
  if (c && tipoDe(c) === 'si_no' && typeof v === 'boolean') return v ? 'Sí' : 'No';
  return Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : '')).join('|') : String(v);
}
export function cumple(cond: CondicionCampo | null | undefined, campos: CampoInforme[], resp: Record<string, ValorCampo>): boolean {
  if (!cond?.campo) return true;
  const c = campos.find(x => x.clave === cond.campo);
  const t = comoTexto(c, resp[cond.campo]);
  const es = c && tipoDe(c) === 'multiseleccion' ? t.split('|').includes(cond.valor) : t === cond.valor;
  return cond.op === '≠' ? !es : es;
}

export interface Seccion { titulo: string; clave: string; campos: CampoInforme[] }
/** Las preguntas agrupadas por sección (cada sección es un paso). Lo que está antes de la
 *  primera sección va en «General». Una sección oculta por su condición esconde todo lo suyo. */
export function seccionesDe(i: InformeLleno): Seccion[] {
  const out: Seccion[] = [];
  let actual: Seccion | null = null; let oculta = false;
  for (const c of i.campos || []) {
    if (c.tipo === 'seccion') {
      oculta = !cumple(c.mostrarSi, i.campos, i.respuestas || {});
      actual = { titulo: c.etiqueta || 'Sección', clave: c.clave, campos: [] };
      if (!oculta) out.push(actual);
      continue;
    }
    if (oculta || !cumple(c.mostrarSi, i.campos, i.respuestas || {})) continue;
    if (!actual) { actual = { titulo: 'General', clave: '_general', campos: [] }; out.push(actual); }
    actual.campos.push(c);
  }
  return out.filter(s => s.campos.length);
}

/** Las obligatorias que faltan (solo las visibles). */
export function faltantes(i: InformeLleno): CampoInforme[] {
  return seccionesDe(i).flatMap(s => s.campos).filter(c => c.requerido && vacio(i.respuestas?.[c.clave]));
}

/** Números fuera del rango de la pregunta (para avisar, sin bloquear). */
export function fueraDeRango(c: CampoInforme, v: unknown): boolean {
  return typeof v === 'number' && ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max));
}

/** «Sí», «12 m», «Regular», «3 filas» o «—». */
export function valorLegible(c: CampoInforme, v: ValorCampo | FotoInforme[] | undefined): string {
  if (vacio(v)) return '—';
  if (typeof v === 'string' && c.alternativas?.includes(v)) return v;   // «No medido», «No identificado»…
  switch (tipoDe(c)) {
    case 'si_no': return v === true || v === 'si' || v === 'Sí' ? 'Sí' : 'No';
    case 'numero': return `${typeof v === 'number' ? v.toLocaleString('es-CL', { maximumFractionDigits: 3 }) : String(v)}${c.unidad ? ` ${c.unidad}` : ''}`;
    case 'fecha': { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v); }
    case 'multiseleccion': return (v as string[]).join(', ');
    case 'foto': { const n = (v as FotoInforme[]).length; return `${n} foto${n === 1 ? '' : 's'}`; }
    case 'archivo': { const n = (v as FotoInforme[]).length; return `${n} archivo${n === 1 ? '' : 's'}`; }
    case 'firma': return 'Firmado';
    case 'lista': { const n = (v as FilaLista[]).length; return `${n} ${n === 1 ? 'fila' : 'filas'}`; }
    default: return String(v);
  }
}
/** Una fila de una lista, en una línea: «TG · 3x63 A · Bueno». */
export function filaLegible(sub: CampoInforme[], f: FilaLista): string {
  return sub.filter(c => tipoDe(c) !== 'foto')
    .map(c => (vacio(f[c.clave]) ? '' : ['si_no', 'si_no_na'].includes(tipoDe(c)) ? `${c.etiqueta}: ${valorLegible(c, f[c.clave])}` : valorLegible(c, f[c.clave])))
    .filter(Boolean).join(' · ');
}

/** Paths de fotos, archivos y firmas del informe (también los de las filas de las listas). */
export function pathsDe(i: InformeLleno): string[] {
  const de = (c: CampoInforme, v: unknown): string[] => {
    const t = tipoDe(c);
    if ((t === 'foto' || t === 'archivo') && Array.isArray(v)) return (v as FotoInforme[]).map(f => f.path).filter(Boolean);
    if (t === 'firma' && typeof v === 'string' && v) return [v];
    if (t === 'lista' && Array.isArray(v)) return (v as FilaLista[]).flatMap(f => (c.subcampos || []).flatMap(s => de(s, f[s.clave])));
    return [];
  };
  return (i.campos || []).flatMap(c => de(c, i.respuestas?.[c.clave]));
}

/** Las fotos del informe con su descripción (las de las preguntas y las de las filas). */
export function fotosDeInforme(i: InformeLleno): FotoInforme[] {
  const out: FotoInforme[] = [];
  for (const c of seccionesDe(i).flatMap(x => x.campos)) {
    const v = i.respuestas?.[c.clave];
    if (tipoDe(c) === 'foto' && Array.isArray(v)) (v as FotoInforme[]).forEach(f => out.push({ path: f.path, caption: f.caption || c.etiqueta }));
    if (tipoDe(c) === 'lista' && Array.isArray(v)) {
      (v as FilaLista[]).forEach((f, n) => (c.subcampos || []).filter(sub => tipoDe(sub) === 'foto')
        .forEach(sub => ((f[sub.clave] as FotoInforme[]) || []).forEach(x => out.push({ path: x.path, caption: x.caption || `${c.etiqueta} ${n + 1}` }))));
    }
  }
  return out;
}

const coincide = (c: CampoInforme, v: unknown) =>
  !!c.alerta?.length && (Array.isArray(v) ? v.some(x => typeof x === 'string' && c.alerta!.includes(x)) : typeof v === 'string' && c.alerta.includes(v));
/** Los riesgos marcados (valores de «alerta»): van destacados al comienzo del informe. */
export function alertasDe(i: InformeLleno): { etiqueta: string; valor: string; detalle?: string }[] {
  const out: { etiqueta: string; valor: string; detalle?: string }[] = [];
  for (const c of seccionesDe(i).flatMap(s => s.campos)) {
    const v = i.respuestas?.[c.clave];
    if (tipoDe(c) === 'lista' && Array.isArray(v)) {
      (v as FilaLista[]).forEach((f, n) => (c.subcampos || []).forEach(s => {
        if (coincide(s, f[s.clave]) || coincide(c, f[s.clave])) {
          out.push({ etiqueta: `${c.etiqueta} ${n + 1}`, valor: String(f[s.clave]), detalle: filaLegible(c.subcampos || [], f) });
        }
      }));
    } else if (coincide(c, v)) {
      out.push({ etiqueta: c.etiqueta, valor: Array.isArray(v) ? (v as string[]).filter(x => c.alerta!.includes(x)).join(', ') : String(v) });
    }
  }
  return out;
}

/** Las respuestas como lista con formato (para la introducción de la cotización). */
export function resumenInforme(i: InformeLleno | null | undefined): string {
  if (!i) return '';
  return seccionesDe(i).flatMap(s => s.campos)
    .filter(c => !vacio(i.respuestas?.[c.clave]) && !['foto', 'firma', 'archivo'].includes(tipoDe(c)) && !c.precarga && !c.interno)
    .map(c => {
      const v = i.respuestas[c.clave];
      if (tipoDe(c) === 'lista') return `- **${c.etiqueta}:** ${(v as FilaLista[]).map(f => filaLegible(c.subcampos || [], f)).filter(Boolean).join('; ')}`;
      return `- **${c.etiqueta}:** ${valorLegible(c, v)}`;
    }).join('\n');
}

// ─── Del levantamiento a la cotización ───────────────────────────────────────
export type CategoriaCot = 'material' | 'mano_obra' | 'servicio' | 'operacion';
export interface FilaCotizable {
  id: string; incluir: boolean; categoria: CategoriaCot;
  descripcion: string; especificacion?: string; marca?: string;
  cantidad: number | null; unidad: string; origen: string; validacion?: string; informe: string;
}
export interface TextoCotizable { etiqueta: string; texto: string; informe: string }
export interface AntecedentesCot {
  filas: FilaCotizable[];
  requisitos: TextoCotizable[]; diagnostico: TextoCotizable[]; montaje: TextoCotizable[];
  exclusiones: TextoCotizable[]; pendientes: TextoCotizable[];
}
const numeroDe = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const NO_COTIZA = /^(existente|por definir|no requiere|ninguno|no aplica|no|el cliente ya lo tiene)\b/i;
const COLUMNAS_META = ['cantidad', 'unidad', 'origen', 'validacion', 'marca_modelo', 'especificacion'];

/**
 * Lee las respuestas marcadas para la cotización. Las listas de materiales, equipos y trabajos
 * pasan a filas (con cantidad SOLO si se registró; si no, queda vacía y pendiente); los
 * servicios elegidos pasan a filas sin cantidad; lo demás queda como texto: requisitos,
 * diagnóstico, montaje, exclusiones y pendientes. Nada se inventa.
 */
export function antecedentesCotizacion(informes: InformeLleno[]): AntecedentesCot {
  const r: AntecedentesCot = { filas: [], requisitos: [], diagnostico: [], montaje: [], exclusiones: [], pendientes: [] };
  let n = 0;
  for (const inf of informes) {
    const nombre = inf.plantilla_nombre || 'Informe';
    for (const c of seccionesDe(inf).flatMap(s => s.campos)) {
      const tags = c.cotizacion || [];
      const v = inf.respuestas?.[c.clave];
      if (!tags.length || vacio(v)) continue;
      const t = tipoDe(c);
      const cat: CategoriaCot = tags.includes('mano_obra') ? 'mano_obra' : tags.includes('servicio') ? 'servicio'
        : tags.includes('material') || tags.includes('equipo') ? 'material' : 'operacion';
      const esFila = tags.some(x => ['material', 'equipo', 'mano_obra', 'servicio'].includes(x));

      if (t === 'lista' && esFila) {
        const sub = c.subcampos || [];
        const kDesc = sub.find(s => /descripcion|trabajo|nombre|carga|tipo|zona|ubicacion|punto/.test(s.clave) && tipoDe(s) !== 'numero')?.clave || sub[0]?.clave || '';
        const kCant = sub.find(s => /cantidad|puntos|metros|distancia/.test(s.clave) && tipoDe(s) === 'numero')?.clave;
        for (const f of v as FilaLista[]) {
          const partes = [f[kDesc], ...sub
            .filter(s => s.clave !== kDesc && s.clave !== kCant && !COLUMNAS_META.includes(s.clave) && tipoDe(s) !== 'foto' && !vacio(f[s.clave]))
            .map(s => (tipoDe(s) === 'numero' || ['si_no', 'si_no_na'].includes(tipoDe(s)) ? `${s.etiqueta}: ${valorLegible(s, f[s.clave])}` : valorLegible(s, f[s.clave])))];
          const desc = partes.filter(x => typeof x === 'string' && x.trim()).join(' · ');
          if (!desc) continue;
          const unidad = typeof f.unidad === 'string' && f.unidad ? f.unidad : kCant && /metros|distancia/.test(kCant) ? 'm' : 'un';
          r.filas.push({
            id: `f${n++}`, incluir: true, categoria: cat, descripcion: desc,
            especificacion: typeof f.especificacion === 'string' && f.especificacion ? f.especificacion : undefined,
            marca: typeof f.marca_modelo === 'string' && f.marca_modelo ? f.marca_modelo : undefined,
            cantidad: numeroDe(f[kCant || 'cantidad']), unidad,
            origen: typeof f.origen === 'string' && f.origen ? f.origen : c.naturaleza === 'medido' ? 'Medido en terreno' : 'Pendiente de confirmar',
            validacion: typeof f.validacion === 'string' ? f.validacion : undefined, informe: nombre,
          });
        }
        continue;
      }
      if (t === 'multiseleccion' && esFila) {
        for (const o of v as string[]) {
          if (NO_COTIZA.test(o)) continue;
          r.filas.push({ id: `f${n++}`, incluir: true, categoria: cat, descripcion: o, cantidad: null, unidad: cat === 'servicio' ? 'global' : 'un', origen: 'Pendiente de confirmar', informe: nombre });
        }
      } else if (esFila && (t === 'seleccion' || t === 'texto') && typeof v === 'string' && !NO_COTIZA.test(v)) {
        r.filas.push({ id: `f${n++}`, incluir: true, categoria: cat, descripcion: `${c.etiqueta}: ${v}`, cantidad: null, unidad: 'un', origen: 'Pendiente de confirmar', informe: nombre });
      }
      const texto = t === 'lista'
        ? ((v as FilaLista[]) || []).map(f => filaLegible(c.subcampos || [], f)).filter(Boolean).join('; ')
        : valorLegible(c, v);
      const item = { etiqueta: c.etiqueta, texto, informe: nombre };
      if (tags.includes('requisito')) r.requisitos.push(item);
      if (tags.includes('diagnostico')) r.diagnostico.push(item);
      if (tags.includes('montaje')) r.montaje.push(item);
      if (tags.includes('exclusion')) r.exclusiones.push(item);
      if (tags.includes('pendiente')) r.pendientes.push(item);
    }
  }
  return r;
}

const faltaFase9 = (e: { message: string }) =>
  /informes_visita|schema cache/i.test(e.message) ? new Error('Falta ejecutar supabase_fase9_planillas.sql en Supabase.') : e;

export const plantillasInformeServicio = {
  async listar(filtro: { tipo?: TipoPlantillaInforme; todas?: boolean } = {}): Promise<PlantillaInformeCompleta[]> {
    let q = supabase.from('informe_plantillas').select('*').order('nombre');
    if (!filtro.todas) q = q.eq('activa', true);
    if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
    const { data, error } = await q;
    if (error) throw error;
    return ((data || []) as PlantillaInformeCompleta[]).map(p => ({
      ...p, tipo: p.tipo || 'entrega', campos: p.campos || [], checklist: p.checklist || [],
      estado: p.estado || (p.activa ? 'activa' : 'archivada'),
    }));
  },
  async guardar(p: Partial<PlantillaInformeCompleta>) {
    const fila = {
      nombre: p.nombre, tipo: p.tipo, tipo_servicio: p.tipo_servicio || null, intro: p.intro || null,
      campos: p.campos || [], checklist: p.checklist || [], activa: (p.estado ?? 'activa') === 'activa',
    };
    const fase11 = {
      estado: p.estado || 'activa', codigo: p.codigo?.trim() || null, version: p.version ?? 1,
      descripcion: p.descripcion || null, objetivo: p.objetivo || null, instrucciones: p.instrucciones || null,
    };
    const enviar = (f: object) => (p.id ? supabase.from('informe_plantillas').update(f).eq('id', p.id) : supabase.from('informe_plantillas').insert(f));
    let { error } = await enviar({ ...fila, ...fase11 });
    // Sin la fase 11 no existen esas columnas: se guarda lo de antes.
    if (error && /codigo|version|estado|descripcion|objetivo|instrucciones/.test(error.message) && /column|schema cache/i.test(error.message)) ({ error } = await enviar(fila));
    if (error) {
      if (/uq_informe_plantillas_codigo|duplicate key/i.test(error.message)) throw new Error('Ya hay otra plantilla con ese código.');
      throw error;
    }
  },
};

export const informesVisitaService = {
  async deVisita(agendaId: string): Promise<InformeVisita[]> {
    const { data, error } = await supabase.from('informes_visita').select('*').eq('agendamiento_id', agendaId).order('folio');
    if (error) throw faltaFase9(error);
    return (data || []) as InformeVisita[];
  },
  async crear(agendaId: string, inf: InformeLleno): Promise<InformeVisita> {
    const base = {
      agendamiento_id: agendaId, plantilla_id: inf.plantilla_id || null, plantilla_nombre: inf.plantilla_nombre || null,
      intro: inf.intro || null, campos: inf.campos, respuestas: inf.respuestas, checklist: inf.checklist,
    };
    let { data, error } = await supabase.from('informes_visita').insert({
      ...base, plantilla_codigo: inf.plantilla_codigo || null, plantilla_version: inf.plantilla_version ?? null,
      objetivo: inf.objetivo || null, instrucciones: inf.instrucciones || null,
    }).select('*').single();
    // Sin la fase 11 no existen esas columnas: se guarda igual, sin ellas.
    if (error && /plantilla_codigo|plantilla_version|objetivo|instrucciones/.test(error.message)) {
      ({ data, error } = await supabase.from('informes_visita').insert(base).select('*').single());
    }
    if (error) throw faltaFase9(error);
    return data as InformeVisita;
  },
  async guardar(id: string, patch: Partial<InformeVisita>) {
    const { error } = await supabase.from('informes_visita').update(patch).eq('id', id);
    if (error) throw error;
  },
  async eliminar(id: string) {
    const { error } = await supabase.from('informes_visita').delete().eq('id', id);
    if (error) throw error;
  },
};

export const entregasService = {
  async deCotizacion(cotId: string): Promise<EntregaTrabajo[]> {
    const { data, error } = await supabase.from('entregas_trabajo').select('*').eq('cotizacion_id', cotId).order('folio');
    if (error) return [];
    return (data || []) as EntregaTrabajo[];
  },
  async crear(cotId: string, inf: InformeLleno): Promise<EntregaTrabajo> {
    const { data, error } = await supabase.from('entregas_trabajo').insert({
      cotizacion_id: cotId, plantilla_id: inf.plantilla_id || null, plantilla_nombre: inf.plantilla_nombre || null, intro: inf.intro || null,
      campos: inf.campos, respuestas: inf.respuestas, checklist: inf.checklist,
    }).select('*').single();
    if (error) {
      if (/entregas_trabajo|schema cache/i.test(error.message)) throw new Error('Falta ejecutar supabase_fase8_informes.sql en Supabase.');
      throw error;
    }
    return data as EntregaTrabajo;
  },
  async guardar(id: string, patch: Partial<EntregaTrabajo>) {
    const { error } = await supabase.from('entregas_trabajo').update(patch).eq('id', id);
    if (error) throw error;
  },
  async eliminar(id: string) {
    const { error } = await supabase.from('entregas_trabajo').delete().eq('id', id);
    if (error) throw error;
  },
};
