'use client';

/**
 * Los informes de una visita de la agenda (fase 9): una visita puede llevar varios, cada uno
 * con su planilla (levantamiento eléctrico, visita de cargador…). Se crean eligiendo la
 * planilla, se llenan por pasos a pantalla completa y cada uno tiene su PDF.
 */

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Download, Loader2, Plus, Trash2 } from 'lucide-react';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import InformeVisitaModal from '@/components/informes/InformeVisitaModal';
import { supabase } from '@/lib/supabase';
import { fotosService } from '@/services/fotos';
import {
  folioInforme, informeDesde, tipoDe, informesVisitaService, pathsDe, plantillasInformeServicio,
  type InformeVisita, type PlantillaInformeCompleta,
} from '@/services/informes';
import { useToast } from '@/hooks/useToast';
import { fechaLocal } from '@/utils';

export interface DatosVisitaPDF {
  fecha: string; titulo: string; responsable: string;
  cliente: { nombre: string; rut?: string | null; direccion?: string | null };
  contacto?: string | null; telefono?: string | null; hora?: string | null;
}

/** Descarga el PDF de un informe de visita. */
export async function pdfInformeVisita(inf: InformeVisita, v: DatosVisitaPDF) {
  const [{ pdf }, { default: InformeGeneralPDF }, { saveAs }] = await Promise.all([
    import('@react-pdf/renderer'), import('@/components/pdf/InformeGeneralPDF'), import('file-saver'),
  ]);
  const { data: emps } = await supabase.from('empresas').select('*').limit(1);
  const empresa = (emps || [])[0] as EmpresaInfo | undefined;
  if (!empresa) throw new Error('Falta configurar la empresa');
  const urls = await fotosService.urls(pathsDe(inf));
  const blob = await pdf(
    <InformeGeneralPDF empresa={empresa} tipo="visita" folio={folioInforme(inf.folio)} fecha={v.fecha || fechaLocal()}
      cliente={v.cliente} referencia={v.titulo} responsable={v.responsable} informe={inf} fotos={[]} urls={urls}
      hora={v.hora} estadoInforme={inf.estado} completadoAt={inf.completado_at} />,
  ).toBlob();
  saveAs(blob, `${(inf.plantilla_nombre || 'Informe').replace(/[^\p{L}\p{N}]+/gu, '_')}_${folioInforme(inf.folio)}.pdf`);
}

export default function InformesDeVisita({ agendaId, editable, datos, tiposServicio }: {
  agendaId: string; editable: boolean; datos: () => DatosVisitaPDF; tiposServicio?: string[];
}) {
  const { error: toastError } = useToast();
  const [lista, setLista] = useState<InformeVisita[] | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaInformeCompleta[]>([]);
  const [abierto, setAbierto] = useState<InformeVisita | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [falta, setFalta] = useState('');

  const cargar = useCallback(async () => {
    try { setLista(await informesVisitaService.deVisita(agendaId)); setFalta(''); }
    catch (e) { setLista([]); setFalta(e instanceof Error ? e.message : 'No se pudieron cargar los informes'); }
  }, [agendaId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { plantillasInformeServicio.listar({ tipo: 'visita' }).then(setPlantillas).catch(() => setPlantillas([])); }, []);

  // Primero las planillas del tipo de servicio de la visita.
  const ordenadas = [...plantillas].sort((a, b) =>
    Number(!!b.tipo_servicio && !!tiposServicio?.includes(b.tipo_servicio)) - Number(!!a.tipo_servicio && !!tiposServicio?.includes(a.tipo_servicio)));

  const crear = async (p: PlantillaInformeCompleta) => {
    setEligiendo(false); setOcupado('nuevo');
    try {
      // Todo informe lleva sus fotos: si la planilla no pide fotos, se agrega un paso «Fotos» al final.
      const v = datos();
      const inf = informeDesde(p, { cliente: v.cliente.nombre, direccion: v.cliente.direccion, contacto: v.contacto, telefono: v.telefono, fecha: v.fecha, tecnico: v.responsable });
      if (!inf.campos.some(c => tipoDe(c) === 'foto')) {
        inf.campos.push({ clave: '_s_fotos', etiqueta: 'Fotos', tipo: 'seccion' }, { clave: 'fotos', etiqueta: 'Fotos de la visita', tipo: 'foto' });
      }
      const nuevo = await informesVisitaService.crear(agendaId, inf); setAbierto(nuevo); cargar();
    }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo crear el informe'); }
    finally { setOcupado(null); }
  };
  const eliminar = async (i: InformeVisita) => {
    if (!confirm(`¿Eliminar el informe ${folioInforme(i.folio)} (${i.plantilla_nombre || 'informe'})? No se puede deshacer.`)) return;
    try { await informesVisitaService.eliminar(i.id); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo eliminar'); }
  };
  const pdf = async (i: InformeVisita) => {
    setOcupado(i.id);
    try { await pdfInformeVisita(i, datos()); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo generar el PDF'); }
    finally { setOcupado(null); }
  };

  if (falta) return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{falta}</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lista === null ? <div className="skeleton" style={{ height: 40 }} /> : lista.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border2)', borderRadius: 10, padding: '0.45rem 0.6rem' }}>
          <ClipboardList size={15} color="var(--y)" style={{ flexShrink: 0 }} />
          <button type="button" onClick={() => setAbierto(i)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.plantilla_nombre || 'Informe'}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{folioInforme(i.folio)} · </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: i.estado === 'completado' ? 'var(--success)' : 'var(--y)' }}>{i.estado === 'completado' ? 'Completado' : 'Borrador'}</span>
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => pdf(i)} title="PDF" aria-label="PDF del informe">
            {ocupado === i.id ? <Loader2 size={12} className="iv-spin" /> : <Download size={12} />}</button>
          {editable && <button type="button" className="btn btn-ghost btn-xs" onClick={() => eliminar(i)} aria-label="Eliminar informe"><Trash2 size={12} /></button>}
        </div>
      ))}

      {editable && (eligiendo ? (
        <div style={{ border: '1px dashed var(--border2)', borderRadius: 10, padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label-muted">¿Qué informe?</span>
          {ordenadas.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>No hay planillas de visita: créalas en Mi empresa → Plantillas de informe.</span>}
          {ordenadas.map(p => {
            const sugerida = !!p.tipo_servicio && !!tiposServicio?.includes(p.tipo_servicio);
            return (
              <button key={p.id} type="button" onClick={() => crear(p)}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left', width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${sugerida ? 'var(--y-brand)' : 'var(--border2)'}`, background: sugerida ? 'var(--y-soft)' : 'transparent', color: 'var(--text)' }}>
                <ClipboardList size={14} color="var(--y)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: '0.86rem' }}>{p.nombre}</b>{sugerida && <span style={{ fontSize: '0.7rem', color: 'var(--y)', marginLeft: 6 }}>sugerida</span>}
                  {p.descripcion && <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)' }}>{p.descripcion}</span>}
                </span>
              </button>
            );
          })}
          <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-end' }} onClick={() => setEligiendo(false)}>Cancelar</button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEligiendo(true)} disabled={ocupado === 'nuevo'}>
          {ocupado === 'nuevo' ? <Loader2 size={13} className="iv-spin" /> : <Plus size={13} />} Nuevo informe</button>
      ))}

      {abierto && (
        <InformeVisitaModal informe={abierto} editable={editable} onPDF={pdf}
          onCerrar={act => { setAbierto(null); setLista(l => (l || []).map(x => (x.id === act.id ? act : x))); cargar(); }} />
      )}
    </div>
  );
}
