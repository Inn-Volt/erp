'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Users, TrendingUp, Clock, Plus, ChevronRight, Zap, Inbox, Calendar, Target, BellRing, TrendingDown, Send, Eye } from 'lucide-react';
import { cotizacionesService, necesitaSeguimiento, diasSinMovimiento } from '@/services/cotizaciones';
import EnviarCotizacionModal from '@/components/EnviarCotizacionModal';
import { clientesService } from '@/services/clientes';
import { solicitudesService } from '@/services/solicitudes';
import { agendaService } from '@/services/agenda';
import type { KpiData, Cotizacion, Moneda } from '@/types';
import { ESTADO_COLORS, INNVOLT_INFO } from '@/types';
import { formatCLP, formatMoneda, formatFolio, formatDate, fechaLocal } from '@/utils';
import PageHeader from '@/components/PageHeader';

/** Embudo comercial: cuántos casos hay en cada etapa del flujo. */
interface Embudo { solicitudes: number | null; citas: number | null; pendientes: number; ventas: number; }

function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  // El acento viaja como variable CSS: así la franja superior y el fondo del
  // icono se derivan del mismo color sin concatenar hex (que rompía con tokens).
  const estilo = { '--kpi-accent': accent || 'var(--y-brand)' } as React.CSSProperties;
  return (
    <div className="kpi-card" style={estilo}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <p className="label-muted" style={{ letterSpacing: '0.3em' }}>{label}</p>
        <div className="kpi-icon">
          <Icon size={15} color="var(--kpi-accent)" />
        </div>
      </div>
      <p className="kpi-value">{value}</p>
      {sub && <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{sub}</p>}
    </div>
  );
}

function Skeleton({ h = 48 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h, width: '100%' }} />;
}

