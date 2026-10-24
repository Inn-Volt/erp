'use client';

/**
 * Configuración → Sistema (fase 15), para quien administra:
 * - Errores recientes: lo que se cayó en el navegador de alguien (quién, dónde, cuándo).
 * - Respaldo: todo lo importante en un Excel (una hoja por tabla), para guardarlo fuera.
 */

import { useCallback, useEffect, useState } from 'react';
import { Bug, DatabaseBackup, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { descargarExcel } from '@/lib/excel';
import { useFase } from '@/lib/fases';
import { ConfigDTE } from '@/components/facturacion/FacturaElectronica';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal } from '@/utils';

interface ErrorApp { id: string; created_at: string; usuario_id: string | null; url: string | null; mensaje: string; detalle: string | null; navegador: string | null }

const TABLAS: [string, string][] = [
  ['clientes', 'Clientes'], ['solicitudes', 'Solicitudes'], ['agendamientos', 'Agenda'], ['cotizaciones', 'Cotizaciones'],
  ['por_facturar', 'Cobros'], ['compras', 'Compras'], ['gastos', 'Rendiciones'], ['horas_trabajo', 'Horas'],
  ['proyectos', 'Proyectos'], ['ordenes_trabajo', 'OT'], ['tareas', 'Tareas'], ['catalogo_items', 'Catálogo'],
];

const fecha = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function leerTodo(tabla: string): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').range(desde, desde + 999);
    if (error) throw error;
    filas.push(...((data || []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  // Excel no acepta más de 32.767 caracteres por celda: lo largo (JSON de ítems) se corta.
  return filas.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => {
    const t = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    return [k, typeof t === 'string' && t.length > 32000 ? `${t.slice(0, 32000)}…` : t];
  })));
}

export default function AdminSistema() {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const fase15 = useFase(15);
  const [errores, setErrores] = useState<ErrorApp[] | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [respaldando, setRespaldando] = useState<string | null>(null);
  const admin = puede('configuracion.gestionar');

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('errores_app').select('*').order('created_at', { ascending: false }).limit(40);
    if (error) { setErrores([]); return; }
    setErrores((data || []) as ErrorApp[]);
  }, []);
  useEffect(() => {
    if (!admin || !fase15) return;
    cargar();
    supabase.from('profiles').select('id, nombre, email').then(({ data }) =>
      setNombres(Object.fromEntries(((data || []) as { id: string; nombre: string | null; email: string | null }[]).map(u => [u.id, u.nombre || u.email || 'Usuario']))));
  }, [admin, fase15, cargar]);

  const borrar = async () => {
    if (!confirm('¿Borrar todos los errores anotados?')) return;
    const { error } = await supabase.from('errores_app').delete().not('id', 'is', null);
    if (error) toastError(error.message); else { success('Errores borrados'); cargar(); }
  };

  const respaldar = async () => {
    const hojas: { nombre: string; filas: Record<string, unknown>[] }[] = [];
    const saltadas: string[] = [];
    for (const [tabla, nombre] of TABLAS) {
      setRespaldando(nombre);
      try { hojas.push({ nombre, filas: await leerTodo(tabla) }); }
      catch { saltadas.push(nombre); }
    }
    setRespaldando('Armando el Excel');
    try {
      await descargarExcel(hojas, `Respaldo_InnVolt_${fechaLocal()}.xlsx`);
      success(saltadas.length ? `Respaldo descargado (sin: ${saltadas.join(', ')})` : 'Respaldo descargado');
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo armar el respaldo'); }
    finally { setRespaldando(null); }
  };

  if (!admin) return null;
  const caja: React.CSSProperties = { background: 'var(--bg2)', border: '1px solid var(--border2)', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 };
  const titulo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--y)', margin: 0 };

  return <>
    {fase15 && <ConfigDTE />}
    <div style={caja}>
      <p style={titulo}><DatabaseBackup size={13} /> Respaldo</p>
      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
        Descarga clientes, cotizaciones, cobros, compras, agenda y más en un Excel (una hoja por cada uno). Guárdalo fuera de la app una vez al mes.</p>
      <div><button className="btn btn-ghost btn-sm" onClick={respaldar} disabled={!!respaldando}>
        {respaldando ? <><Loader2 size={13} className="iv-spin" /> {respaldando}…</> : <><DatabaseBackup size={13} /> Descargar respaldo</>}</button></div>
    </div>

    {fase15 && (
      <div style={{ ...caja, gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ ...titulo, flex: 1 }}><Bug size={13} /> Errores recientes{errores?.length ? ` (${errores.length})` : ''}</p>
          <button className="btn btn-ghost btn-xs" onClick={cargar} aria-label="Actualizar"><RefreshCw size={12} /></button>
          {!!errores?.length && <button className="btn btn-ghost btn-xs" onClick={borrar}><Trash2 size={12} /> Borrar</button>}
        </div>
        {errores === null ? <div className="skeleton" style={{ height: 50 }} />
          : errores.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--success)' }}>Sin errores anotados. Si a alguien se le cae una pantalla, aparece aquí (se guardan 60 días).</p>
          : errores.map(e => (
            <button key={e.id} type="button" onClick={() => setAbierto(abierto === e.id ? null : e.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--border2)', padding: '0.45rem 0', cursor: 'pointer', color: 'var(--text)' }}>
              <span style={{ display: 'block', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: abierto === e.id ? 'normal' : 'nowrap' }}>{e.mensaje}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{fecha(e.created_at)} · {e.usuario_id ? nombres[e.usuario_id] || 'Usuario' : 'Sin sesión'} · {e.url || '—'}</span>
              {abierto === e.id && (e.detalle || e.navegador) && (
                <pre style={{ margin: '6px 0 0', padding: '0.5rem', background: 'var(--bg3)', borderRadius: 6, fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' }}>
                  {[e.detalle, e.navegador].filter(Boolean).join('\n\n')}</pre>
              )}
            </button>
          ))}
      </div>
    )}
  </>;
}
