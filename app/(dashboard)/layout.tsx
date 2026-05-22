'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, LayoutDashboard, FileText, Users, LogOut, Menu, X,
  Settings, Bell, History,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToastProvider } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
      <div style={{ width: 28, height: 28, background: 'var(--y)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Zap size={15} color="#000" fill="#000" />
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.02em', lineHeight: 1, color: '#fff', textTransform: 'uppercase' }}>
        Inn<span style={{ color: '#ffc600' }}>Volt</span>
      </span>
    </div>
  );
}

const menuItems = [
  { name: 'Dashboard',   icon: LayoutDashboard, path: '/dashboard',          num: '01' },
  { name: 'Clientes',    icon: Users,           path: '/clientes',           num: '02' },
  { name: 'Cotizador',   icon: FileText,        path: '/cotizador',          num: '03' },
  { name: 'Historial',   icon: History,         path: '/cotizador/historial',num: '04' },
  { name: 'Config',      icon: Settings,        path: '/configuracion',      num: '05' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { logout, userName, loading } = useAuth(true);
  const { toasts, removeToast } = useToastProvider();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (loading) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--border2)', borderTop: '2px solid var(--y)', borderRadius: '50%' }} className="iv-spin" />
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontWeight: 700,
    fontSize: '0.6rem', letterSpacing: '0.25em', textTransform: 'uppercase',
  };

  const NavItem = ({ name, icon: Icon, path, num }: typeof menuItems[0]) => {
    const active = pathname === path || (path !== '/cotizador' && pathname.startsWith(path + '/')) || (path === '/cotizador' && pathname === '/cotizador');
    return (
      <button
        onClick={() => router.push(path)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.7rem 0.875rem', marginBottom: 2,
          background: active ? 'var(--y)' : 'transparent',
          border: 'none', cursor: 'pointer',
          borderLeft: `3px solid ${active ? 'transparent' : 'transparent'}`,
          transition: 'all 0.15s', WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,198,0,0.06)'; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ ...labelStyle, fontSize: '0.55rem', color: active ? 'rgba(0,0,0,0.4)' : 'var(--muted)', width: 20 }}>{num}</span>
          <Icon size={13} color={active ? '#000' : 'rgba(255,255,255,0.3)'} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: active ? '#000' : 'rgba(255,255,255,0.4)' }}>{name}</span>
        </div>
      </button>
    );
  };

  const Sidebar = ({ big = false }: { big?: boolean }) => (
    <>
      <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: big ? '1.5rem 1.5rem 1.25rem' : '1.25rem 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', textAlign: 'left', width: '100%' }}>
        <Logo />
        <p className="label-muted" style={{ fontSize: '0.52rem', letterSpacing: '0.4em', marginTop: '0.2rem' }}>Sistema ERP</p>
      </button>
      <div className="iv-divider" style={{ margin: '0 1rem 0.5rem' }} />
      <p style={{ padding: '0.3rem 1.25rem', fontSize: '0.52rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.4em', textTransform: 'uppercase' }}>— Módulos</p>
      <nav style={{ flex: 1, padding: '0.25rem 0.5rem', overflowY: 'auto' }}>
        {menuItems.map(item => <NavItem key={item.path} {...item} />)}
      </nav>
      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border2)' }}>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 30, height: 30, background: 'var(--y)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.7rem', color: '#000' }}>
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', display: 'block' }} className="iv-pulse" />
              <span style={{ ...labelStyle, fontSize: '0.52rem', color: '#4ade80' }}>En línea</span>
            </div>
          </div>
        </div>
        <button onClick={logout} className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
          <LogOut size={12} /> Cerrar Sesión
        </button>
      </div>
    </>
  );

  return (
    <div style={{ height: '100svh', display: 'flex', overflow: 'hidden', background: '#000' }}>

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="sidebar-desktop" style={{ width: 'var(--sidebar-w)', flexShrink: 0, background: '#000', borderRight: '1px solid var(--border2)', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div className="iv-grid-bg" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6 }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Sidebar />
        </div>
      </aside>

      {/* ── MOBILE DRAWER ── */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)' }} />
          <aside style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260, background: '#000', borderRight: '1px solid var(--border2)', display: 'flex', flexDirection: 'column' }}>
            <div className="iv-grid-bg" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5 }} />
            <button onClick={() => setMobileOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', zIndex: 2 }}>
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
        {/* Topbar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 40, height: 'var(--topbar-h)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1.75rem',
          background: scrolled ? 'rgba(0,0,0,0.96)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid var(--border2)' : '1px solid transparent',
          transition: 'all 0.3s',
        }}>
          {/* Mobile hamburger */}
          <div className="mobile-ham" style={{ alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setMobileOpen(true)} style={{ background: 'var(--y)', border: 'none', cursor: 'pointer', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Menu size={16} color="#000" />
            </button>
            <Logo />
          </div>

          {/* Desktop: breadcrumb hint */}
          <div className="sidebar-desktop" style={{ alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.75rem' }}>InnVolt ERP</span>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} className="iv-pulse" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>{userName}</span>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: 'var(--page-px)', paddingBottom: 'var(--page-pb)' }}>
          {children}
        </main>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
