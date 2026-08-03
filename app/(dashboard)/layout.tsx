'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, FileText, Users, LogOut, Menu, X,
  Settings, History, ClipboardList, Library,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToastProvider } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';
import ThemeToggle from '@/components/ThemeToggle';
import { LogoImg } from '@/components/Logo';

/** El logo mide 500×206 (≈2.43:1). En el sidebar de 220 px quedan
 *  180 px útiles, así que 64 px de alto ≈ 155 px de ancho: entra holgado. */
function Logo({ height = 64 }: { height?: number }) {
  return <LogoImg height={height} />;
}

/** Isotipo compacto (rayo sobre remate amarillo) para el sidebar colapsado. */
function Mark() {
  return (
    <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--spark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="#151824" aria-hidden="true">
        <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
      </svg>
    </span>
  );
}

const menuItems = [
  { name: 'Dashboard',      icon: LayoutDashboard, path: '/dashboard',                num: '01' },
  { name: 'Clientes',       icon: Users,           path: '/clientes',                 num: '02' },
  { name: 'Cotizador',      icon: FileText,        path: '/cotizador',                num: '03' },
  { name: 'Historial',      icon: History,         path: '/cotizador/historial',      num: '04' },
  { name: 'Biblioteca',     icon: Library,         path: '/biblioteca',               num: '05' },
  { name: 'Levantamiento',  icon: ClipboardList,   path: '/levantamiento',            num: '06' },
  { name: 'Lev. Historial', icon: History,         path: '/levantamiento/historial',  num: '07' },
  { name: 'Config',         icon: Settings,        path: '/configuracion',            num: '08' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { logout, userName, loading } = useAuth(true);
  const { toasts, removeToast } = useToastProvider();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('innvolt-sidebar') === 'collapsed'); } catch {}
  }, []);
  const toggleCollapsed = () => setCollapsed(v => {
    const next = !v;
    try { localStorage.setItem('innvolt-sidebar', next ? 'collapsed' : 'expanded'); } catch {}
    return next;
  });

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (loading) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--border2)', borderTop: '2px solid var(--y-brand)', borderRadius: '50%' }} className="iv-spin" />
      </div>
    );
  }

  const NavItem = ({ name, icon: Icon, path, compact }: typeof menuItems[0] & { compact?: boolean }) => {
    const exactPaths = ['/cotizador', '/levantamiento'];
    const active = pathname === path ||
      (!exactPaths.includes(path) && pathname.startsWith(path + '/')) ||
      (exactPaths.includes(path) && pathname === path);
    return (
      <button
        onClick={() => router.push(path)}
        title={compact ? name : undefined}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: compact ? 0 : '0.7rem', justifyContent: compact ? 'center' : 'flex-start',
          padding: compact ? '0.6rem 0' : '0.5rem 0.65rem', marginBottom: 1, borderRadius: 8,
          background: active ? 'var(--y-soft)' : 'transparent',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'all 0.13s', WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
      >
        {active && <span style={{ position: 'absolute', left: compact ? 0 : -8, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--spark)' }} />}
        <Icon size={18} color={active ? 'var(--y)' : 'var(--faint)'} style={{ opacity: 0.9, flexShrink: 0 }} />
        {!compact && <span style={{ fontSize: '0.86rem', fontWeight: active ? 500 : 450, color: active ? 'var(--y)' : 'var(--muted)' }}>{name}</span>}
      </button>
    );
  };

  const Sidebar = ({ big = false, compact = false }: { big?: boolean; compact?: boolean }) => (
    <>
      <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: compact ? '1.1rem 0' : '1.25rem 1.1rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        {compact ? <Mark /> : <Logo height={big ? 46 : 40} />}
      </button>
      {!compact && <p style={{ padding: '0.5rem 1.1rem 0.4rem', fontSize: '0.68rem', color: 'var(--faint)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Principal</p>}
      <nav style={{ flex: 1, padding: compact ? '0.4rem 0.5rem' : '0 0.6rem', overflowY: 'auto' }}>
        {menuItems.map(item => <NavItem key={item.path} {...item} compact={compact} />)}
      </nav>
      <div style={{ padding: compact ? '0.5rem' : '0.75rem', borderTop: '1px solid var(--border2)' }}>
        {!compact && (
          <div style={{ padding: '0.4rem 0.5rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem', borderRadius: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--y-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 600, fontSize: '0.72rem', color: 'var(--on-accent)' }}>
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 500, fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--faint)', margin: 0 }}>Administrador</p>
            </div>
          </div>
        )}
        <button onClick={logout} title={compact ? 'Cerrar sesión' : undefined} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
          <LogOut size={14} /> {!compact && 'Cerrar sesión'}
        </button>
      </div>
    </>
  );

  return (
    <div style={{ height: '100svh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="sidebar-desktop" style={{ width: collapsed ? 64 : 'var(--sidebar-w)', flexShrink: 0, background: 'var(--bg2)', borderRight: '1px solid var(--border2)', flexDirection: 'column', position: 'relative', overflow: 'hidden', transition: 'width 0.18s ease', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Sidebar compact={collapsed} />
        </div>
      </aside>

      {/* ── MOBILE DRAWER ── */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)' }} />
          <aside style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260, background: 'var(--bg2)', borderRight: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <button onClick={() => setMobileOpen(false)} style={{ position: 'absolute', top: 'calc(1rem + env(safe-area-inset-top, 0px))', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', zIndex: 2 }}>
              <X size={18} />
            </button>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Sidebar big />
            </div>
          </aside>
        </div>
      )}

      {/* ── MAIN AREA ── */}
      <div ref={mainRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }} onScroll={e => setScrolled((e.currentTarget as HTMLElement).scrollTop > 10)}>
        {/* Topbar — deja hueco para el notch/Dynamic Island en la PWA de iPhone */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
          height: 'calc(var(--topbar-h) + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingLeft: 'max(1.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1.75rem, env(safe-area-inset-right, 0px))',
          background: scrolled ? 'var(--bg)' : 'var(--bg)',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid var(--border2)' : '1px solid transparent',
          transition: 'all 0.3s',
        }}>
          {/* Mobile hamburger */}
          <div className="mobile-ham" style={{ alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setMobileOpen(true)} style={{ background: 'var(--y-brand)', border: 'none', cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Menu size={16} color="var(--on-accent)" />
            </button>
            {/* La barra superior mide 56 px: el logo va reducido */}
            <Logo height={34} />
          </div>

          {/* Desktop: botón colapsar sidebar */}
          <div className="sidebar-desktop" style={{ alignItems: 'center', gap: '0.6rem' }}>
            <button onClick={toggleCollapsed} title={collapsed ? 'Expandir menú' : 'Colapsar menú'} aria-label="Colapsar menú"
              style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <span style={{ color: 'var(--faint)', fontSize: '0.78rem' }}>InnVolt ERP</span>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} className="iv-pulse" />
            <span className="hide-mobile" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>{userName}</span>
            <ThemeToggle compact />
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: 'var(--page-px)', paddingBottom: 'calc(var(--page-pb) + env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </main>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
