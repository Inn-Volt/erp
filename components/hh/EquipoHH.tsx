'use client';

/**
 * Equipo HH: los cargos HH de cada persona.
 *   · Con hh.configurar: personas (crear, desactivar, vincular a su usuario) y sus cargos, con
 *     tarifa propia opcional, cuál es el predeterminado y la tarifa de hoy con la alerta de piso.
 *   · Sin él: «Mis cargos HH», donde la persona vinculada a su usuario elige o quita sus cargos
 *     entre los activos (sin cambiar tarifas; la base no se lo permite).
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Star, Trash2, UserPlus } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';
import { estadoTarifa, formatoMonedaHH, formatoUF, type CargoHH, type Indicadores, type ParametrosHH } from '@/lib/hh/calculo';
import { hhService, mensajeHH, type PersonaCargoHH, type PersonaHH } from '@/services/hh';
import { AlertasTarifa, Interruptor, tdEstilo, thEstilo, type PropsPestana } from './comun';

type Usuario = { id: string; nombre: string; email: string | null };

export default function EquipoHH(props: PropsPestana & { configura: boolean; miId: string | null }) {
  return props.configura ? <EquipoCompleto {...props} /> : <MisCargos {...props} />;
}

// ─── Con hh.configurar ───────────────────────────────────────────────────────

function EquipoCompleto({ cat, valores, onCambio }: PropsPestana) {
  const { success, error: toastError, warning } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [nueva, setNueva] = useState({ nombre: '', usuario: '' });
  const [creando, setCreando] = useState(false);
  useEffect(() => {
    hhService.usuariosParaVincular().then(setUsuarios).catch(e => toastError(mensajeHH(e, 'No se pudieron cargar los usuarios.')));
  }, [toastError]);

  const accion = async (f: () => Promise<void>, ok?: string) => {
    try { await f(); if (ok) success(ok); await onCambio(); }
    catch (e) { toastError(mensajeHH(e)); }
  };
  const crear = async () => {
    if (!nueva.nombre.trim()) { warning('Escribe el nombre.'); return; }
    setCreando(true);
    await accion(() => hhService.guardarPersona({ nombre: nueva.nombre.trim(), profile_id: nueva.usuario || null }), 'Persona agregada.');
    setNueva({ nombre: '', usuario: '' });
    setCreando(false);
  };
  const vinculados = new Set(cat.personas.map(p => p.profile_id).filter(Boolean));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel" style={{ padding: '0.75rem 1rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <UserPlus size={15} style={{ color: 'var(--muted)' }} aria-hidden />
        <input className="input input-sm" style={{ flex: '1 1 180px' }} value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })}
          placeholder="Nombre (también colaboradores externos)" aria-label="Nombre de la persona" />
        <select className="input input-sm" style={{ flex: '1 1 200px' }} value={nueva.usuario} onChange={e => setNueva({ ...nueva, usuario: e.target.value })} aria-label="Usuario vinculado">
          <option value="">Sin usuario (externo)</option>
          {usuarios.filter(u => !vinculados.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={crear} disabled={creando}>{creando ? <Loader2 size={13} className="iv-spin" /> : <Plus size={13} />} Agregar persona</button>
      </div>

      {cat.personas.length === 0 && <p className="panel" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>Aún no hay personas en el equipo HH.</p>}
      {cat.personas.map(p => (
        <TarjetaPersona key={p.id} p={p} cat={cat} valores={valores} usuarios={usuarios} vinculados={vinculados} accion={accion} />
      ))}
    </div>
  );
}

function TarjetaPersona({ p, cat, valores, usuarios, vinculados, accion }: {
  p: PersonaHH; cat: PropsPestana['cat']; valores: Indicadores; usuarios: Usuario[]; vinculados: Set<string | null>;
  accion: (f: () => Promise<void>, ok?: string) => Promise<void>;
}) {
  const [agregar, setAgregar] = useState('');
  const asignaciones = cat.personaCargos.filter(a => a.persona_id === p.id);
  const cargo = new Map(cat.cargos.map(c => [c.id, c]));
  const libres = cat.cargos.filter(c => c.activo && !asignaciones.some(a => a.cargo_id === c.id));
  const usuario = usuarios.find(u => u.id === p.profile_id);

  return (
    <div className="panel-y" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 10, opacity: p.activo ? 1 : 0.6 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ color: 'var(--text)', fontSize: '1rem' }}>{p.nombre}</b>
        <select className="input input-sm" style={{ width: 'min(100%, 240px)' }} value={p.profile_id ?? ''} aria-label={`Usuario de ${p.nombre}`}
          onChange={e => accion(() => hhService.guardarPersona({ id: p.id, profile_id: e.target.value || null }), 'Vínculo guardado.')}>
          <option value="">Sin usuario (externo)</option>
          {p.profile_id && !usuario && <option value={p.profile_id}>(usuario vinculado)</option>}
          {usuarios.filter(u => u.id === p.profile_id || !vinculados.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
          {p.activo ? 'Activa' : 'Inactiva'}
          <Interruptor activo={p.activo} etiqueta={`${p.nombre} activa`} onChange={() => accion(() => hhService.guardarPersona({ id: p.id, activo: !p.activo }))} />
        </label>
      </div>

      {asignaciones.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: '0.84rem' }}>
            <thead><tr>
              <th style={thEstilo}>Cargo HH</th><th style={thEstilo}>Tarifa propia</th><th style={{ ...thEstilo, textAlign: 'right' }}>Hoy</th>
              <th style={{ ...thEstilo, textAlign: 'center' }}>Predeterminado</th><th style={{ ...thEstilo, textAlign: 'center' }}>Activo</th><th style={thEstilo} aria-label="Quitar" />
            </tr></thead>
            <tbody>{asignaciones.map(a => {
              const c = cargo.get(a.cargo_id);
              return c ? <FilaAsignacion key={a.id} a={a} c={c} p={cat.parametros} valores={valores} accion={accion} /> : null;
            })}</tbody>
          </table>
        </div>
      ) : <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>Sin cargos HH asignados.</p>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select className="input input-sm" style={{ flex: '1 1 220px' }} value={agregar} onChange={e => setAgregar(e.target.value)} aria-label={`Cargo para ${p.nombre}`}>
          <option value="">Asignar un cargo…</option>
          {libres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" disabled={!agregar} onClick={async () => {
          await accion(() => hhService.guardarPersonaCargo({ persona_id: p.id, cargo_id: agregar, predeterminado: !asignaciones.some(x => x.predeterminado && x.activo) }), 'Cargo asignado.');
          setAgregar('');
        }}><Plus size={13} /> Asignar</button>
      </div>
    </div>
  );
}

function FilaAsignacion({ a, c, p, valores, accion }: {
  a: PersonaCargoHH; c: CargoHH; p: ParametrosHH; valores: Indicadores; accion: (f: () => Promise<void>, ok?: string) => Promise<void>;
}) {
  const [tarifa, setTarifa] = useState<number | null>(a.tarifa_base_propia);
  const cambiada = tarifa !== a.tarifa_base_propia;
  const e = estadoTarifa(c, valores, p, tarifa);
  return (
    <tr style={{ borderTop: '1px solid var(--border2)', opacity: a.activo && c.activo ? 1 : 0.55 }}>
      <td style={tdEstilo}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{c.nombre}</span>{!c.activo && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>cargo inactivo</span>}</td>
      <td style={tdEstilo}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <NumeroInput className="input input-sm" envoltura={{ width: 110 }} value={tarifa} decimales={c.moneda_base === 'UF' ? 4 : 2} min={0}
            sufijo={c.moneda_base === 'UF' ? 'UF' : 'USD'} placeholder={`${formatoMonedaHH(c.tarifa_base, c.moneda_base)} (cargo)`}
            onChange={v => setTarifa(v > 0 ? v : null)} onVacio={() => setTarifa(null)} ariaLabel={`Tarifa propia en ${c.nombre}`} />
          {cambiada && (
            <button className="btn btn-primary btn-xs" aria-label="Guardar tarifa propia"
              onClick={() => accion(() => hhService.guardarPersonaCargo({ id: a.id, tarifa_base_propia: tarifa }), 'Tarifa guardada.')}><Check size={12} /></button>
          )}
        </div>
      </td>
      <td style={{ ...tdEstilo, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <b style={{ color: 'var(--text)' }}>{formatCLP(e.clp)}/h</b>
        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>{formatoUF(e.uf)}</span>
        <AlertasTarifa e={e} compacto />
      </td>
      <td style={{ ...tdEstilo, textAlign: 'center' }}>
        <button className="btn btn-ghost btn-xs" aria-pressed={a.predeterminado} disabled={!a.activo || a.predeterminado}
          aria-label={a.predeterminado ? 'Es el predeterminado' : 'Marcar como predeterminado'}
          onClick={() => accion(() => hhService.guardarPersonaCargo({ id: a.id, predeterminado: true }))}>
          <Star size={13} fill={a.predeterminado ? 'currentColor' : 'none'} /> {a.predeterminado ? 'Sí' : ''}
        </button>
      </td>
      <td style={{ ...tdEstilo, textAlign: 'center' }}>
        <Interruptor activo={a.activo} etiqueta={`${c.nombre} activo`} onChange={() => accion(() => hhService.guardarPersonaCargo({ id: a.id, activo: !a.activo }))} />
      </td>
      <td style={{ ...tdEstilo, textAlign: 'right' }}>
        <button className="btn btn-ghost btn-xs" aria-label={`Quitar ${c.nombre}`}
          onClick={() => confirm(`¿Quitar «${c.nombre}» de esta persona?`) && accion(() => hhService.eliminarPersonaCargo(a.id), 'Cargo quitado.')}><Trash2 size={12} /></button>
      </td>
    </tr>
  );
}

// ─── Sin hh.configurar: Mis cargos HH ────────────────────────────────────────

function MisCargos({ cat, valores, onCambio, miId }: PropsPestana & { miId: string | null }) {
  const { error: toastError } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const yo = useMemo(() => cat.personas.find(p => p.profile_id === miId && p.activo) ?? null, [cat.personas, miId]);
  if (!yo) {
    return (
      <p className="panel" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', margin: 0 }}>
        Tu usuario no está vinculado a una persona del equipo HH. Pídele a quien configura la calculadora que te vincule.
      </p>
    );
  }
  const mias = cat.personaCargos.filter(a => a.persona_id === yo.id);
  const activos = cat.cargos.filter(c => c.activo);
  const accion = async (cargoId: string, f: () => Promise<void>) => {
    setOcupado(cargoId);
    try { await f(); await onCambio(); }
    catch (e) { toastError(mensajeHH(e)); }
    finally { setOcupado(null); }
  };

  return (
    <div className="panel-y" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="section-label" style={{ margin: 0 }}>Mis cargos HH · {yo.nombre}</p>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
        Marca los cargos con que trabajas: son los que aparecen cuando alguien te elige en la calculadora. Las tarifas las fija quien configura la calculadora.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: '0.84rem' }}>
          <thead><tr>
            <th style={thEstilo}>Cargo HH</th><th style={{ ...thEstilo, textAlign: 'right' }}>Tarifa de hoy</th>
            <th style={{ ...thEstilo, textAlign: 'center' }}>Predeterminado</th><th style={{ ...thEstilo, textAlign: 'center' }}>Lo hago</th>
          </tr></thead>
          <tbody>{activos.map(c => {
            const a = mias.find(x => x.cargo_id === c.id);
            const lo = !!a?.activo;
            const e = estadoTarifa(c, valores, cat.parametros, a?.tarifa_base_propia);
            return (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border2)' }}>
                <td style={tdEstilo}><span style={{ color: 'var(--text)', fontWeight: lo ? 600 : 400 }}>{c.nombre}</span></td>
                <td style={{ ...tdEstilo, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text)' }}>{formatCLP(e.clp)}/h</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>{formatoUF(e.uf)}{a?.tarifa_base_propia ? ' · tarifa propia' : ''}</span>
                </td>
                <td style={{ ...tdEstilo, textAlign: 'center' }}>
                  {lo && (
                    <button className="btn btn-ghost btn-xs" aria-pressed={a!.predeterminado} disabled={a!.predeterminado || ocupado === c.id}
                      aria-label={a!.predeterminado ? 'Es tu predeterminado' : 'Marcar como predeterminado'}
                      onClick={() => accion(c.id, () => hhService.guardarPersonaCargo({ id: a!.id, predeterminado: true }))}>
                      <Star size={13} fill={a!.predeterminado ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </td>
                <td style={{ ...tdEstilo, textAlign: 'center' }}>
                  {ocupado === c.id ? <Loader2 size={14} className="iv-spin" /> : (
                    <Interruptor activo={lo} etiqueta={`Hago ${c.nombre}`} onChange={() => accion(c.id, () => (a
                      ? hhService.guardarPersonaCargo({ id: a.id, activo: !a.activo })
                      : hhService.guardarPersonaCargo({ persona_id: yo.id, cargo_id: c.id, predeterminado: !mias.some(x => x.activo) })))} />
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