export default function DashboardPage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [recientes, setRecientes] = useState<Cotizacion[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [embudo, setEmbudo] = useState<Embudo | null>(null);
  const [porSeguir, setPorSeguir] = useState<Cotizacion[]>([]);
  const [motivos, setMotivos] = useState<Record<string, number>>({});
  const [enviar, setEnviar] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);

  // Lista "Por seguir" y motivos de pérdida (se recargan tras un seguimiento).
  const cargarSeguimiento = useCallback(() => {
    cotizacionesService.getPendientes()
      .then(ps => setPorSeguir(ps.filter(necesitaSeguimiento).sort((a, b) => diasSinMovimiento(b) - diasSinMovimiento(a))))
      .catch(() => setPorSeguir([]));
    cotizacionesService.getMotivosPerdida().then(setMotivos).catch(() => setMotivos({}));
  }, []);
  useEffect(() => { cargarSeguimiento(); }, [cargarSeguimiento]);

  useEffect(() => {
    // Solicitudes y agenda son módulos nuevos: si su tabla aún no existe, el
    // embudo muestra "—" en esa etapa sin romper el dashboard.
    const solicitudesAbiertas = solicitudesService.getAll()
      .then(ss => ss.filter(x => !['CERRADA', 'CANCELADA', 'NO_VIABLE', 'COTIZACION_GENERADA'].includes(x.estado)).length)
      .catch(() => null);
    const citasProximas = agendaService.getAll()
      .then(citas => { const hoy = fechaLocal(); return citas.filter(a => a.fecha >= hoy && !['Cancelada', 'Realizada'].includes(a.estado)).length; })
      .catch(() => null);
    Promise.all([
      cotizacionesService.getKpis(),
      cotizacionesService.getRecientes(6),
      clientesService.getAll(),
      solicitudesAbiertas,
      citasProximas,
    ]).then(([k, r, c, sol, cit]) => {
      setKpis(k);
      setRecientes(r);
      setTotalClientes(c.length);
      setEmbudo({ solicitudes: sol, citas: cit, pendientes: k.pendientes || 0, ventas: k.aceptadas || 0 });
    }).catch(err => {
      // Sin este catch, un error de red dejaba el dashboard cargando para siempre
      console.error('Error al cargar el dashboard:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  return (
    <div className="anim-in">
      {enviar && (
        <EnviarCotizacionModal cot={enviar} empresaNombre={INNVOLT_INFO.nombre} onClose={() => setEnviar(null)} onCambio={cargarSeguimiento} />
      )}
      {/* Header */}
      <PageHeader
        eyebrow="Resumen del sistema"
        title="Panel comercial"
        subtitle="Del requerimiento a la venta, de un vistazo"
        actions={<>
          <button onClick={() => router.push('/cotizador')} className="btn btn-primary">
            <Plus size={14} /> Nueva Cotización
          </button>
        </>}
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px', marginBottom: '2px' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={110} />)
        ) : (
          <>
            <KpiCard label="Ventas del mes" value={formatCLP(kpis?.venta_mes || 0)} sub={`Acumulado: ${formatCLP(kpis?.venta_acumulada || 0)}`} icon={TrendingUp} accent="var(--success)" />
            <KpiCard label="Pipeline pendiente" value={formatCLP(kpis?.pendiente_pipeline || 0)} sub={`${kpis?.pendientes || 0} cotizaciones esperando respuesta`} icon={Clock} accent="var(--orange)" />
            <KpiCard label="Tasa de cierre" value={kpis?.tasa_cierre != null ? `${kpis.tasa_cierre}%` : '—'} sub={`${kpis?.aceptadas || 0} ganadas · ${kpis?.rechazadas || 0} perdidas`} icon={Target} accent="var(--info)" />
            <KpiCard label="Ticket promedio" value={formatCLP(kpis?.ticket_promedio || 0)} sub={`${kpis?.total_cotizaciones || 0} cotizaciones emitidas`} icon={Zap} />
          </>
        )}
      </div>

      {/* Embudo comercial: del requerimiento a la venta */}
      {!loading && embudo && (
        <div className="panel-y" style={{ padding: '1rem 1.25rem', marginBottom: '2px' }}>
          <p className="section-label" style={{ marginBottom: '0.75rem' }}><Target size={12} /> Flujo comercial</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px' }}>
            {[
              { label: 'Solicitudes abiertas',    v: embudo.solicitudes, path: '/solicitudes',         icon: Inbox,      color: 'var(--info)' },
              { label: 'Visitas agendadas',       v: embudo.citas,       path: '/agenda',              icon: Calendar,   color: 'var(--y)' },
              { label: 'Cotizaciones pendientes', v: embudo.pendientes,  path: '/cotizador/historial', icon: Clock,      color: 'var(--orange)' },
              { label: 'Ventas concretadas',      v: embudo.ventas,      path: '/cotizador/historial', icon: TrendingUp, color: 'var(--success)' },
            ].map((e, i) => (
              <button key={e.label} onClick={() => router.push(e.path)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.8rem', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', cursor: 'pointer', textAlign: 'left' }}>
                <e.icon size={16} color={e.color} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', color: 'var(--text)', lineHeight: 1 }}>{e.v ?? '—'}</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>{i + 1}. {e.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seguimiento + motivos de pérdida */}
      {!loading && (porSeguir.length > 0 || Object.keys(motivos).length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2px', marginBottom: '2px' }}>
          {porSeguir.length > 0 && (
            <div className="panel-y" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <p className="section-label" style={{ margin: 0, color: 'var(--orange)' }}><BellRing size={12} /> Por seguir hoy ({porSeguir.length})</p>
                <button onClick={() => router.push('/cotizador/historial')} className="btn btn-ghost btn-xs">Ver todas <ChevronRight size={11} /></button>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.6rem' }}>Cotizaciones pendientes sin respuesta hace 3 días o más. Un seguimiento a tiempo recupera muchas ventas.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {porSeguir.slice(0, 5).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.7rem', background: 'var(--bg3)', borderRadius: 'var(--r-sm)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatFolio(c.folio)} · {c.clientes?.nombre_cliente || '—'}
                      </p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: 'var(--orange)' }}>{diasSinMovimiento(c)} días</span>
                        <span>{formatMoneda(c.total, (c.moneda as Moneda) || 'CLP')}</span>
                        {c.vista_at && <span style={{ color: 'var(--info)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Eye size={10} /> la abrió</span>}
                      </p>
                    </div>
                    <button onClick={() => setEnviar(c)} className="btn btn-ghost btn-xs" style={{ color: 'var(--orange)' }}><Send size={11} /> Seguir</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(motivos).length > 0 && (() => {
            const total = Object.values(motivos).reduce((a, b) => a + b, 0);
            const orden = Object.entries(motivos).sort((a, b) => b[1] - a[1]);
            return (
              <div className="panel-y" style={{ padding: '1rem 1.25rem' }}>
                <p className="section-label" style={{ marginBottom: '0.75rem' }}><TrendingDown size={12} /> ¿Por qué perdemos ventas?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {orden.map(([m, n]) => (
                    <div key={m}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 3 }}>
                        <span style={{ color: 'var(--text)' }}>{m}</span>
                        <span style={{ color: 'var(--muted)' }}>{n} · {Math.round((n / total) * 100)}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: 'var(--danger)', opacity: 0.75 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Grid: recientes + info */}
      <div className="dashboard-main-grid">
        {/* Recientes */}
        <div className="panel-y" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <p className="section-label"><FileText size={12} /> Cotizaciones recientes</p>
            <button onClick={() => router.push('/cotizador/historial')} className="btn btn-ghost btn-xs">
              Ver todo <ChevronRight size={11} />
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={52} />)}
            </div>
          ) : recientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
              <FileText size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.875rem' }}>Sin cotizaciones aún</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {recientes.map(c => {
                const ec = ESTADO_COLORS[c.estado];
                return (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/cotizador?edit=${c.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem',
                      padding: '0.75rem', background: 'var(--bg3)',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--y-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg3)')}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.85rem', color: 'var(--y)', minWidth: 72 }}>
                      {formatFolio(c.folio)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.clientes?.nombre_cliente || '—'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(c.created_at)}</p>
                    </div>
                    <span style={{ color: ec.color, background: ec.bg, ...badgeStyle }}>{c.estado}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', minWidth: 90, textAlign: 'right' }}>
                      {formatMoneda(c.total, (c.moneda as Moneda) || 'CLP')}
                    </span>
                    <ChevronRight size={13} color="var(--muted)" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Empresa */}
          <div className="panel" style={{ padding: '1.25rem' }}>
            <p className="section-label" style={{ marginBottom: '1rem' }}><Zap size={12} /> Empresa</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                ['Razón social', INNVOLT_INFO.nombre],
                ['RUT', INNVOLT_INFO.rut],
                ['Giro', INNVOLT_INFO.giro],
                ['Contacto', INNVOLT_INFO.telefono],
                ['Email', INNVOLT_INFO.email],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border2)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>{k}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="panel" style={{ padding: '1.25rem' }}>
            <p className="section-label" style={{ marginBottom: '1rem' }}><Plus size={12} /> Acciones rápidas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {[
                { label: 'Nueva solicitud',     path: '/solicitudes',              icon: Inbox         },
                { label: 'Agendar visita',      path: '/agenda?nueva=1',           icon: Calendar      },
                { label: 'Nuevo levantamiento', path: '/levantamiento',            icon: FileText      },
                { label: 'Nueva cotización',    path: '/cotizador',                icon: FileText      },
                { label: 'Ver historial',        path: '/cotizador/historial',      icon: Clock         },
                { label: 'Agregar cliente',      path: '/clientes',                 icon: Users         },
              ].map(({ label, path, icon: Icon }) => (
                <button key={path} onClick={() => router.push(path)} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', width: '100%' }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          {!loading && (
            <div className="panel" style={{ padding: '1.25rem' }}>
              <p className="section-label" style={{ marginBottom: '1rem' }}><Users size={12} /> Estadísticas</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border2)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Clientes activos</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--y)' }}>{totalClientes}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Tasa de cierre</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--success)' }}>
                  {kpis?.tasa_cierre != null ? `${kpis.tasa_cierre}%` : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const badgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '0.76rem',
  padding: '0.2rem 0.5rem',
  whiteSpace: 'nowrap',
};
