'use client';

/**
 * Plantillas de informe, informes de la visita y actas.
 *   · Plantilla (planilla, como en TecApp): introducción, secciones, preguntas de muchos tipos
 *     (listas con filas, fotos, firma…, obligatorias o condicionales) y checklist, de tipo
 *     «visita» (informes de la cita de la agenda, varios por visita) o «entrega» (el acta).
 *   · Al llenar un informe se copia la plantilla: si después se edita, lo ya llenado no cambia.
 */

import { supabase } from '@/lib/supabase';

export type TipoCampo =
  | 'seccion' | 'texto' | 'parrafo' | 'numero' | 'fecha' | 'hora' | 'si_no'
  | 'seleccion' | 'multiseleccion' | 'foto' | 'firma' | 'lista'
  | 'opciones';   // la de la fase 8: es «seleccion»
export const TIPOS_CAMPO: { clave: TipoCampo; nombre: string }[] = [
  { clave: 'seccion', nombre: '— Sección (paso) —' },
  { clave: 'texto', nombre: 'Texto corto' }, { clave: 'parrafo', nombre: 'Párrafo' },
  { clave: 'numero', nombre: 'Número' }, { clave: 'fecha', nombre: 'Fecha' }, { clave: 'hora', nombre: 'Hora' },
  { clave: 'si_no', nombre: 'Sí / No' }, { clave: 'seleccion', nombre: 'Elegir una opción' },
  { clave: 'multiseleccion', nombre: 'Elegir varias' }, { clave: 'foto', nombre: 'Fotos' },
  { clave: 'firma', nombre: 'Firma' }, { clave: 'lista', nombre: 'Lista (filas: tableros…)' },
];
/** Lo que puede ir en una fila de una lista. */
export const TIPOS_SUBCAMPO: TipoCampo[] = ['texto', 'numero', 'si_no', 'seleccion'];
export interface CondicionCampo { campo: string; op: '=' | '≠'; valor: string }
export interface CampoInforme {
  clave: string; etiqueta: string; tipo: TipoCampo; opciones?: string[]; unidad?: string;
  requerido?: boolean; ayuda?: string; subcampos?: CampoInforme[]; mostrarSi?: CondicionCampo | null;
}
export type TipoPlantillaInforme = 'visita' | 'entrega';
export interface PlantillaInformeCompleta {
  id: string; nombre: string; tipo: TipoPlantillaInforme; tipo_servicio: string | null; intro: string | null;
  campos: CampoInforme[]; checklist: { texto: string }[]; activa: boolean;
}
export interface FotoInforme { path: string; caption: string }
export type ValorSimple = string | number | boolean | null;
export type FilaLista = Record<string, ValorSimple>;
export type ValorCampo = ValorSimple | string[] | FotoInforme[] | FilaLista[];
/** Un informe lleno (los de la visita van en informes_visita; el acta, en entregas_trabajo). */
export interface InformeLleno {
  plantilla_id?: string | null; plantilla_nombre?: string | null; intro?: string | null;
  campos: CampoInforme[]; respuestas: Record<string, ValorCampo>; checklist: { texto: string; ok: boolean }[];
}
export interface InformeVisita extends InformeLleno {
  id: string; folio: number; agendamiento_id: string; estado: 'borrador' | 'completado';
  creado_por: string | null; completado_at: string | null; created_at: string; updated_at: string | null;
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
export const vacio = (v: ValorCampo | undefined) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Un informe en blanco, copiado de la plantilla. */
export function informeDesde(p: PlantillaInformeCompleta | null): InformeLleno {
  if (!p) return { campos: [], respuestas: {}, checklist: [] };
  return {
    plantilla_id: p.id, plantilla_nombre: p.nombre, intro: p.intro,
    campos: (p.campos || []).map(c => ({ ...c })), respuestas: {},
    checklist: (p.checklist || []).filter(c => c.texto?.trim()).map(c => ({ texto: c.texto, ok: false })),
  };
}

/** El valor como texto, para comparar en las condiciones: «Sí», «Trifásico»… */
function comoTexto(c: CampoInforme | undefined, v: ValorCampo | undefined): string {
  if (vacio(v)) return '';
  if (c && tipoDe(c) === 'si_no') return v === true || v === 'si' ? 'Sí' : 'No';
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

/** «Sí», «12 m», «Regular», «3 filas» o «—». */
export function valorLegible(c: CampoInforme, v: ValorCampo | undefined): string {
  if (vacio(v)) return '—';
  switch (tipoDe(c)) {
    case 'si_no': return v === true || v === 'si' ? 'Sí' : 'No';
    case 'numero': return `${String(v).replace('.', ',')}${c.unidad ? ` ${c.unidad}` : ''}`;
    case 'fecha': { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v); }
    case 'multiseleccion': return (v as string[]).join(', ');
    case 'foto': { const n = (v as FotoInforme[]).length; return `${n} foto${n === 1 ? '' : 's'}`; }
    case 'firma': return 'Firmado';
    case 'lista': { const n = (v as FilaLista[]).length; return `${n} ${n === 1 ? 'fila' : 'filas'}`; }
    default: return String(v);
  }
}
/** Una fila de una lista, en una línea: «TG · 3x63 A · Bueno». */
export function filaLegible(sub: CampoInforme[], f: FilaLista): string {
  return sub.map(c => (vacio(f[c.clave]) ? '' : tipoDe(c) === 'si_no' ? `${c.etiqueta}: ${valorLegible(c, f[c.clave])}` : valorLegible(c, f[c.clave])))
    .filter(Boolean).join(' · ');
}

/** Paths de fotos y firmas del informe (para pedir sus links). */
export function pathsDe(i: InformeLleno): string[] {
  return (i.campos || []).flatMap(c => {
    const v = i.respuestas?.[c.clave];
    if (tipoDe(c) === 'foto' && Array.isArray(v)) return (v as FotoInforme[]).map(f => f.path).filter(Boolean);
    if (tipoDe(c) === 'firma' && typeof v === 'string' && v) return [v];
    return [];
  });
}

/** Las respuestas como lista con formato (para la introducción de la cotización). */
export function resumenInforme(i: InformeLleno | null | undefined): string {
  if (!i) return '';
  return seccionesDe(i).flatMap(s => s.campos)
    .filter(c => !vacio(i.respuestas?.[c.clave]) && !['foto', 'firma'].includes(tipoDe(c)))
    .map(c => {
      const v = i.respuestas[c.clave];
      if (tipoDe(c) === 'lista') return `- **${c.etiqueta}:** ${(v as FilaLista[]).map(f => filaLegible(c.subcampos || [], f)).filter(Boolean).join('; ')}`;
      return `- **${c.etiqueta}:** ${valorLegible(c, v)}`;
    }).join('\n');
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
    return ((data || []) as PlantillaInformeCompleta[]).map(p => ({ ...p, tipo: p.tipo || 'entrega', campos: p.campos || [], checklist: p.checklist || [] }));
  },
  async guardar(p: Partial<PlantillaInformeCompleta>) {
    const fila = { nombre: p.nombre, tipo: p.tipo, tipo_servicio: p.tipo_servicio || null, intro: p.intro || null,
      campos: p.campos || [], checklist: p.checklist || [], activa: p.activa ?? true };
    const { error } = p.id ? await supabase.from('informe_plantillas').update(fila).eq('id', p.id) : await supabase.from('informe_plantillas').insert(fila);
    if (error) throw error;
  },
};

export const informesVisitaService = {
  async deVisita(agendaId: string): Promise<InformeVisita[]> {
    const { data, error } = await supabase.from('informes_visita').select('*').eq('agendamiento_id', agendaId).order('folio');
    if (error) throw faltaFase9(error);
    return (data || []) as InformeVisita[];
  },
  async crear(agendaId: string, inf: InformeLleno): Promise<InformeVisita> {
    const { data, error } = await supabase.from('informes_visita').insert({
      agendamiento_id: agendaId, plantilla_id: inf.plantilla_id || null, plantilla_nombre: inf.plantilla_nombre || null,
      intro: inf.intro || null, campos: inf.campos, respuestas: inf.respuestas, checklist: inf.checklist,
    }).select('*').single();
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
