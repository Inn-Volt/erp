'use client';

/**
 * Mis OT (como «Mis tickets» de TecApp): lo que tiene asignado el técnico, ordenado por lo
 * que le toca hacer — hoy y atrasadas, próximas, en curso y por cerrar — con su visita,
 * cliente, dirección (mapa y Waze) y teléfono. Tocar una OT abre su detalle, donde inicia
 * el trabajo, hace el informe de visita con la firma del cliente y rinde sus gastos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, MapPin, Phone, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import ChipEstadoOT from '@/components/ChipEstadoOT';
import LinksMapa from '@/components/LinksMapa';
import AvisosCelular from '@/components/AvisosCelular';
import { faltaFase2, folioOT, otService, type OrdenTrabajo } from '@/services/operacion';
import { visitasService, type Visita } from '@/services/fase5';
import { usePermisos } from '@/hooks/usePermisos';
import { fechaLocal, formatDate, sumarDias } from '@/utils';

type Grupo = 'hoy' | 'curso' | 'proximas' | 'sin_fecha' | 'cerrar' | 'terminadas';
const GRUPOS: { clave: Grupo; titulo: string; ayuda: string }[] = [
  { clave: 'hoy', titulo: 'Hoy y atrasadas', ayuda: 'Las que tocan hoy o ya pasaron de su fecha.' },
  { clave: 'curso', titulo: 'En curso', ayuda: 'Iniciadas o en pausa: termina el informe.' },
  { clave: 'proximas', titulo: 'Próximas', ayuda: 'Programadas para los próximos días.' },
  { clave: 'sin_fecha', titulo: 'Sin fecha', ayuda: 'Asignadas, todavía sin visita programada.' },
  { clave: 'cerrar', titulo: 'Ejecutadas', ayuda: 'Con el trabajo hecho: coordinación revisa y cierra.' },
  { clave: 'terminadas', titulo: 'Cerradas', ayuda: 'Las últimas que se cerraron.' },
];

export default function MisOTPage() {
  const { perfil } = usePermisos();
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [busca, setBusca] = useState('');
  const [verCerradas, setVerCerradas] = useState(false);
  const hoy = fechaLocal();

  const cargar = useCallback(async () => {
    if (!perfil) return;
    try {
      const [o, v] = await Promise.all([
        otService.listar(),
        visitasService.mias(perfil.id, sumarDias(hoy, -60), sumarDias(hoy, 120)).catch(() => [] as Visita[]),
      ]);
      setOts(o.filter(x => x.tecnicos.includes(perfil.id) && x.estado !== 'anulada'));
      setVisitas(v.filter(x => x.estado === 'programada'));
    } catch (e) { if (faltaFase2(e)) setFalta(true); }
    finally { setCargando(false); }
  }, [perfil, hoy]);
  useEffect(() => { cargar(); }, [cargar]);
  // Al volver a la app (desde el aviso del celular, por ejemplo) se pone al día sola.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  // La próxima visita de cada OT (la más cercana que siga programada).
  const proxima = useMemo(() => {
    const m = new Map<string, Visita>();
    for (const v of visitas) if (!m.has(v.ot_id)) m.set(v.ot_id, v);
    return m;
  }, [visitas]);

  const fechaDe = (o: OrdenTrabajo) => proxima.get(o.id)?.fecha || o.fecha_programada || null;
  const horaDe = (o: OrdenTrabajo) => (proxima.get(o.id)?.hora_inicio || o.hora_programada || '').slice(0, 5);
  const grupoDe = (o: OrdenTrabajo): Grupo => {
    if (o.estado === 'cerrada') return 'terminadas';
    if (o.estado === 'ejecutada') return 'cerrar';
    if (o.estado === 'en_progreso' || o.estado === 'en_pausa') return 'curso';
    const f = fechaDe(o);
    if (!f) return 'sin_fecha';
    return f <= hoy ? 'hoy' : 'proximas';
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ots.filter(o => !q || `${folioOT(o.folio)} ${o.titulo} ${o.clientes?.nombre_cliente || ''} ${o.direccion || ''}`.toLowerCase().includes(q));
  }, [ots, busca]);

  const porGrupo = useMemo(() => {
    const m = new Map<Grupo, OrdenTrabajo[]>();
    for (const o of filtradas) { const g = grupoDe(o); m.set(g, [...(m.get(g) || []), o]); }
    for (const [g, l] of m) l.sort((a, b) => (g === 'terminadas' ? (b.cerrada_at || '').localeCompare(a.cerrada_at || '') : (fechaDe(a) || '9').localeCompare(fechaDe(b) || '9')));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, proxima]);

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Mi trabajo" title="Mis OT" /><FaltaSQL /></div>;

  const pendientes = ots.filter(o => !['cerrada', 'ejecutada'].includes(o.estado)).length;

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi trabajo" title="Mis OT"
        subtitle={cargando ? 'Cargando…' : pendientes ? `${pendientes} por atender` : 'Nada pendiente por ahora'} />

      <div className="mb-4 flex flex-col gap-3">
        <AvisosCelular compacto />
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input className="input" style={{ paddingLeft: '2.2rem' }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por N°, cliente o dirección…" />
        </div>
      </div>

      {cargando ? <div className="skeleton" style={{ height: 220 }} /> : ots.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-content-muted">
          No tienes OT asignadas. Cuando te asignen una, te llega el aviso{' '}
          {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' ? 'al celular' : 'en la campana'}.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {GRUPOS.filter(g => g.clave !== 'terminadas' || verCerradas).map(g => {
            const lista = (porGrupo.get(g.clave) || []).slice(0, g.clave === 'terminadas' ? 15 : undefined);
            if (!lista.length) return null;
            return (
              <section key={g.clave}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="font-display text-base font-bold text-content">{g.titulo}</h2>
                  <span className="text-sm text-content-muted">{lista.length}</span>
                  <span className="hidden text-xs text-content-muted sm:inline">· {g.ayuda}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {lista.map(o => <TarjetaOT key={o.id} o={o} fecha={fechaDe(o)} hora={horaDe(o)} hoy={hoy} />)}
                </div>
              </section>
            );
          })}
          {(porGrupo.get('terminadas') || []).length > 0 && (
            <button className="btn btn-ghost btn-sm self-start" onClick={() => setVerCerradas(v => !v)}>
              {verCerradas ? 'Ocultar las cerradas' : `Ver las cerradas (${(porGrupo.get('terminadas') || []).length})`}</button>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaOT({ o, fecha, hora, hoy }: { o: OrdenTrabajo; fecha: string | null; hora: string; hoy: string }) {
  const atrasada = !!fecha && fecha < hoy && !['ejecutada', 'cerrada'].includes(o.estado);
  const esHoy = fecha === hoy;
  return (
    <div className="rounded-2xl border border-line bg-surface" style={{ borderLeft: `4px solid ${atrasada ? 'var(--danger)' : esHoy ? 'var(--y-brand)' : 'rgb(var(--line))'}` }}>
      <Link href={`/ordenes/${o.id}`} className="flex items-start gap-3 p-4" style={{ textDecoration: 'none' }}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-content-muted">{folioOT(o.folio)}</span>
            <ChipEstadoOT estado={o.estado} />
            {o.prioridad === 'Urgente' || o.prioridad === 'Alta' ? <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{o.prioridad}</span> : null}
            {atrasada && <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Atrasada</span>}
            {esHoy && <span className="badge" style={{ background: 'var(--y-soft)', color: 'rgb(var(--content))' }}>Hoy</span>}
          </div>
          <p className="mt-1 font-display text-[15px] font-bold leading-snug text-content">{o.titulo}</p>
          <p className="mt-0.5 text-sm text-content-muted">{o.clientes?.nombre_cliente || 'Sin cliente'}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-content">
            {fecha && <span className="flex items-center gap-1.5"><CalendarClock size={14} className="text-content-muted" />{fecha === hoy ? 'Hoy' : formatDate(fecha)}{hora ? ` · ${hora}` : ''}</span>}
            {o.direccion && <span className="flex min-w-0 items-center gap-1.5"><MapPin size={14} className="shrink-0 text-content-muted" /><span className="truncate">{o.direccion}</span></span>}
          </div>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-content-muted" />
      </Link>
      {(o.direccion || o.clientes?.telefono) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2">
          {o.clientes?.telefono && <a className="btn btn-ghost btn-xs" href={`tel:${o.clientes.telefono}`}><Phone size={12} /> Llamar</a>}
          <LinksMapa direccion={o.direccion} compacto />
        </div>
      )}
    </div>
  );
}
