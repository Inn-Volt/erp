'use client';

/**
 * Estado de la IA: qué proveedores están configurados en el servidor, en qué
 * orden se usan y un botón para probar cada uno. Nunca muestra las keys.
 */

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { fetchConSesion } from '@/lib/fetchConSesion';

type P = 'groq' | 'gemini' | 'anthropic';
interface Estado { orden: P[]; configurados: Record<P, boolean>; modelos: Record<P, string>; }

const INFO: Record<P, { nombre: string; costo: string; env: string; link: string; linkTxt: string }> = {
  groq:      { nombre: 'Groq',   costo: 'Gratis · ~1.000 consultas/día · sin tarjeta', env: 'GROQ_API_KEY',      link: 'https://console.groq.com/keys',        linkTxt: 'console.groq.com/keys' },
  gemini:    { nombre: 'Gemini', costo: 'Gratis · ~500 consultas/día por modelo',      env: 'GEMINI_API_KEY',    link: 'https://aistudio.google.com/apikey',   linkTxt: 'aistudio.google.com/apikey' },
  anthropic: { nombre: 'Claude', costo: 'Pago por uso · ≈ US$0,02 por cotización',     env: 'ANTHROPIC_API_KEY', link: 'https://console.anthropic.com',        linkTxt: 'console.anthropic.com' },
};

export default function IAEstadoCard() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const [probando, setProbando] = useState<P | null>(null);
  const [resultado, setResultado] = useState<Partial<Record<P, { ok: boolean; ms: number; detalle: string }>>>({});

  const cargar = useCallback(async () => {
    try {
      const res = await fetchConSesion('/api/ia-estado');
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'No se pudo consultar el estado'); return; }
      setEstado(data);
    } catch { setError('Error de conexión'); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const probar = async (p: P) => {
    setProbando(p);
    try {
      const res = await fetchConSesion('/api/ia-estado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proveedor: p }),
      });
      const data = await res.json();
      setResultado(r => ({ ...r, [p]: data }));
    } catch {
      setResultado(r => ({ ...r, [p]: { ok: false, ms: 0, detalle: 'Error de conexión' } }));
    } finally { setProbando(null); }
  };

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderTop: '2px solid var(--y-brand)', padding: '1.5rem', gridColumn: '1 / -1' }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--y)', marginBottom: '0.5rem' }}>
        <Sparkles size={13} /> Inteligencia artificial
      </p>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
        La app prueba los proveedores en orden y salta al siguiente si uno se agota. Con Groq + Gemini tienes ~1.500 consultas gratis al día.
        Las keys se configuran en <b>Netlify → Site configuration → Environment variables</b> (y en <code>.env.local</code> para desarrollo).
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</p>}
      {!estado && !error && <Loader2 size={18} className="iv-spin" style={{ color: 'var(--y)' }} />}
      {estado && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
          {(['groq', 'gemini', 'anthropic'] as P[]).map(p => {
            const on = estado.configurados[p];
            const pos = estado.orden.indexOf(p);
            const r = resultado[p];
            return (
              <div key={p} style={{ background: 'var(--bg3)', border: `1px solid ${on ? 'var(--border)' : 'var(--border2)'}`, borderRadius: 'var(--r)', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {on ? <CheckCircle2 size={14} color="var(--success)" /> : <Circle size={14} color="var(--faint)" />}
                    {INFO[p].nombre}
                  </span>
                  {on && <span style={{ fontSize: '0.66rem', color: 'var(--y)', fontWeight: 700 }}>{pos + 1}º en usarse</span>}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{INFO[p].costo}</span>
                {on ? (
                  <>
                    <span style={{ fontSize: '0.68rem', color: 'var(--faint)', fontFamily: 'monospace' }}>{estado.modelos[p]}</span>
                    <button onClick={() => probar(p)} disabled={probando !== null} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                      {probando === p ? <Loader2 size={12} className="iv-spin" /> : <Sparkles size={12} />} Probar
                    </button>
                    {r && (
                      <span style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 5, color: r.ok ? 'var(--success)' : 'var(--danger)' }}>
                        {r.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {r.ok ? `Funciona (${(r.ms / 1000).toFixed(1)} s)` : r.detalle}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                    No configurado. Crea la key en{' '}
                    <a href={INFO[p].link} target="_blank" rel="noreferrer" style={{ color: 'var(--y)' }}>{INFO[p].linkTxt}</a>{' '}
                    y agrégala como <code style={{ fontSize: '0.68rem' }}>{INFO[p].env}</code>.
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
