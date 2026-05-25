'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Users, TrendingUp, Clock, Plus, ChevronRight, Zap } from 'lucide-react';
import { cotizacionesService } from '@/services/cotizaciones';
import { clientesService } from '@/services/clientes';
import type { KpiData, Cotizacion } from '@/types';
import { ESTADO_COLORS, INNVOLT_INFO } from '@/types';
import { formatCLP, formatFolio, formatDate } from '@/utils';

function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <div className="kpi-card" style={{ borderTopColor: accent || 'var(--y)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <p className="label-muted" style={{ letterSpacing: '0.3em' }}>{label}</p>
        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent ? `${accent}14` : 'rgba(255,198,0,0.08)' }}>
          <Icon size={15} color={accent || 'var(--y)'} />
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      cotizacionesService.getKpis(),
      cotizacionesService.getRecientes(6),
      clientesService.getAll(),
    ]).then(([k, r, c]) => {
      setKpis(k);
      setRecientes(r);
      setTotalClientes(c.length);
      setLoading(false);
    });
  }, []);

  return (
    <div className="anim-in">
      {/* Header */}
      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Resumen del sistema</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', lineHeight: 0.9, color: '#fff' }}>
            DASH<span style={{ color: 'var(--y)' }}>BOARD</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={() => router.push('/cotizador')} className="btn btn-primary">
            <Plus size={14} /> Nueva Cotización
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px', marginBottom: '2px' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={110} />)
        ) : (
          <>
            <KpiCard label="Total cotizaciones" value={String(kpis?.total_cotizaciones || 0)} icon={FileText} />
            <KpiCard label="Venta acumulada" value={formatCLP(kpis?.venta_acumulada || 0)} sub="Excl. rechazadas" icon={TrendingUp} accent="#4ade80" />
            <KpiCard label="Pipeline pendiente" value={formatCLP(kpis?.pendiente_pipeline || 0)} sub="En espera de respuesta" icon={Clock} accent="#fbbf24" />
            <KpiCard label="Trabajos aceptados" value={String(kpis?.aceptadas || 0)} sub="Aceptado + Realizado + Entregado" icon={Zap} accent="#60a5fa" />
          </>
        )}
      </div>

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
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,198,0,0.04)')}
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
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: '#fff', minWidth: 90, textAlign: 'right' }}>
                      {formatCLP(c.total)}
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
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>{k}</span>
                  <span style={{ fontSize: '0.82rem', color: '#fff' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="panel" style={{ padding: '1.25rem' }}>
            <p className="section-label" style={{ marginBottom: '1rem' }}><Plus size={12} /> Acciones rápidas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {[
                { label: 'Nueva cotización',    path: '/cotizador',                icon: FileText      },
                { label: 'Nuevo levantamiento', path: '/levantamiento',            icon: FileText      },
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
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#4ade80' }}>
                  {kpis && kpis.total_cotizaciones > 0
                    ? `${Math.round((kpis.aceptadas / kpis.total_cotizaciones) * 100)}%`
                    : '—'}
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
  fontSize: '0.58rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.2rem 0.5rem',
  whiteSpace: 'nowrap',
};
