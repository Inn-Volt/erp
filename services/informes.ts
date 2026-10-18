'use client';

/**
 * Plantillas de informe y actas (fase 8).
 *   · Plantilla: introducción, preguntas (texto, número, sí/no, opciones) y checklist, de tipo
 *     «visita» (se llena en la cita de la agenda) o «entrega» (el acta al terminar el trabajo).
 *   · Al llenar un informe se copia la plantilla: si después se edita, lo ya llenado no cambia.
 */

import { supabase } from '@/lib/supabase';

export type TipoCampo = 'texto' | 'numero' | 'si_no' | 'opciones';
export const TIPOS_CAMPO: { clave: TipoCampo; nombre: string }[] = [
  { clave: 'texto', nombre: 'Texto' }, { clave: 'numero', nombre: 'Número' },
  { clave: 'si_no', nombre: 'Sí / No' }, { clave: 'opciones', nombre: 'Elegir una opción' },
];
export interface CampoInforme { clave: string; etiqueta: string; tipo: TipoCampo; opciones?: string[]; unidad?: string }
export type TipoPlantillaInforme = 'visita' | 'entrega';
export interface PlantillaInformeCompleta {
  id: string; nombre: string; tipo: TipoPlantillaInforme; tipo_servicio: string | null; intro: string | null;
  campos: CampoInforme[]; checklist: { texto: string }[]; activa: boolean;
}
export type ValorCampo = string | number | boolean | null;
/** Un informe lleno (el de la visita va en agendamientos.informe; el acta, en entregas_trabajo). */
export interface InformeLleno {
  plantilla_id?: string | null; plantilla_nombre?: string | null; intro?: string | null;
  campos: CampoInforme[]; respuestas: Record<string, ValorCampo>; checklist: { texto: string; ok: boolean }[];
}
export interface EntregaTrabajo extends InformeLleno {
  id: string; folio: number; cotizacion_id: string; estado: 'borrador' | 'firmado'; fecha: string;
  trabajos: string | null; observaciones: string | null; fotos: { path: string; caption: string }[];
  recibido_por: string | null; recibido_rut: string | null; recibido_email: string | null;
  firma_path: string | null; firmado_at: string | null; creado_por: string | null; created_at: string;
}

export const folioActa = (n: number) => `AE-${String(n || 0).padStart(4, '0')}`;
export const claveDe = (etiqueta: string) =>
  (etiqueta || 'campo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo';

/** Un informe en blanco, copiado de la plantilla. */
export function informeDesde(p: PlantillaInformeCompleta | null): InformeLleno {
  if (!p) return { campos: [], respuestas: {}, checklist: [] };
  return {
    plantilla_id: p.id, plantilla_nombre: p.nombre, intro: p.intro,
    campos: (p.campos || []).map(c => ({ ...c })), respuestas: {},
    checklist: (p.checklist || []).filter(c => c.texto?.trim()).map(c => ({ texto: c.texto, ok: false })),
  };
}

/** «Sí», «12 m», «Regular» o «—». */
export function valorLegible(c: CampoInforme, v: ValorCampo | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (c.tipo === 'si_no') return v === true || v === 'si' ? 'Sí' : 'No';
  if (c.tipo === 'numero') return `${String(v).replace('.', ',')}${c.unidad ? ` ${c.unidad}` : ''}`;
  return String(v);
}

/** Las respuestas como lista con formato (para la introducción de la cotización). */
export function resumenInforme(i: InformeLleno | null | undefined): string {
  if (!i) return '';
  return (i.campos || [])
    .filter(c => i.respuestas?.[c.clave] !== undefined && i.respuestas?.[c.clave] !== null && i.respuestas?.[c.clave] !== '')
    .map(c => `- **${c.etiqueta}:** ${valorLegible(c, i.respuestas[c.clave])}`).join('\n');
}

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
