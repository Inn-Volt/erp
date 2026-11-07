'use client';

/**
 * Descargar la rendición de una persona en un período (por omisión, el mes en curso): junta sus
 * movimientos del fondo y sus gastos, calcula el fondo al empezar y al terminar con el mismo libro
 * de la pantalla, y arma el PDF con las boletas al final.
 */

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { Modal } from '@/components/cotizador/ui';
import RendicionPDF, { type GastoRendido } from '@/components/pdf/RendicionPDF';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { fondosService } from '@/services/fondos';
import { archivosOT, CATEGORIAS_GASTO, gastosService } from '@/services/operacion';
import { folioProyecto } from '@/services/fase5';
import { libroDelFondo, type FilaLibro } from '@/lib/fondos';
import { logoDocumento } from '@/lib/logoMarca';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { fechaLocal } from '@/utils';

/** Cómo quedan el fondo y lo que se le debe al cerrar el día `hasta` (inclusive). */
export function saldosAl(libro: FilaLibro[], hasta: string): { fondo: number; deuda: number } {
  const antes = libro.filter(f => f.fecha <= hasta);
  const ultima = antes[antes.length - 1];
  return { fondo: ultima?.saldoFondo ?? 0, deuda: ultima?.saldoDeuda ?? 0 };
}
const diaAnterior = (iso: string) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

export default function DescargarRendicion({ uid, nombre, onCerrar }: { uid: string; nombre: string; onCerrar: () => void }) {
  const { success, error: toastError } = useToast();
  const hoy = fechaLocal();
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoy);
  const [ocupado, setOcupado] = useState(false);

  const descargar = async () => {
    if (desde > hasta) { toastError('«Desde» va antes de «hasta»'); return; }
    setOcupado(true);
    try {
      const [movs, gastos, perfil] = await Promise.all([
        fondosService.movimientos(uid), gastosService.listar(uid),
        supabase.from('profiles').select('empresa_id').eq('id', uid).maybeSingle().then(r => (r.data as { empresa_id: string | null } | null)?.empresa_id || null),
      ]);
      const empresas = ((await supabase.from('empresas').select('*').order('nombre')).data || []) as EmpresaInfo[];
      const empresa = empresas.find(e => e.id === perfil) || empresas[0];
      if (!empresa) throw new Error('Falta la empresa emisora (Configuración → Empresas).');
      const propios = gastos.filter(g => g.usuario_id === uid);
      const libro = libroDelFondo([...movs].reverse(), propios.map(g => ({
        id: g.id, fecha: g.fecha, monto: Number(g.monto), monto_fondo: g.monto_fondo ?? 0, monto_propio: g.monto_propio ?? 0,
        pagado_con: g.pagado_con ?? null, estado: g.estado, descripcion: g.descripcion, categoria: g.categoria, created_at: g.created_at,
      })));
      const inicio = saldosAl(libro, diaAnterior(desde));
      const fin = saldosAl(libro, hasta);
      const delPeriodo = propios.filter(g => g.fecha >= desde && g.fecha <= hasta && g.estado !== 'rechazado').sort((a, b) => a.fecha.localeCompare(b.fecha));
      const urls = await archivosOT.urls(delPeriodo.map(g => g.boleta_path).filter((p): p is string => !!p)).catch(() => ({} as Record<string, string>));
      const filas: GastoRendido[] = delPeriodo.map(g => ({
        id: g.id, fecha: g.fecha, categoria: CATEGORIAS_GASTO.find(c => c.clave === g.categoria)?.nombre || g.categoria, descripcion: g.descripcion,
        destino: g.cotizaciones ? `IV-${String(g.cotizaciones.folio).padStart(4, '0')}` : g.proyectos ? folioProyecto(g.proyectos.folio) : g.ot_id ? 'OT' : '—',
        monto: Number(g.monto), delFondo: Number(g.monto_fondo) || 0, propio: Number(g.monto_propio) || 0,
        empresa: g.pagado_con === 'empresa', observado: g.estado === 'observado', sinBoleta: !!g.sin_boleta,
        boleta: g.boleta_path ? urls[g.boleta_path] || null : null,
      }));
      const blob = await pdf(
        <RendicionPDF empresa={{ ...empresa, logo_url: logoDocumento(empresa, { absoluto: true }) }} datos={{
          persona: nombre, desde, hasta, generada: hoy,
          fondoInicio: inicio.fondo, fondoFin: fin.fondo, deudaInicio: inicio.deuda, deudaFin: fin.deuda,
          movimientos: movs.filter(m => m.fecha >= desde && m.fecha <= hasta).reverse(), gastos: filas,
        }} />,
      ).toBlob();
      saveAs(blob, `Rendicion_${nombre.replace(/[^\w]+/g, '_').slice(0, 30)}_${desde}_a_${hasta}.pdf`);
      success('Rendición descargada');
      onCerrar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo armar la rendición'); }
    finally { setOcupado(false); }
  };

  return (
    <Modal titulo={<><FileDown size={15} /> Rendición de {nombre}</>} onCerrar={onCerrar} ancho={420} pie={<>
      <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      <button className="btn btn-primary" onClick={descargar} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <FileDown size={14} />} Descargar PDF</button>
    </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="label-muted">Desde</span>
          <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="label-muted">Hasta</span>
          <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
      </div>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
        Trae el fondo al empezar y al terminar, lo entregado y devuelto, cada gasto con lo que salió del fondo y lo que puso, y una hoja por boleta.
      </p>
    </Modal>
  );
}
