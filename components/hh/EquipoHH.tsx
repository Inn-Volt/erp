'use client';

/**
 * Equipo: las personas y sus cargos HH, por jerarquía (cada una a cargo de otra).
 *   · Con hh.configurar: todo el equipo; quién está a cargo de quién, vincular con su usuario,
 *     asignar cargos, tarifas propias y el cargo predeterminado.
 *   · Sin él: «Mi equipo»: tu persona (eliges tus cargos, sin cambiar tu tarifa) y las personas a
 *     tu cargo hacia abajo, que manejas enteras (las agregas, les das cargos y tarifas). No ves a
 *     quien está sobre ti. La base lo exige (RLS y triggers), no solo esta pantalla.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, Plus, Star, Trash2, UserPlus } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { useToast } from '@/hooks/useToast';
import { formatCLP } from '@/utils';
import { estadoTarifa, formatoMonedaHH, formatoUF, type CargoHH, type Indicadores, type ParametrosHH } from '@/lib/hh/calculo';
import { hhService, mensajeHH, type PersonaCargoHH, type PersonaHH } from '@/services/hh';
import { AlertasTarifa, Campo, Interruptor, Vacio, type PropsPestana } from './comun';
import { ayudasCatalogo, iniciales } from './catalogo';
import s from './hh.module.css';

type Usuario = { id: string; nombre: string; email: string | null };
type Accion = (f: () => Promise<void>, ok?: string) => Promise<void>;

export default function EquipoHH({ cat, valores, onCambio, configura, miId }: PropsPestana & { configura: boolean; miId: string | null }) {
  const { success, error: toastError, warning } = useToast();
  const ay = useMemo(() => ayudasCatalogo(cat, miId), [cat, miId]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [nueva, setNueva] = useState({ nombre: '', jefe: ay.miPersona?.id ?? '', usuario: '' });
  const [creando, setCreando] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(cat.personas.length <= 4 ? cat.personas.map(p => p.id) : ay.miPersona ? [ay.miPersona.id] : []));

  useEffect(() => {
    if (!configura) return;
    hhService.usuariosParaVincular().then(setUsuarios).catch(e => toastError(mensajeHH(e, 'No se pudieron cargar los usuarios.')));
  }, [configura, toastError]);

  const accion: Accion = async (f, ok) => {
    try { await f(); if (ok) success(ok); await onCambio(); }
    catch (e) { toastError(mensajeHH(e)); }
  };
  const crear = async () => {
    if (!nueva.nombre.trim()) { warning('Escribe el nombre.'); return; }
    if (!configura && !nueva.jefe) { warning('Elige de quién está a cargo.'); return; }
    setCreando(true);
    await accion(() => hhService.guardarPersona({ nombre: nueva.nombre.trim(), jefe_id: nueva.jefe || null, profile_id: configura ? nueva.usuario || null : null }), 'Persona agregada.');
    setNueva(n => ({ ...n, nombre: '', usuario: '' }));
    setCreando(false);
  };
  const alternar = (id: string) => setAbiertas(a => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!configura && !ay.miPersona) {
    return <Vacio>Tu usuario todavía no está vinculado a una persona del equipo HH. Pídele a quien configura la calculadora que te vincule en «Equipo».</Vacio>;
  }
  const vinculados = new Set(cat.personas.map(p => p.profile_id).filter(Boolean));

  return (
    <div className={s.tarjetas}>
      <div className="panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="section-label" style={{ margin: 0 }}><UserPlus size={15} /> {configura ? 'Agregar una persona' : 'Agregar a alguien a tu equipo'}</p>
        <div className={s.rejilla}>
          <Campo etiqueta="Nombre"><input className="input" value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Ej.: Pedro (ayudante)" /></Campo>
          <Campo etiqueta="A cargo de">
            <select className="input" value={nueva.jefe} onChange={e => setNueva({ ...nueva, jefe: e.target.value })}>
              {configura && <option value="">Nadie (arriba del todo)</option>}
              {ay.arbol.filter(x => x.p.activo).map(({ p, nivel }) => <option key={p.id} value={p.id}>{'· '.repeat(nivel)}{p.nombre}{p.id === ay.miPersona?.id ? ' (tú)' : ''}</option>)}
            </select>
          </Campo>
          {configura && (
            <Campo etiqueta="Su usuario (opcional)">
              <select className="input" value={nueva.usuario} onChange={e => setNueva({ ...nueva, usuario: e.target.value })}>
                <option value="">Sin usuario (externo)</option>
                {usuarios.filter(u => !vinculados.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </Campo>
          )}
        </div>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={crear} disabled={creando}>
          {creando ? <Loader2 size={13} className="iv-spin" /> : <Plus size={13} />} Agregar
        </button>
        {!configura && <p className={s.ayuda}>Las personas que agregas quedan a tu cargo: les das cargos y tarifas, y calculas con sus horas. Vincularlas con un usuario lo hace quien configura la calculadora.</p>}
      </div>

      {ay.arbol.map(({ p, nivel }) => (
        <TarjetaPersona key={p.id} p={p} nivel={nivel} cat={cat} valores={valores} usuarios={usuarios} vinculados={vinculados}
          configura={configura} esYo={p.id === ay.miPersona?.id} abierta={abiertas.has(p.id)} onAlternar={() => alternar(p.id)}
          accion={accion} jefes={ay.arbol.map(x => x.p)} />
      ))}
    </div>
  );
}

function TarjetaPersona({ p, nivel, cat, valores, usuarios, vinculados, configura, esYo, abierta, onAlternar, accion, jefes }: {
  p: PersonaHH; nivel: number; cat: PropsPestana['cat']; valores: Indicadores; usuarios: Usuario[]; vinculados: Set<string | null>;
  configura: boolean; esYo: boolean; abierta: boolean; onAlternar: () => void; accion: Accion; jefes: PersonaHH[];
}) {
  const [agregar, setAgregar] = useState('');
  const maneja = configura || !esYo;              // lo suyo, quien no configura lo maneja a medias
  const asignaciones = cat.personaCargos.filter(a => a.persona_id === p.id);
  const cargo = new Map(cat.cargos.map(c => [c.id, c]));
  const libres = cat.cargos.filter(c => c.activo && !asignaciones.some(a => a.cargo_id === c.id));
  const activos = asignaciones.filter(a => a.activo && cargo.get(a.cargo_id)?.activo);
  const jefe = p.jefe_id ? jefes.find(j => j.id === p.jefe_id) : undefined;
  // No puede quedar a cargo de sí misma ni de alguien de su propio equipo (la base también lo impide).
  const debajo = useMemo(() => {
    const d = new Set<string>([p.id]);
    let crecio = true;
    while (crecio) { crecio = false; for (const x of jefes) if (x.jefe_id && d.has(x.jefe_id) && !d.has(x.id)) { d.add(x.id); crecio = true; } }
    return d;
  }, [jefes, p.id]);
  const usuario = usuarios.find(u => u.id === p.profile_id);

  return (
    <div className={`panel-y ${s.tarjeta}`} style={{ marginLeft: Math.min(nivel, 3) * 18, opacity: p.activo ? 1 : 0.6 }}>
      <div className={s.tarjetaCabeza}>
        <button type="button" className={s.expandir} onClick={onAlternar} aria-expanded={abierta}>
          {abierta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          <span className={s.avatar}>{iniciales(p.nombre)}</span>
          <span className={s.tarjetaTitulo}>
            <b>{p.nombre}{esYo ? ' (tú)' : ''}</b>
            <small>
              {activos.length ? activos.map(a => cargo.get(a.cargo_id)?.nombre).join(' · ') : 'Sin cargos HH'}
              {jefe ? ` · a cargo de ${jefe.nombre}` : ''}
            </small>
          </span>
        </button>
        {maneja && (
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
            {p.activo ? 'Activa' : 'Inactiva'}
            <Interruptor activo={p.activo} etiqueta={`${p.nombre} activa`} onChange={() => accion(() => hhService.guardarPersona({ id: p.id, activo: !p.activo }))} />
          </label>
        )}
      </div>

      {abierta && (
        <>
          {maneja && (
            <div className={s.rejilla}>
              <Campo etiqueta="A cargo de">
                <select className="input input-sm" value={p.jefe_id ?? ''} aria-label={`De quién está a cargo ${p.nombre}`}
                  onChange={e => accion(() => hhService.guardarPersona({ id: p.id, jefe_id: e.target.value || null }), 'Equipo actualizado.')}>
                  {configura && <option value="">Nadie (arriba del todo)</option>}
                  {jefes.filter(j => !debajo.has(j.id) && (j.activo || j.id === p.jefe_id)).map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
                </select>
              </Campo>
              {configura && (
                <Campo etiqueta="Su usuario">
                  <select className="input input-sm" value={p.profile_id ?? ''} aria-label={`Usuario de ${p.nombre}`}
                    onChange={e => accion(() => hhService.guardarPersona({ id: p.id, profile_id: e.target.value || null }), 'Vínculo guardado.')}>
                    <option value="">Sin usuario (externo)</option>
                    {p.profile_id && !usuario && <option value={p.profile_id}>(usuario vinculado)</option>}
                    {usuarios.filter(u => u.id === p.profile_id || !vinculados.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </Campo>
              )}
            </div>
          )}

          <div>
            {asignaciones.length === 0 && <p className={s.ayuda}>Sin cargos HH asignados.</p>}
            {asignaciones.map(a => {
              const c = cargo.get(a.cargo_id);
              return c ? <FilaAsignacion key={`${a.id}:${a.tarifa_base_propia}`} a={a} c={c} p={cat.parametros} valores={valores} accion={accion} maneja={maneja} /> : null;
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select className="input input-sm" style={{ flex: '1 1 220px', minWidth: 0 }} value={agregar} onChange={e => setAgregar(e.target.value)} aria-label={`Cargo para ${p.nombre}`}>
              <option value="">{esYo && !configura ? 'Agregar un cargo que haces…' : 'Asignar un cargo…'}</option>
              {libres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" disabled={!agregar} onClick={async () => {
              await accion(() => hhService.guardarPersonaCargo({ persona_id: p.id, cargo_id: agregar, predeterminado: activos.length === 0 }), 'Cargo asignado.');
              setAgregar('');
            }}><Plus size={13} /> Asignar</button>
          </div>
          {esYo && !configura && <p className={s.ayuda}>Tu tarifa la fija quien está sobre ti en el equipo o quien configura la calculadora.</p>}
        </>
      )}
    </div>
  );
}

function FilaAsignacion({ a, c, p, valores, accion, maneja }: {
  a: PersonaCargoHH; c: CargoHH; p: ParametrosHH; valores: Indicadores; accion: Accion; maneja: boolean;
}) {
  const [tarifa, setTarifa] = useState<number | null>(a.tarifa_base_propia);
  const cambiada = tarifa !== a.tarifa_base_propia;
  const e = estadoTarifa(c, valores, p, tarifa);
  return (
    <div className={s.subtarjeta} style={{ opacity: a.activo && c.activo ? 1 : 0.55 }}>
      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
        <b style={{ color: 'var(--text)', fontSize: '0.88rem' }}>{c.nombre}</b>
        <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)' }}>
          {formatCLP(e.clp)}/h · {formatoUF(e.uf)}{a.tarifa_base_propia ? ' · tarifa propia' : ''}{!c.activo ? ' · cargo inactivo' : ''}
        </span>
        <AlertasTarifa e={e} compacto />
      </span>
      {maneja ? (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <NumeroInput className="input input-sm" envoltura={{ width: 132 }} value={tarifa} decimales={c.moneda_base === 'UF' ? 4 : 2} min={0}
            sufijo={c.moneda_base === 'UF' ? 'UF/h' : 'USD/h'} placeholder={`${formatoMonedaHH(c.tarifa_base, c.moneda_base).replace(' UF', '')}`}
            onChange={v => setTarifa(v > 0 ? v : null)} onVacio={() => setTarifa(null)} ariaLabel={`Tarifa propia en ${c.nombre}`} title="Tarifa propia (vacía = la del cargo)" />
          {cambiada && (
            <button className="btn btn-primary btn-xs" aria-label="Guardar la tarifa propia"
              onClick={() => accion(() => hhService.guardarPersonaCargo({ id: a.id, tarifa_base_propia: tarifa }), 'Tarifa guardada.')}><Check size={12} /></button>
          )}
        </span>
      ) : null}
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
        <button className={s.iconoBtn} aria-pressed={a.predeterminado} disabled={!a.activo || a.predeterminado}
          title={a.predeterminado ? 'Es el que se elige primero' : 'Elegirlo primero en la calculadora'}
          aria-label={a.predeterminado ? 'Es el predeterminado' : 'Marcar como predeterminado'}
          onClick={() => accion(() => hhService.guardarPersonaCargo({ id: a.id, predeterminado: true }))}>
          <Star size={16} fill={a.predeterminado ? 'var(--y-brand)' : 'none'} color={a.predeterminado ? 'var(--y-brand)' : 'currentColor'} />
        </button>
        <Interruptor activo={a.activo} etiqueta={`${c.nombre} activo`} onChange={() => accion(() => hhService.guardarPersonaCargo({ id: a.id, activo: !a.activo }))} />
        {maneja && (
          <button className={s.iconoBtn} aria-label={`Quitar ${c.nombre}`}
            onClick={() => confirm(`¿Quitar «${c.nombre}»?`) && accion(() => hhService.eliminarPersonaCargo(a.id), 'Cargo quitado.')}><Trash2 size={15} /></button>
        )}
      </span>
    </div>
  );
}
