'use client';

import { filaClicable } from '@/lib/a11y';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';
import { supabase } from '@/lib/supabase';
import InformesDeVisita from '@/components/informes/InformesDeVisita';
import { fotosService } from '@/services/fotos';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Calendar, Plus, X, Loader2, Search, Trash2, MapPin, User,
  CalendarPlus, Download, Inbox, AlertTriangle, Camera, FileText,
} from 'lucide-react';
import { agendaService } from '@/services/agenda';
import { clientesService } from '@/services/clientes';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import type { Cliente } from '@/types';
import type { Agendamiento, ResponsableAgenda, EstadoAgenda } from '@/types/agenda';
import {
  RESPONSABLE_OPCIONES, RESPONSABLE_LABEL, RESPONSABLE_META,
  ESTADOS_AGENDA, ESTADO_AGENDA_META,
} from '@/types/agenda';
import { TIPO_SERVICIO_OPCIONES } from '@/types/solicitud';
import type { TipoServicio } from '@/types/solicitud';
import { googleCalendarUrl, descargarICS, type EventoCalendario } from '@/lib/calendario';
import { fechaLocal } from '@/utils';
import PageHeader from '@/components/PageHeader';
import LinksMapa from '@/components/LinksMapa';
import { tipoDia } from '@/lib/feriados';
import { usePermisos } from '@/hooks/usePermisos';
import { useFase } from '@/lib/fases';
import { informesVisitaService } from '@/services/informes';

// ─── Utilidades de fecha ──────────────────────────────────────────────────────
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Fecha LOCAL: toISOString() es UTC y de noche en Chile ya da "mañana".
const hoyStr = () => fechaLocal();

function etiquetaDia(fecha: string): string {
  const hoy = hoyStr();
  const d = new Date(fecha + 'T00:00:00');
  const man = new Date(); man.setDate(man.getDate() + 1);
  const manStr = fechaLocal(man);
  if (fecha === hoy) return 'Hoy';
  if (fecha === manStr) return 'Mañana';
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function hhmm(h?: string | null): string { return h ? h.slice(0, 5) : ''; }

function eventoDe(a: { titulo: string; direccion?: string | null; fecha: string; hora_inicio?: string | null; hora_fin?: string | null; notas?: string | null; folio?: number }): EventoCalendario {
  return { titulo: a.titulo, direccion: a.direccion, fecha: a.fecha, horaInicio: a.hora_inicio, horaFin: a.hora_fin, notas: a.notas, folio: a.folio };
}

const btnCal: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem',
  padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--border2)',
  background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', textDecoration: 'none',
};

// ─── Modal crear / editar ─────────────────────────────────────────────────────
// Lo que llega desde una solicitud («Agendar visita»): cliente, contacto y dirección.
type Prefill = { cliente_id?: string; solicitud_id?: string; contacto?: string; telefono?: string; direccion?: string };

