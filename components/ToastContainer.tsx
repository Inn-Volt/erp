'use client';

import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { ToastMessage } from '@/types';

const ICONS = {
  success: <CheckCircle size={16} color="#4ade80" />,
  error:   <XCircle size={16} color="#f87171" />,
  warning: <AlertTriangle size={16} color="#ffc600" />,
  info:    <Info size={16} color="#60a5fa" />,
};

const COLORS = {
  success: 'rgba(74,222,128,0.12)',
  error:   'rgba(248,113,113,0.12)',
  warning: 'rgba(255,198,0,0.12)',
  info:    'rgba(96,165,250,0.12)',
};

interface Props {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export default function ToastContainer({ toasts, onRemove }: Props) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast" style={{ borderColor: COLORS[t.type] }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>{ICONS[t.type]}</span>
          <span style={{ flex: 1, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
