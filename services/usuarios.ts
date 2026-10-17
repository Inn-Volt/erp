import { supabase } from '@/lib/supabase';
import { fetchConSesion } from '@/lib/fetchConSesion';

export interface Usuario {
  id: string;
  nombre: string | null;
  email: string | null;
  activo: boolean;
  telefono: string | null;
  cargo: string | null;
  /** Empresa emisora con la que cotiza (quién cotiza: automático por cuenta). */
  empresa_id: string | null;
  created_at: string | null;
}

export interface EmpresaBreve { id: string; nombre: string }

export interface Rol {
  id: string;
  clave: string | null;        // rol base (admin, comercial…); null = rol propio
  nombre: string;
  descripcion: string | null;
  permisos: string[];
  protegido: boolean;
  activo: boolean;
}

export interface UsuarioRol {
  id: string;
  usuario_id: string;
  rol_id: string;
  activo: boolean;
}

/** Respuesta de la API al invitar o al pedir un nuevo enlace de acceso. */
export interface EnlaceDeAcceso {
  ok: boolean;
  id?: string;
  enlace?: string;
  aviso?: string;
  error?: string;
}

async function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetchConSesion(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

export const usuariosService = {
  async listar(): Promise<{ usuarios: Usuario[]; roles: Rol[]; asignaciones: UsuarioRol[]; empresas: EmpresaBreve[] }> {
    const [u, r, a, e] = await Promise.all([
      supabase.from('profiles').select('id, nombre, email, activo, telefono, cargo, empresa_id, created_at').order('nombre'),
      supabase.from('roles').select('id, clave, nombre, descripcion, permisos, protegido, activo').order('created_at'),
      supabase.from('usuario_roles').select('id, usuario_id, rol_id, activo'),
      supabase.from('empresas').select('id, nombre').order('nombre'),
    ]);
    if (u.error) throw u.error;
    if (r.error) throw r.error;
    if (a.error) throw a.error;
    return {
      usuarios: (u.data || []) as Usuario[], roles: (r.data || []) as Rol[], asignaciones: (a.data || []) as UsuarioRol[],
      empresas: (e.data || []) as EmpresaBreve[],
    };
  },

  async guardarDatos(id: string, patch: Partial<Pick<Usuario, 'nombre' | 'telefono' | 'cargo' | 'empresa_id'>>): Promise<void> {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    if (error) throw error;
  },

  /** Activa o desactiva un rol para un usuario (la asignación no se borra: queda el historial). */
  async setRol(usuarioId: string, rolId: string, activo: boolean): Promise<void> {
    const { error } = await supabase.from('usuario_roles')
      .upsert({ usuario_id: usuarioId, rol_id: rolId, activo }, { onConflict: 'usuario_id,rol_id' });
    if (error) throw error;
  },

  /** Activa o desactiva al usuario (también bloquea o desbloquea su inicio de sesión). */
  async setActivo(usuarioId: string, activo: boolean): Promise<void> {
    await postJson(`/api/usuarios/${usuarioId}`, { activo }, 'PATCH');
  },

  async invitar(datos: { email: string; nombre: string; roles: string[] }): Promise<EnlaceDeAcceso> {
    return postJson<EnlaceDeAcceso>('/api/usuarios', datos);
  },

  /** Enlace nuevo para entrar y crear (o cambiar) la contraseña. */
  async nuevoEnlace(usuarioId: string): Promise<EnlaceDeAcceso> {
    return postJson<EnlaceDeAcceso>(`/api/usuarios/${usuarioId}/enlace`, {});
  },
};

export const rolesService = {
  async crear(datos: { nombre: string; descripcion?: string; permisos: string[] }): Promise<Rol> {
    const { data, error } = await supabase.from('roles')
      .insert({ nombre: datos.nombre.trim(), descripcion: datos.descripcion?.trim() || null, permisos: datos.permisos })
      .select('id, clave, nombre, descripcion, permisos, protegido, activo').single();
    if (error) throw error;
    return data as Rol;
  },

  async guardar(id: string, datos: { nombre: string; descripcion?: string | null; permisos?: string[] }): Promise<void> {
    const patch: Record<string, unknown> = { nombre: datos.nombre.trim(), descripcion: datos.descripcion?.trim() || null };
    if (datos.permisos) patch.permisos = datos.permisos;
    const { error } = await supabase.from('roles').update(patch).eq('id', id);
    if (error) throw error;
  },

  async setActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await supabase.from('roles').update({ activo }).eq('id', id);
    if (error) throw error;
  },
};