function AgendaModal({ cita, clientes, createdBy, prefill, onClose, onSaved, onDeleted }: {
  cita: Agendamiento | null;
  clientes: Cliente[];
  createdBy: string;
  prefill?: Prefill;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { success, error: toastError } = useToast();
  const initCliente = cita?.cliente_id || prefill?.cliente_id || '';
  const [clienteId, setClienteId] = useState(initCliente);
  const [clienteSearch, setClienteSearch] = useState(() => {
    const c = clientes.find(x => x.id === initCliente);
    return c ? c.nombre_cliente : '';
  });
  const [showDrop, setShowDrop] = useState(false);
  const [titulo, setTitulo] = useState(cita?.titulo || 'Visita técnica');
  const [direccion, setDireccion] = useState(cita?.direccion || prefill?.direccion || (clientes.find(c => c.id === initCliente)?.direccion || ''));
  const [fecha, setFecha] = useState(cita?.fecha || hoyStr());
  const [horaIni, setHoraIni] = useState(hhmm(cita?.hora_inicio));
  const [horaFin, setHoraFin] = useState(hhmm(cita?.hora_fin));
  // «Responsable» (César / Joaquín / Ambos) es el campo antiguo: se conserva tal cual; hoy se asigna
  // al técnico encargado (cualquier usuario).
  const [responsable] = useState<ResponsableAgenda>(cita?.responsable || 'Ambos');
  const [tipos, setTipos] = useState<TipoServicio[]>(cita?.tipos_servicio || []);
  const [estado, setEstado] = useState<EstadoAgenda>(cita?.estado || 'Agendada');
  const [notas, setNotas] = useState(cita?.notas || '');
  // Fase 10: el técnico encargado (usuario); le llega el aviso y la ve en Inicio.
  const [tecnicoId, setTecnicoId] = useState(cita?.tecnico_id || '');
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string | null; email: string | null }[]>([]);
  useEffect(() => {
    supabase.from('profiles').select('id, nombre, email, activo').order('nombre')
      .then(({ data }) => setUsuarios(((data || []) as { id: string; nombre: string | null; email: string | null; activo: boolean | null }[]).filter(u => u.activo !== false)));
  }, []);
  const [saving, setSaving] = useState(false);
  // Fase 15: quién recibe en el lugar (si no es el contacto del cliente).
  const fase15 = useFase(15);
  const [contactoSitio, setContactoSitio] = useState(cita?.contacto_sitio || prefill?.contacto || '');
  const [telefonoSitio, setTelefonoSitio] = useState(cita?.telefono_sitio || prefill?.telefono || '');
  // Desde una solicitud: lo que pidió el cliente pasa a las notas (y al motivo del informe).
  useEffect(() => {
    if (cita || !prefill?.solicitud_id) return;
    supabase.from('solicitudes').select('descripcion').eq('id', prefill.solicitud_id).maybeSingle()
      .then(({ data }) => { const d = (data as { descripcion?: string | null } | null)?.descripcion?.trim(); if (d) setNotas(n => n || d); });
  }, [cita, prefill?.solicitud_id]);
  // Cerrar la visita sin informe completado pide el motivo (queda en las notas de la visita).
  const [motivoCierre, setMotivoCierre] = useState('');
  const [pideMotivo, setPideMotivo] = useState(false);
  // Fase 7: lo que se vio en la visita (notas y fotos), que pasa a la cotización.
  const conVisita = !!cita && 'fotos' in cita;
  const [notasVisita, setNotasVisita] = useState(cita?.notas_visita || '');
  const [fotos, setFotos] = useState<{ path: string; caption: string }[]>(cita?.fotos || []);
  const [urlsFotos, setUrlsFotos] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const router = useRouter();
  // Fase 9: los informes de la visita (varios, cada uno con su planilla) van aparte; acá, el
  // PDF de la visita con las notas y las fotos.
  const { puede } = usePermisos();
  const [generando, setGenerando] = useState(false);
  const datosPDF = () => {
    const cli = clientes.find(c => c.id === clienteId);
    const tecnico = usuarios.find(u => u.id === tecnicoId);
    return { fecha, titulo, hora: horaIni || null, responsable: tecnico?.nombre || tecnico?.email || RESPONSABLE_LABEL[responsable],
      contacto: contactoSitio.trim() || cli?.contacto_nombre || null, telefono: telefonoSitio.trim() || cli?.telefono, motivo: notas.trim() || null,
      cliente: { nombre: cli?.nombre_cliente || 'Sin cliente', rut: cli?.rut, direccion: direccion || cli?.direccion } };
  };
  const pdfVisita = async () => {
    if (!cita) return;
    setGenerando(true);
    try {
      const [{ pdf }, { default: InformeGeneralPDF }, { saveAs }] = await Promise.all([
        import('@react-pdf/renderer'), import('@/components/pdf/InformeGeneralPDF'), import('file-saver'),
      ]);
      const { data: emps } = await supabase.from('empresas').select('*').limit(1);
      const empresa = (emps || [])[0] as EmpresaInfo | undefined;
      if (!empresa) { toastError('Falta configurar la empresa'); return; }
      const urls = await fotosService.urls(fotos.map(f => f.path));
      const cli = clientes.find(c => c.id === clienteId);
      const blob = await pdf(
        <InformeGeneralPDF empresa={empresa} tipo="visita" folio={`VT-${String(cita.folio).padStart(4, '0')}`} fecha={fecha}
          cliente={{ nombre: cli?.nombre_cliente || 'Sin cliente', rut: cli?.rut, direccion: direccion || cli?.direccion }}
          referencia={titulo} responsable={datosPDF().responsable}
          informe={{ campos: [], respuestas: {}, checklist: [] }}
          observaciones={notasVisita} fotos={fotos.filter(f => urls[f.path]).map(f => ({ url: urls[f.path], caption: f.caption }))} />,
      ).toBlob();
      saveAs(blob, `Informe_visita_VT-${String(cita.folio).padStart(4, '0')}.pdf`);
    } catch { toastError('No se pudo generar el PDF'); }
    finally { setGenerando(false); }
  };
  useEffect(() => {
    if (fotos.length) fotosService.urls(fotos.map(f => f.path)).then(u => setUrlsFotos(x => ({ ...x, ...u }))).catch(() => {});
  }, [fotos]);
  const subirFotos = async (files: FileList | null) => {
    if (!files?.length || !cita) return;
    setSubiendo(true);
    try {
      const nuevas: { path: string; caption: string }[] = [];
      for (const f of Array.from(files).slice(0, 12)) nuevas.push({ path: await fotosService.subir(`visitas/${cita.id}`, f), caption: '' });
      setFotos(x => [...x, ...nuevas]);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); }
  };

  const toggleTipo = (t: TipoServicio) => setTipos(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const elegirCliente = (c: Cliente) => {
    setClienteId(c.id);
    setClienteSearch(c.nombre_cliente);
    setShowDrop(false);
    if (!direccion && c.direccion) setDireccion(c.direccion);
    if ((titulo === 'Visita técnica' || !titulo)) setTitulo(`Visita técnica · ${c.nombre_cliente}`);
  };

  const clientesFiltrados = (() => {
    const q = clienteSearch.trim().toLowerCase();
    const base = q ? clientes.filter(c =>
      c.nombre_cliente.toLowerCase().includes(q) ||
      (c.empresa || '').toLowerCase().includes(q) ||
      (c.rut || '').toLowerCase().includes(q)) : clientes;
    return base.slice(0, 8);
  })();

  const evento = eventoDe({ titulo, direccion, fecha, hora_inicio: horaIni, hora_fin: horaFin, notas, folio: cita?.folio });
  const diaFecha = fecha ? tipoDia(fecha) : { tipo: 'laboral' as const, nombre: null };

  // «Guardar y cotizar»: se lee en el mismo clic que envía el formulario (un estado llegaría tarde).
  const cotizarDespues = useRef(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) { toastError('Ponle un título a la cita'); return; }
    if (!fecha) { toastError('Selecciona una fecha'); return; }
    const estadoFinal: EstadoAgenda = cotizarDespues.current ? 'Realizada' : estado;
    setSaving(true);
    try {
      // Al cerrar la visita, que quede su informe; si no lo hay, por qué.
      let notaCierre = '';
      if (cita && conVisita && estadoFinal === 'Realizada' && cita.estado !== 'Realizada') {
        const informes = await informesVisitaService.deVisita(cita.id).catch(() => null);
        if (informes && !informes.some(i => i.estado === 'completado')) {
          if (!motivoCierre.trim()) {
            setPideMotivo(true);
            cotizarDespues.current = false;
            toastError('La visita no tiene un informe completado: complétalo o escribe por qué se cierra sin él.');
            return;
          }
          notaCierre = `Cerrada sin informe: ${motivoCierre.trim()}`;
        }
      }
      const notasFinales = [notasVisita.trim(), notaCierre].filter(Boolean).join('\n\n');
      const payload = {
        cliente_id: clienteId || null,
        solicitud_id: cita?.solicitud_id || prefill?.solicitud_id || null,
        titulo: titulo.trim(),
        direccion: direccion.trim() || null,
        fecha,
        hora_inicio: horaIni || null,
        hora_fin: horaFin || null,
        responsable,
        tipos_servicio: tipos,
        estado: estadoFinal,
        notas: notas.trim() || null,
        ...(tecnicoId || (cita && 'tecnico_id' in cita) ? { tecnico_id: tecnicoId || null } : {}),
        ...(fase15 ? { contacto_sitio: contactoSitio.trim() || null, telefono_sitio: telefonoSitio.trim() || null } : {}),
        created_by: cita?.created_by || createdBy,
        ...(conVisita ? { notas_visita: notasFinales || null, fotos } : {}),
      };
      if (cita) { await agendaService.update(cita.id, payload); success('Cita actualizada'); }
      else { await agendaService.create(payload); success('Cita agendada'); }
      onSaved();
      onClose();
      if (cotizarDespues.current && cita) router.push(`/cotizador?visita=${cita.id}${cita.solicitud_id ? `&solicitud=${cita.solicitud_id}` : ''}`);
    } catch (err) {
      cotizarDespues.current = false;
      const m = err instanceof Error ? err.message : 'desconocido';
      toastError(/tecnico_id/.test(m) ? 'Falta ejecutar supabase_fase10_visita_tecnico.sql en Supabase.' : 'Error: ' + m);
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    if (!cita) return;
    if (!confirm('¿Eliminar esta cita? No se puede deshacer.')) return;
    try { await agendaService.delete(cita.id); success('Cita eliminada'); onDeleted(); onClose(); }
    catch (err) { toastError('Error: ' + (err instanceof Error ? err.message : '')); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><Calendar size={13} /> {cita ? 'Editar cita' : 'Nueva cita'}</p>
          {cita && <a href={`/visita/${cita.id}`} className="btn btn-ghost btn-sm" style={{ marginRight: 8 }} title="Lo que ve el técnico: información e informes">Panel de la visita</a>}
          <button aria-label="Cerrar" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            <div style={{ position: 'relative' }}>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Cliente</label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <input className="input" value={clienteSearch} autoComplete="off"
                  onChange={e => { setClienteSearch(e.target.value); setShowDrop(true); if (!e.target.value) setClienteId(''); }}
                  onFocus={() => setShowDrop(true)} onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                  placeholder="Buscar por nombre, empresa o RUT…" style={{ paddingLeft: '1.9rem' }} />
              </div>
              {showDrop && clientesFiltrados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', maxHeight: 220, overflowY: 'auto' }}>
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button" onMouseDown={() => elegirCliente(c)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', background: c.id === clienteId ? 'var(--y-soft)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text)', fontWeight: 500 }}>{c.nombre_cliente}</span>
                      {(c.empresa || c.direccion) && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 6 }}>{[c.empresa, c.direccion].filter(Boolean).join(' · ')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Título *</label>
              <input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Visita técnica" />
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Dirección</label>
              <input className="input" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dónde es la visita" />
              {direccion.trim() && <div style={{ marginTop: '0.45rem' }}><LinksMapa direccion={direccion} compacto /></div>}
            </div>

            {fase15 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
                <div>
                  <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Quién recibe en el lugar</label>
                  <input className="input" value={contactoSitio} onChange={e => setContactoSitio(e.target.value)}
                    placeholder={clientes.find(c => c.id === clienteId)?.contacto_nombre || 'Nombre del contacto'} />
                </div>
                <div>
                  <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Teléfono en el lugar</label>
                  <input className="input" type="tel" value={telefonoSitio} onChange={e => setTelefonoSitio(e.target.value)}
                    placeholder={clientes.find(c => c.id === clienteId)?.telefono || '+56 9 …'} />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Fecha *</label>
                <input className="input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Inicio</label>
                <input className="input" type="time" value={horaIni} onChange={e => setHoraIni(e.target.value)} />
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Fin</label>
                <input className="input" type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} />
              </div>
            </div>
            {(diaFecha.tipo === 'feriado' || diaFecha.tipo === 'domingo') && (
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text)', background: 'var(--y-soft)', border: '1px solid var(--border2)', borderRadius: 8, padding: '0.5rem 0.7rem', marginTop: '-0.25rem' }}>
                <AlertTriangle size={14} color="var(--y)" style={{ flexShrink: 0 }} />
                {diaFecha.tipo === 'feriado' ? `Es feriado: ${diaFecha.nombre}.` : 'Es domingo.'} Confirma que el cliente pueda recibirlos.
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Técnico encargado</label>
                <select className="input" value={tecnicoId} onChange={e => setTecnicoId(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
                </select>
              </div>
              <div>
                <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Estado</label>
                <select className="input" value={estado} onChange={e => setEstado(e.target.value as EstadoAgenda)}>
                  {ESTADOS_AGENDA.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p style={{ margin: '-0.5rem 0 0', fontSize: '0.74rem', color: 'var(--muted)' }}>
              Al técnico le llega el aviso al celular y la ve en su Inicio, con la dirección y para hacer los informes.
              {!tecnicoId && responsable !== 'Ambos' && <> Antes estaba a cargo de {RESPONSABLE_LABEL[responsable]}.</>}
            </p>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Tipos de servicio</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {TIPO_SERVICIO_OPCIONES.map(t => {
                  const on = tipos.includes(t.key);
                  return (
                    <button key={t.key} type="button" onClick={() => toggleTipo(t.key)}
                      style={{ cursor: 'pointer', fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: 999, border: `1px solid ${on ? 'var(--y-brand)' : 'var(--border2)'}`, background: on ? 'var(--y-soft)' : 'transparent', color: on ? 'var(--y)' : 'var(--muted)', fontWeight: on ? 600 : 400 }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label-muted" style={{ display: 'block', marginBottom: '0.4rem' }}>Notas</label>
              <textarea className="input" value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Detalles, contacto en sitio, materiales a llevar…" style={{ resize: 'vertical' }} />
            </div>

            {conVisita && (
              <div style={{ borderTop: '1px dashed var(--border2)', paddingTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="label-muted" style={{ margin: 0 }}>Lo que se vio en la visita (pasa a la cotización; las fotos, al PDF si quieres)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="label-muted">Informes (levantamiento, checklist… cada uno con su planilla)</span>
                  <InformesDeVisita agendaId={cita.id} editable={puede('agenda.gestionar')} datos={datosPDF} tiposServicio={tipos} />
                </div>
                <span className="label-muted">Notas y fotos de la visita</span>
                <textarea className="input" rows={3} value={notasVisita} onChange={e => setNotasVisita(e.target.value)}
                  placeholder="Estado del tablero, distancias, qué hay que cambiar, qué pidió el cliente…" style={{ resize: 'vertical' }} />
                {fotos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 120px), 1fr))', gap: 8 }}>
                    {fotos.map((f, i) => (
                      <div key={f.path} style={{ position: 'relative' }}>
                        {urlsFotos[f.path] ? <img src={urlsFotos[f.path]} alt={f.caption || 'Foto de la visita'} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                          : <div className="skeleton" style={{ aspectRatio: '4/3' }} />}
                        <input className="input" style={{ marginTop: 4, fontSize: '0.78rem', padding: '0.3rem 0.5rem' }} placeholder="Descripción" value={f.caption}
                          onChange={e => setFotos(x => x.map((y, j) => (j === i ? { ...y, caption: e.target.value } : y)))} />
                        <button type="button" aria-label="Quitar foto" onClick={() => setFotos(x => x.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: 99, width: 24, height: 24, cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    {subiendo ? <Loader2 size={13} className="iv-spin" /> : <Camera size={13} />} Agregar fotos
                    <input type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { subirFotos(e.target.files); e.target.value = ''; }} />
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={pdfVisita} disabled={generando} title="El informe de la visita en PDF (para el cliente o para el archivo)">
                    {generando ? <Loader2 size={13} className="iv-spin" /> : <Download size={13} />} PDF de la visita</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !clienteId} title={clienteId ? 'Guarda la visita como realizada y abre una cotización con lo que se vio' : 'Elige el cliente primero'}
                    onClick={() => { cotizarDespues.current = true; }}>
                    <FileText size={13} /> Guardar y cotizar con esta visita</button>
                </div>
              </div>
            )}

            {/* Exportar a calendario */}
            <div style={{ borderTop: '1px dashed var(--border2)', paddingTop: '0.9rem' }}>
              <p className="label-muted" style={{ marginBottom: '0.5rem' }}>Agregar a mi calendario (recordatorio en el teléfono)</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <a href={googleCalendarUrl(evento)} target="_blank" rel="noreferrer" style={btnCal}><CalendarPlus size={14} /> Google Calendar</a>
                <button type="button" onClick={() => descargarICS(evento)} style={btnCal}><Download size={14} /> Apple / .ics</button>
              </div>
            </div>
          </div>

          {pideMotivo && (
            <div style={{ padding: '0.8rem 1.5rem', borderTop: '1px solid var(--border2)', background: 'var(--y-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="label-muted" style={{ color: 'var(--text)' }}>La visita no tiene un informe completado. ¿Por qué se cierra sin él?</label>
              <textarea className="input" rows={2} autoFocus value={motivoCierre} onChange={e => setMotivoCierre(e.target.value)}
                placeholder="Ej.: el cliente solo quería un presupuesto referencial; se reagendó el levantamiento…" style={{ resize: 'vertical' }} />
            </div>
          )}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border2)', display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
            {cita
              ? <button type="button" onClick={eliminar} className="btn btn-danger btn-sm"><Trash2 size={13} /> Eliminar</button>
              : <span />}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 size={13} className="iv-spin" /> : <Plus size={13} />}
                {cita ? 'Guardar' : 'Agendar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
function AgendaContent() {
  const { puede } = usePermisos();
  const puedeAgendar = puede('agenda.gestionar');
  const { user, userName } = useAuth(true);
  const { error: toastError } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCliente = searchParams.get('cliente') || undefined;
  const prefillSolicitud = searchParams.get('solicitud') || undefined;
  const prefillContacto = searchParams.get('contacto') || undefined;
  const prefillTelefono = searchParams.get('telefono') || undefined;
  const prefillDireccion = searchParams.get('direccion') || undefined;
  const abrirNueva = searchParams.get('nueva') === '1' || !!prefillSolicitud || !!prefillCliente;
  const abrirCita = searchParams.get('cita');

  const [citas, setCitas] = useState<Agendamiento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; cita: Agendamiento | null; prefill?: Prefill }>({ open: false, cita: null });
  // Filtro por técnico (usuario); las citas antiguas sin técnico se filtran por su responsable.
  const [fResp, setFResp] = useState('');
  const [tecnicos, setTecnicos] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from('profiles').select('id, nombre, email').order('nombre')
      .then(({ data }) => setTecnicos(Object.fromEntries(((data || []) as { id: string; nombre: string | null; email: string | null }[]).map(u => [u.id, u.nombre || u.email || 'Usuario']))));
  }, []);
  const [fEstado, setFEstado] = useState<EstadoAgenda | ''>('');
  const [rango, setRango] = useState<'proximas' | 'hoy' | 'semana' | 'todas'>('proximas');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([agendaService.getAll(), clientesService.getAll()]);
      setCitas(a);
      setClientes(c);
    } catch (e) {
      toastError('No se pudo cargar la agenda: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  // Abrir "nueva cita" prellenada al llegar con ?solicitud/&cliente/&nueva.
  useEffect(() => {
    if (abrirNueva && !loading) {
      setModal({ open: true, cita: null, prefill: { cliente_id: prefillCliente, solicitud_id: prefillSolicitud, contacto: prefillContacto, telefono: prefillTelefono, direccion: prefillDireccion } });
      // limpia la query para no reabrir al recargar
      router.replace('/agenda');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirNueva, loading]);

  // Abrir una cita al llegar con ?cita= (desde el panel de la visita).
  useEffect(() => {
    if (!abrirCita || loading) return;
    const c = citas.find(x => x.id === abrirCita);
    if (c) setModal({ open: true, cita: c });
    router.replace('/agenda');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirCita, loading]);

  const hoy = hoyStr();
  const finSemana = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return fechaLocal(d); })();

  // Responsables antiguos que siguen en citas sin técnico (para no perder ese filtro).
  const antiguos = RESPONSABLE_OPCIONES.filter(r => r.key !== 'Ambos' && citas.some(c => !c.tecnico_id && c.responsable === r.key));
  const conTecnico = Object.entries(tecnicos).filter(([id]) => citas.some(c => c.tecnico_id === id));

  const filtradas = citas.filter(c => {
    if (fResp === '-' && c.tecnico_id) return false;
    if (fResp.startsWith('u:') && c.tecnico_id !== fResp.slice(2)) return false;
    if (fResp.startsWith('r:') && (c.tecnico_id || c.responsable !== fResp.slice(2))) return false;
    if (fEstado && c.estado !== fEstado) return false;
    if (rango === 'hoy' && c.fecha !== hoy) return false;
    if (rango === 'semana' && (c.fecha < hoy || c.fecha > finSemana)) return false;
    if (rango === 'proximas' && c.fecha < hoy) return false;
    return true;
  });

  // Agrupar por fecha (ya vienen ordenadas por fecha/hora)
  const grupos: { fecha: string; items: Agendamiento[] }[] = [];
  for (const c of filtradas) {
    const g = grupos.find(x => x.fecha === c.fecha);
    if (g) g.items.push(c); else grupos.push({ fecha: c.fecha, items: [c] });
  }

  return (
    <div className="anim-in">
      {modal.open && (
        <AgendaModal
          cita={modal.cita}
          clientes={clientes}
          createdBy={user?.email || userName}
          prefill={modal.prefill}
          onClose={() => setModal({ open: false, cita: null })}
          onSaved={load}
          onDeleted={load}
        />
      )}

      <PageHeader
        eyebrow="Visitas y citas"
        title="Agenda"
        subtitle="Visitas técnicas y citas del equipo"
        actions={<>
{puedeAgendar && <button onClick={() => setModal({ open: true, cita: null })} className="btn btn-primary"><Plus size={14} /> Nueva cita</button>}
        </>}
      />

      <div className="panel-y">
        {/* Filtros */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg3)', borderRadius: 8, padding: 2 }}>
            {([['proximas', 'Próximas'], ['hoy', 'Hoy'], ['semana', 'Semana'], ['todas', 'Todas']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setRango(k)}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer', background: rango === k ? 'var(--y-brand)' : 'transparent', color: rango === k ? 'var(--on-accent)' : 'var(--muted)', fontWeight: rango === k ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>
          <select className="input" value={fResp} onChange={e => setFResp(e.target.value)} style={{ maxWidth: 190 }} aria-label="Filtrar por técnico">
            <option value="">Todos los técnicos</option>
            {conTecnico.map(([id, nombre]) => <option key={id} value={`u:${id}`}>{nombre}</option>)}
            <option value="-">Sin técnico asignado</option>
            {antiguos.map(r => <option key={r.key} value={`r:${r.key}`}>{r.label} (antes)</option>)}
          </select>
          <select className="input" value={fEstado} onChange={e => setFEstado(e.target.value as EstadoAgenda | '')} style={{ maxWidth: 160 }}>
            <option value="">Todos los estados</option>
            {ESTADOS_AGENDA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        ) : grupos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <Calendar size={36} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontSize: '0.875rem' }}>No hay citas {rango === 'todas' ? '' : 'en este rango'}</p>
            {puedeAgendar && <button onClick={() => setModal({ open: true, cita: null })} className="btn btn-ghost" style={{ marginTop: '1rem' }}><Plus size={13} /> Agendar {rango === 'todas' ? 'la primera' : 'una cita'}</button>}
          </div>
        ) : (
          <div style={{ padding: '0.5rem 0' }}>
            {grupos.map(g => (
              <div key={g.fecha}>
                <div style={{ padding: '0.65rem 1rem 0.45rem', position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: g.fecha === hoy ? 'var(--y)' : 'var(--text)' }}>
                    {etiquetaDia(g.fecha)}
                  </span>
                  {(() => {
                    const d = tipoDia(g.fecha);
                    if (d.tipo !== 'feriado') return null;
                    return <span className="badge" style={{ background: 'var(--y-soft)', color: 'var(--y)' }}>Feriado · {d.nombre}</span>;
                  })()}
                </div>
                {g.items.map(c => {
                  const rm = RESPONSABLE_META[c.responsable] || RESPONSABLE_META.Ambos;
                  const tecnico = c.tecnico_id ? tecnicos[c.tecnico_id] : null;
                  const em = ESTADO_AGENDA_META[c.estado];
                  return (
                    // Quien gestiona la agenda edita la cita; el resto (el técnico) abre el panel de la visita.
                    <div key={c.id} {...filaClicable} onClick={() => { if (puedeAgendar) setModal({ open: true, cita: c }); else router.push(`/visita/${c.id}`); }}
                      aria-label={`${c.titulo}, ${etiquetaDia(c.fecha)}${c.hora_inicio ? ` a las ${hhmm(c.hora_inicio)}` : ''}`}
                      style={{ display: 'flex', gap: '0.85rem', padding: '0.8rem 1rem', borderTop: '1px solid var(--border2)', cursor: 'pointer', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 52, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>{hhmm(c.hora_inicio) || '—'}</div>
                        {c.hora_fin && <div style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{hhmm(c.hora_fin)}</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {c.clientes?.nombre_cliente && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><User size={11} /> {c.clientes.nombre_cliente}</span>}
                          {c.direccion && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}><MapPin size={11} /> {c.direccion}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {tecnico
                            ? <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><User size={10} /> {tecnico}</span>
                            : <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, background: rm.bg, color: rm.color }}>{c.responsable === 'Ambos' ? 'Sin técnico' : RESPONSABLE_LABEL[c.responsable]}</span>}
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, background: em.bg, color: em.color }}>{c.estado}</span>
                          {c.solicitudes?.folio && <span style={{ fontSize: '0.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Inbox size={10} /> SOL #{String(c.solicitudes.folio).padStart(4, '0')}</span>}
                          {c.direccion && c.estado !== 'Realizada' && c.estado !== 'Cancelada' && <LinksMapa direccion={c.direccion} compacto />}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <a href={googleCalendarUrl(eventoDe(c))} target="_blank" rel="noreferrer" title="Agregar a Google Calendar" style={{ color: 'var(--muted)', display: 'inline-flex', padding: 4 }}><CalendarPlus size={15} /></a>
                        <button onClick={() => descargarICS(eventoDe(c))} title="Descargar .ics (Apple)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><Download size={15} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)', color: 'var(--muted)', fontSize: '0.75rem' }}>
          {filtradas.length} cita{filtradas.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}><Loader2 size={20} className="iv-spin" /></div>}>
      <AgendaContent />
    </Suspense>
  );
}
