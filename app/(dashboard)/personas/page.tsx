'use client';

/**
 * Mi empresa → Personas (TecApp): competencias y certificaciones de cada uno (con vencimiento),
 * el catálogo de competencias y el organigrama (jefe y área). Las certificaciones vencidas o
 * por vencer (30 días) se marcan; sirve para elegir quién va a cada OT.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, GitBranch, Plus, Trash2, Users, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FaltaSQL from '@/components/FaltaSQL';
import { faltaFase5, personasService, type Competencia, type UsuarioCompetencia } from '@/services/fase5';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatDate, sumarDias } from '@/utils';

type Perfil = { id: string; nombre: string | null; email: string | null; cargo: string | null; area: string | null; jefe_id: string | null; activo: boolean };

function Vence({ fecha }: { fecha: string | null }) {
  if (!fecha) return null;
  const hoy = fechaLocal();
  const color = fecha < hoy ? 'var(--danger)' : fecha <= sumarDias(hoy, 30) ? '#d97706' : 'var(--muted)';
  return <span style={{ fontSize: '0.7rem', color }}>{fecha < hoy ? 'venció' : 'vence'} {formatDate(fecha)}</span>;
}

function Arbol({ perfiles, jefe, nivel }: { perfiles: Perfil[]; jefe: string | null; nivel: number }) {
  const hijos = perfiles.filter(p => p.activo && (p.jefe_id || null) === jefe && (jefe !== null || !perfiles.some(x => x.id === p.jefe_id)));
  if (!hijos.length || nivel > 8) return null;
  return (
    <ul style={{ listStyle: 'none', margin: 0, paddingLeft: nivel ? 18 : 0, borderLeft: nivel ? '1px dashed var(--border2)' : 'none' }}>
      {hijos.map(p => (
        <li key={p.id} style={{ margin: '6px 0' }}>
          <span style={{ display: 'inline-block', background: 'var(--bg3)', borderRadius: 8, padding: '0.35rem 0.7rem', fontSize: '0.86rem', color: 'var(--text)' }}>
            <b>{p.nombre || p.email}</b>{p.cargo ? <span style={{ color: 'var(--muted)' }}> · {p.cargo}</span> : null}{p.area ? <span style={{ color: 'var(--y)' }}> · {p.area}</span> : null}
          </span>
          <Arbol perfiles={perfiles} jefe={p.id} nivel={nivel + 1} />
        </li>
      ))}
    </ul>
  );
}

export default function PersonasPage() {
  const { puede } = usePermisos();
  const { success, error: toastError } = useToast();
  const edita = puede('personas.gestionar');
  const [tab, setTab] = useState<'personas' | 'organigrama' | 'catalogo'>('personas');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [comps, setComps] = useState<Competencia[]>([]);
  const [asig, setAsig] = useState<UsuarioCompetencia[]>([]);
  const [falta, setFalta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<{ usuario: Perfil; uc: Partial<UsuarioCompetencia> } | null>(null);
  const [filtroComp, setFiltroComp] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [p, c, a] = await Promise.all([personasService.perfiles(), personasService.competencias(), personasService.deUsuarios()]);
      setPerfiles(p); setComps(c); setAsig(a);
    } catch (e) { if (faltaFase5(e)) setFalta(true); else toastError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const compDe = useMemo(() => new Map(comps.map(c => [c.id, c])), [comps]);
  const hoy = fechaLocal();
  const porVencer = asig.filter(a => a.vence && a.vence <= sumarDias(hoy, 30));
  const activos = perfiles.filter(p => p.activo).filter(p => !filtroComp || asig.some(a => a.usuario_id === p.id && a.competencia_id === filtroComp && (!a.vence || a.vence >= hoy)));

  const guardarAsig = async () => {
    if (!editando?.uc.competencia_id) { toastError('Elige la competencia'); return; }
    try {
      await personasService.asignar({ usuario_id: editando.usuario.id, competencia_id: editando.uc.competencia_id, nivel: editando.uc.nivel ?? null,
        obtenida: editando.uc.obtenida || null, vence: editando.uc.vence || null, nota: editando.uc.nota || null });
      success('Guardado'); setEditando(null); cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  if (falta) return <div className="anim-in"><PageHeader eyebrow="Mi empresa" title="Personas" /><FaltaSQL /></div>;

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi empresa" title="Personas y competencias" subtitle="Quién sabe hacer qué, sus certificaciones al día y a quién reporta." />
      {porVencer.length > 0 && (
        <div className="panel-y" style={{ padding: '0.7rem 1rem', marginBottom: 12, borderLeft: '3px solid #d97706', fontSize: '0.86rem', color: 'var(--text)' }}>
          <b>{porVencer.length} certificación{porVencer.length === 1 ? '' : 'es'} vencida{porVencer.length === 1 ? '' : 's'} o por vencer:</b>{' '}
          {porVencer.map(a => `${perfiles.find(p => p.id === a.usuario_id)?.nombre || ''} (${compDe.get(a.competencia_id)?.nombre}, ${formatDate(a.vence)})`).join(' · ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {([['personas', 'Personas', Users], ['organigrama', 'Organigrama', GitBranch], ['catalogo', 'Competencias', Award]] as const).map(([k, t, I]) => (
          <button key={k} className="btn btn-sm" onClick={() => setTab(k)} style={{ background: tab === k ? 'var(--y-brand)' : 'var(--bg3)', color: tab === k ? '#111' : 'var(--muted)' }}><I size={13} /> {t}</button>
        ))}
      </div>

      {cargando ? <div className="skeleton" style={{ height: 200 }} /> : tab === 'personas' ? (
        <div className="panel-y">
          <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>¿Quién puede?</span>
            <select className="input" style={{ maxWidth: 260 }} value={filtroComp} onChange={e => setFiltroComp(e.target.value)}>
              <option value="">Todos</option>{comps.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          </div>
          {activos.map(p => {
            const suyas = asig.filter(a => a.usuario_id === p.id);
            return (
              <div key={p.id} style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border2)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ color: 'var(--text)' }}>{p.nombre || p.email}</b>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{[p.cargo, p.area].filter(Boolean).join(' · ')}</span>
                  <span style={{ flex: 1 }} />
                  {edita && <button className="btn btn-ghost btn-xs" onClick={() => setEditando({ usuario: p, uc: {} })}><Plus size={12} /> Competencia</button>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {suyas.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Sin competencias anotadas.</span>}
                  {suyas.map(a => {
                    const c = compDe.get(a.competencia_id);
                    return (
                      <button key={a.id} type="button" disabled={!edita} onClick={() => setEditando({ usuario: p, uc: a })}
                        style={{ border: '1px solid var(--border2)', background: c?.tipo === 'certificacion' ? 'var(--y-soft)' : 'var(--bg3)', borderRadius: 8, padding: '0.3rem 0.6rem', cursor: edita ? 'pointer' : 'default', textAlign: 'left' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600 }}>{c?.nombre}{a.nivel ? ` · ${'★'.repeat(a.nivel)}` : ''}</span>
                        <Vence fecha={a.vence} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : tab === 'organigrama' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <div className="panel-y" style={{ padding: '1rem' }}><Arbol perfiles={perfiles} jefe={null} nivel={0} /></div>
          {edita && (
            <div className="panel-y" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p className="section-label" style={{ margin: 0 }}>Jefe y área de cada uno</p>
              {perfiles.filter(p => p.activo).map(p => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 120px', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}>
                  <span style={{ color: 'var(--text)' }}>{p.nombre || p.email}</span>
                  <select className="input" style={{ padding: '0.3rem' }} value={p.jefe_id || ''} onChange={async e => {
                    try { await personasService.organigrama(p.id, { jefe_id: e.target.value || null }); cargar(); } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); }
                  }}><option value="">Sin jefe</option>{perfiles.filter(x => x.id !== p.id && x.activo).map(x => <option key={x.id} value={x.id}>{x.nombre || x.email}</option>)}</select>
                  <input className="input" style={{ padding: '0.3rem' }} defaultValue={p.area || ''} placeholder="Área" onBlur={async e => {
                    if ((e.target.value || null) === (p.area || null)) return;
                    try { await personasService.organigrama(p.id, { area: e.target.value.trim() || null }); cargar(); } catch (err) { toastError(err instanceof Error ? err.message : 'No se pudo'); }
                  }} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="panel-y">
          {comps.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.55rem 1rem', borderTop: '1px solid var(--border2)', opacity: c.activo ? 1 : 0.5 }}>
              <Award size={14} color={c.tipo === 'certificacion' ? 'var(--y)' : 'var(--muted)'} />
              <span style={{ flex: 1, color: 'var(--text)' }}>{c.nombre}</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{c.tipo === 'certificacion' ? 'Certificación' : 'Habilidad'}{c.requiere_vencimiento ? ' · vence' : ''}</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{asig.filter(a => a.competencia_id === c.id).length} personas</span>
              {edita && <button className="btn btn-ghost btn-xs" onClick={async () => { try { await personasService.guardarCompetencia({ id: c.id, activo: !c.activo }); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); } }}>{c.activo ? 'Desactivar' : 'Activar'}</button>}
            </div>
          ))}
          {edita && <div style={{ padding: '0.7rem 1rem', borderTop: '1px solid var(--border2)' }}>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              const n = prompt('Nombre de la competencia o certificación'); if (!n?.trim()) return;
              const cert = confirm('¿Es una certificación con vencimiento? (Aceptar = sí; Cancelar = habilidad)');
              try { await personasService.guardarCompetencia({ nombre: n.trim(), tipo: cert ? 'certificacion' : 'habilidad', requiere_vencimiento: cert }); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
            }}><Plus size={13} /> Competencia</button>
          </div>}
        </div>
      )}

      {editando && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditando(null); }}>
          <div className="modal-box" style={{ maxWidth: 440, width: '95%', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <p className="section-label" style={{ margin: 0 }}>{editando.usuario.nombre}</p>
              <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <label><span className="label-muted">Competencia</span>
              <select className="input" disabled={!!editando.uc.id} value={editando.uc.competencia_id || ''} onChange={e => setEditando({ ...editando, uc: { ...editando.uc, competencia_id: e.target.value } })}>
                <option value="">Elegir…</option>{comps.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <label><span className="label-muted">Nivel (1-5)</span><input className="input" type="number" min={1} max={5} value={editando.uc.nivel ?? ''} onChange={e => setEditando({ ...editando, uc: { ...editando.uc, nivel: e.target.value ? Math.min(5, Math.max(1, Number(e.target.value))) : null } })} /></label>
              <label><span className="label-muted">Obtenida</span><input className="input" type="date" value={editando.uc.obtenida || ''} onChange={e => setEditando({ ...editando, uc: { ...editando.uc, obtenida: e.target.value } })} /></label>
              <label><span className="label-muted">Vence</span><input className="input" type="date" value={editando.uc.vence || ''} onChange={e => setEditando({ ...editando, uc: { ...editando.uc, vence: e.target.value } })} /></label>
            </div>
            <label><span className="label-muted">Nota</span><input className="input" value={editando.uc.nota || ''} onChange={e => setEditando({ ...editando, uc: { ...editando.uc, nota: e.target.value } })} placeholder="N° de licencia, institución…" /></label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {editando.uc.id && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={async () => {
                try { await personasService.quitar(editando.uc.id!); setEditando(null); cargar(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
              }}><Trash2 size={13} /> Quitar</button>}
              <button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarAsig}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
