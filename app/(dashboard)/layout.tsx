'use client';

import { useAuth } from '@/hooks/useAuth';
import { useToastProvider } from '@/hooks/useToast';
import { PermisosProvider } from '@/hooks/usePermisos';
import ToastContainer from '@/components/ToastContainer';
import AppShell from '@/components/AppShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, userName, loading } = useAuth(true);
  const { toasts, removeToast } = useToastProvider();

  if (loading) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--border2)', borderTop: '2px solid var(--y-brand)', borderRadius: '50%' }} className="iv-spin" />
      </div>
    );
  }

  return (
    <PermisosProvider userId={user?.id ?? null}>
      <AppShell userName={userName} userId={user?.id ?? null} onLogout={logout}>{children}</AppShell>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </PermisosProvider>
  );
}
