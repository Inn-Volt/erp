'use client';

/**
 * Mi empresa → Roles y permisos (portado de TecApp).
 * Lista de roles a la izquierda; a la derecha, sus permisos por área y módulo.
 *  · Administrador: todos los permisos; no se cambia.
 *  · Roles base: se renombran y se les suman permisos, pero lo de su plantilla (🔒)
 *    no se quita (al actualizar el sistema volvería). Para uno con menos: duplícalo.
 *  · Roles propios: se marcan libres. Un rol no se borra: se desactiva (si nadie lo tiene).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Loader2, ShieldCheck, Lock, Power } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { usuariosService, rolesService, type Rol, type UsuarioRol, type Usuario } from '@/services/usuarios';
import { CATALOGO, PLANTILLAS_BASE } from '@/lib/permisos';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';

type Elegido = string | 'nuevo' | null;

export default function RolesPage() {
  const { puede, recargar: recargarMisPermisos } = usePermisos();
  const { success, error: toastError } = useToast();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [asign, setAsign] = useState<UsuarioRol[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [elegido, setElegido] = useState<Elegido>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const puedeCambiar = puede('roles.gestionar');

  const cargar = useCallback(async () => {
    try {
      const r = await usuariosService.listar();
      setRoles(r.roles); setAsign(r.asignaciones); setUsuarios(r.usuarios);
    } catch (e) {
      toastError('No se pudieron cargar los roles: ' + (e instanceof Error ? e.message : ''));
    } finally { setCargando(false); }
  }, [toastError]);
  useEffect(() => { cargar(); }, [cargar]);

  const rol = roles.find(r => r.id === elegido) || null;
  const fijos = useMemo(() => new Set(rol?.clave ? (PLANTILLAS_BASE[rol.clave] || []) : []), [rol]);
  const editable = puedeCambiar && !rol?.protegido;

  const personas = (r: Rol) => asign.filter(a => a.rol_id === r.id && a.activo && usuarios.find(u => u.id === a.usuario_id)?.activo).length;
  const etiqueta = (r: Rol) => r.protegido ? { t: 'Todos los permisos', c: 'var(--y)', b: 'var(--y-soft)' }
    : !r.activo ? { t: 'Desactivado', c: 'var(--muted)', b: 'var(--bg3)' }
    : r.clave ? { t: 'Base', c: 'var(--info)', b: 'var(--info-soft, rgba(59,130,246,0.1))' }
    : { t: 'Propio', c: 'var(--success)', b: 'var(--success-soft)' };

  const abrir = (r: Rol) => {
    setElegido(r.id); setNombre(r.nombre); setDescripcion(r.descripcion || '');
    setMarcados(new Set(r.permisos));
  };
  const nuevo = (base?: Rol) => {
    setElegido('nuevo');
    setNombre(base ? `${base.nombre} (copia)` : '');
    setDescripcion(base?.descripcion || '');
    setMarcados(new Set(base ? (base.protegido ? CATALOGO.flatMap(a => a.modulos.flatMap(m => m.permisos.map(p => p.clave))) : base.permisos) : []));
  };

  const alternar = (clave: string) => {
    if (!editable || fijos.has(clave)) return;
    setMarcados(p => { const n = new Set(p); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  };
  const alternarModulo = (claves: string[]) => {
    if (!editable) return;
    const libres = claves.filter(c => !fijos.has(c));
    const todos = libres.every(c => marcados.has(c));
    setMarcados(p => { const n = new Set(p); libres.forEach(c => (todos ? n.delete(c) : n.add(c))); return n; });
  };

  const cambio = elegido === 'nuevo' || (!!rol && (nombre !== rol.nombre || descripcion !== (rol.descripcion || '') ||
    marcados.size !== rol.permisos.length || rol.permisos.some(p => !marcados.has(p))));

  const guardar = async () => {
    if (!nombre.trim()) { toastError('Ponle un nombre al rol'); return; }
    setGuardando(true);
    try {
      const permisos = [...marcados].sort();
      if (elegido === 'nuevo') {
        const creado = await rolesService.crear({ nombre, descripcion, permisos });
        success('Rol creado');
        await cargar();
        abrir(creado);
      } else if (rol) {
        await rolesService.guardar(rol.id, { nombre, descripcion, permisos: rol.protegido ? undefined : permisos });
        success('Cambios guardados');
        await cargar();
        recargarMisPermisos();
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setGuardando(false); }
  };

  const cambiarEstado = async () => {
    if (!rol) return;
    if (rol.activo && !confirm(`¿Desactivar el rol «${rol.nombre}»? Deja de aparecer al asignar roles.`)) return;
    try {
      await rolesService.setActivo(rol.id, !rol.activo);
      success(rol.activo ? 'Rol desactivado' : 'Rol reactivado');
      await cargar();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo cambiar'); }
  };

  useEffect(() => {
    // Mantiene el formulario al día después de recargar la lista.
    if (rol && elegido !== 'nuevo' && !cambio) abrir(rol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  return (
    <div className="anim-in">
      <PageHeader eyebrow="Mi empresa" title="Roles y permisos"
        subtitle="Qué puede hacer cada rol. Los roles base vienen con el sistema; los propios los armas tú."
        actions={puedeCambiar ? <button className="btn btn-primary" onClick={() => nuevo()}><Plus size={14} /> Nuevo rol</button> : null} />

      {cargando ? <div className="skeleton" style={{ height: 260 }} /> : (
        <div className="roles-grid">
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {roles.map(r => {
              const e = etiqueta(r);
              const sel = elegido === r.id;
              return (
                <li key={r.id}>
                  <button onClick={() => abrir(r)} style={{ width: '100%', textAlign: 'left', padding: '0.7rem 0.9rem', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${sel ? 'var(--y-brand)' : 'var(--border2)'}`, background: sel ? 'var(--y-soft)' : 'var(--bg2)' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {r.protegido && <ShieldCheck size={14} color="var(--y)" />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</span>
                      </span>
                      <span className="badge" style={{ background: e.b, color: e.c, flexShrink: 0 }}>{e.t}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)', marginTop: 2 }}>
                      {personas(r)} {personas(r) === 1 ? 'persona' : 'personas'} · {r.protegido ? 'todos los permisos' : `${r.permisos.length} permisos`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className="panel" style={{ padding: '1.25rem', minWidth: 0 }}>
            {elegido === null ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Elige un rol para ver o cambiar sus permisos.</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Nombre</label>
                      <input className="input" value={nombre} disabled={!puedeCambiar} onChange={e => setNombre(e.target.value)} placeholder="Por ejemplo: Ventas en terreno" style={{ maxWidth: 420 }} />
                    </div>
                    <div>
                      <label className="label-muted" style={{ display: 'block', marginBottom: 6 }}>Descripción</label>
                      <input className="input" value={descripcion} disabled={!puedeCambiar} onChange={e => setDescripcion(e.target.value)} placeholder="Para qué sirve este rol" />
                    </div>
                  </div>
                  {rol && puedeCambiar && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => nuevo(rol)}><Copy size={13} /> Duplicar</button>
                      {!rol.protegido && <button className="btn btn-ghost btn-sm" onClick={cambiarEstado}><Power size={13} /> {rol.activo ? 'Desactivar' : 'Reactivar'}</button>}
                    </div>
                  )}
                </div>

                <p style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  {rol?.protegido ? 'El Administrador tiene todos los permisos y no se puede cambiar. Siempre debe quedar al menos una persona con este rol.'
                    : rol?.clave ? 'Rol base: puedes cambiarle el nombre y sumarle permisos; los que trae (🔒) no se quitan. Para uno con menos permisos, duplícalo. Si no lo usas, desactívalo.'
                    : 'Rol propio: marca lo que puede hacer quien lo tenga. Haz clic en el nombre de un módulo para marcarlo o desmarcarlo entero.'}
                </p>

                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {CATALOGO.map(area => (
                    <div key={area.area}>
                      <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--y)', marginBottom: 6 }}>{area.area}</h3>
                      <div style={{ border: '1px solid var(--border2)', borderRadius: 12, overflow: 'hidden' }}>
                        {area.modulos.map((m, i) => {
                          const claves = m.permisos.map(p => p.clave);
                          return (
                            <div key={m.modulo} className="roles-fila" style={{ borderTop: i ? '1px solid var(--border2)' : 'none' }}>
                              <button type="button" onClick={() => alternarModulo(claves)} disabled={!editable}
                                title={editable ? 'Marcar o desmarcar todo el módulo' : undefined}
                                style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', cursor: editable ? 'pointer' : 'default' }}>
                                {m.nombre}
                              </button>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
                                {m.permisos.map(p => {
                                  const fijo = fijos.has(p.clave);
                                  const on = rol?.protegido || marcados.has(p.clave);
                                  return (
                                    <label key={p.clave} title={fijo ? 'Lo trae este rol base: no se quita' : p.ayuda || p.clave}
                                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: editable && !fijo ? 'var(--text)' : 'var(--muted)', cursor: editable && !fijo ? 'pointer' : 'default' }}>
                                      <input type="checkbox" checked={!!on} disabled={!editable || fijo} onChange={() => alternar(p.clave)} style={{ width: 16, height: 16, accentColor: 'var(--y-brand)' }} />
                                      {p.nombre}{fijo && <Lock size={11} aria-label="fijo" />}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {puedeCambiar && (elegido === 'nuevo' || (rol && !rol.protegido) || (rol?.protegido && nombre !== rol.nombre)) && (
                  <div style={{ position: 'sticky', bottom: 0, marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border2)', background: 'var(--bg2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    {cambio && <button className="btn btn-ghost" onClick={() => (rol ? abrir(rol) : setElegido(null))}>Descartar</button>}
                    <button className="btn btn-primary" onClick={guardar} disabled={guardando || !cambio}>
                      {guardando && <Loader2 size={14} className="iv-spin" />} {elegido === 'nuevo' ? 'Crear rol' : 'Guardar cambios'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <style>{`
        .roles-grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start; }
        @media (min-width: 1024px) { .roles-grid { grid-template-columns: 290px 1fr; } }
        .roles-fila { display: grid; grid-template-columns: 1fr; gap: 6px; padding: 0.7rem 0.9rem; }
        @media (min-width: 640px) { .roles-fila { grid-template-columns: 190px 1fr; align-items: start; } }
      `}</style>
    </div>
  );
}
