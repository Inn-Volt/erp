'use client';

/**
 * Permisos del usuario conectado (rol → permisos `modulo.accion`).
 * ─────────────────────────────────────────────────────────────────────────────
 * `puede('cotizaciones.aprobar')` esconde lo que el usuario no puede hacer. La
 * seguridad real la pone la base de datos (RLS con tiene_permiso); esto es para
 * que la pantalla no ofrezca botones que después fallarían.
 *
 * Si la base todavía no tiene la Fase 1 (no se ejecutó
 * supabase_fase1_usuarios_permisos.sql), todo sigue como antes: todos pueden todo
 * y `sinMigracion` avisa que falta ese paso.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { incluye, incluyeAlguno } from '@/lib/permisos';

export interface Perfil {
  id: string;
  nombre: string | null;
  email: string | null;
  activo: boolean;
  telefono?: string | null;
  cargo?: string | null;
  /** Empresa emisora con la que cotiza (Usuarios). */
  empresa_id?: string | null;
}

interface EstadoPermisos {
  perfil: Perfil | null;
  permisos: string[];
  /** Nombres de los roles activos del usuario (para mostrar). */
  roles: string[];
  cargando: boolean;
  error: string | null;
  sinMigracion: boolean;
  puede: (clave: string) => boolean;
  puedeAlguno: (claves: string[]) => boolean;
  recargar: () => Promise<void>;
}

const Ctx = createContext<EstadoPermisos>({
  perfil: null, permisos: [], roles: [], cargando: true, error: null, sinMigracion: false,
  puede: () => false, puedeAlguno: () => false, recargar: async () => {},
});

/** Error de PostgREST que indica que la función o la columna aún no existen. */
const faltaMigracion = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42703' || e.code === 'PGRST204' ||
    /mis_permisos|could not find the function|column .*activo/i.test(e.message || ''));

export function PermisosProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinMigracion, setSinMigracion] = useState(false);

  const recargar = useCallback(async () => {
    if (!userId) { setCargando(false); return; }
    setError(null);
    // Un fallo pasajero (red, sesión recién renovada) se reintenta una vez antes de mostrar el error.
    for (let intento = 0; intento < 2; intento++) {
      try {
        const [rp, rpf, rr] = await Promise.all([
          supabase.rpc('mis_permisos'),
          supabase.from('profiles').select('id, nombre, email, activo, telefono, cargo, empresa_id').eq('id', userId).maybeSingle(),
          supabase.from('usuario_roles').select('activo, roles(nombre, activo)').eq('usuario_id', userId),
        ]);
        if (faltaMigracion(rp.error) || faltaMigracion(rpf.error)) {
          setSinMigracion(true);
          setPermisos(['*']);
          setPerfil(null);
          setRoles([]);
          break;
        }
        if (rp.error) throw rp.error;
        setSinMigracion(false);
        setPermisos((rp.data as string[] | null) || []);
        setPerfil((rpf.data as Perfil | null) || null);
        type FilaRol = { activo: boolean; roles: { nombre: string; activo: boolean } | { nombre: string; activo: boolean }[] | null };
        setRoles(((rr.data as FilaRol[] | null) || [])
          .filter(f => f.activo)
          .flatMap(f => (Array.isArray(f.roles) ? f.roles : f.roles ? [f.roles] : []))
          .filter(r => r.activo)
          .map(r => r.nombre));
        break;
      } catch (e) {
        if (intento === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
        setError(e instanceof Error ? e.message : 'No se pudieron cargar tus permisos.');
      }
    }
    setCargando(false);
  }, [userId]);

  useEffect(() => { setCargando(true); recargar(); }, [recargar]);

  const valor = useMemo<EstadoPermisos>(() => ({
    perfil, permisos, roles, cargando, error, sinMigracion,
    puede: (c: string) => incluye(permisos, c),
    puedeAlguno: (cs: string[]) => incluyeAlguno(permisos, cs),
    recargar,
  }), [perfil, permisos, roles, cargando, error, sinMigracion, recargar]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const usePermisos = () => useContext(Ctx);
