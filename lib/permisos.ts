import { encendido } from '@/lib/modulos';

/**
 * Catálogo de permisos (modelo de TecApp adaptado a InnVolt).
 * ─────────────────────────────────────────────────────────────────────────────
 * Un permiso es una clave `modulo.accion`. Los roles guardan la lista de claves;
 * el Administrador tiene '*'. La base de datos exige estas mismas claves en cada
 * tabla (supabase_fase1_usuarios_permisos.sql → tiene_permiso), así que esconder
 * un botón es comodidad: la seguridad real está en el servidor.
 *
 * Al agregar un módulo nuevo: sumar aquí sus permisos (y en la plantilla de los
 * roles base, aquí y en el SQL), y exigirlos en sus tablas.
 */

export interface PermisoDef { clave: string; nombre: string; ayuda?: string }
export interface ModuloDef { modulo: string; nombre: string; permisos: PermisoDef[] }
export interface AreaDef { area: string; modulos: ModuloDef[] }

const TODO: AreaDef[] = [
  { area: 'Comercial', modulos: [
    { modulo: 'solicitudes', nombre: 'Solicitudes', permisos: [
      { clave: 'solicitudes.ver', nombre: 'Ver' },
      { clave: 'solicitudes.crear', nombre: 'Crear y editar' },
      { clave: 'solicitudes.anular', nombre: 'Eliminar' },
    ] },
    { modulo: 'cotizaciones', nombre: 'Cotizaciones', permisos: [
      { clave: 'cotizaciones.ver', nombre: 'Ver' },
      { clave: 'cotizaciones.crear', nombre: 'Crear, editar y enviar' },
      { clave: 'cotizaciones.aprobar', nombre: 'Anotar la respuesta del cliente', ayuda: 'Aprobada o rechazada; también plantillas y ajustes de cotización' },
      { clave: 'cotizaciones.ver_costos', nombre: 'Ver costos y márgenes' },
      { clave: 'cotizaciones.anular', nombre: 'Anular (heredado)', ayuda: 'Anular lo hace «Crear»; una aprobada pide «Crear» y «Aprobar»' },
    ] },
    { modulo: 'clientes', nombre: 'Clientes', permisos: [
      { clave: 'clientes.ver', nombre: 'Ver' },
      { clave: 'clientes.crear', nombre: 'Crear y editar' },
      { clave: 'clientes.anular', nombre: 'Eliminar' },
    ] },
    { modulo: 'plantillas', nombre: 'Plantillas de cotización', permisos: [
      { clave: 'plantillas.gestionar', nombre: 'Crear, editar y eliminar' },
    ] },
    { modulo: 'proyectos', nombre: 'Proyectos', permisos: [
      { clave: 'proyectos.ver', nombre: 'Ver' },
      { clave: 'proyectos.gestionar', nombre: 'Crear y editar' },
    ] },
    { modulo: 'traslados', nombre: 'Traslados', permisos: [
      { clave: 'traslados.ver', nombre: 'Ver la lista y cotizar traslados' },
      { clave: 'traslados.gestionar', nombre: 'Editar comunas, bases y tarifa' },
    ] },
  ] },
  { area: 'Operación', modulos: [
    { modulo: 'agenda', nombre: 'Agenda', permisos: [
      { clave: 'agenda.ver', nombre: 'Ver' },
      { clave: 'agenda.gestionar', nombre: 'Agendar, editar y eliminar' },
    ] },
    { modulo: 'ot', nombre: 'Órdenes de trabajo', permisos: [
      { clave: 'ot.ver', nombre: 'Ver todas' },
      { clave: 'ot.crear', nombre: 'Crear, asignar y coordinar' },
      { clave: 'ot.ejecutar', nombre: 'Ejecutar las asignadas', ayuda: 'Ver sus OT, avanzar estados, hacer informes con firma' },
      { clave: 'ot.cerrar', nombre: 'Cerrar y anular' },
    ] },
    { modulo: 'tareas', nombre: 'Tareas', permisos: [
      { clave: 'tareas.ver', nombre: 'Ver todas', ayuda: 'Sin esto, cada uno ve las suyas' },
      { clave: 'tareas.gestionar', nombre: 'Crear y asignar a otros' },
    ] },
    { modulo: 'bodega', nombre: 'Bodega', permisos: [
      { clave: 'bodega.ver', nombre: 'Ver stock y movimientos' },
      { clave: 'bodega.mover', nombre: 'Registrar entradas y salidas' },
      { clave: 'bodega.ajustar', nombre: 'Ajustar stock y crear bodegas' },
    ] },
  ] },
  { area: 'Finanzas', modulos: [
    { modulo: 'facturacion', nombre: 'Por facturar y cobranza', permisos: [
      { clave: 'facturacion.ver', nombre: 'Ver' },
      { clave: 'facturacion.gestionar', nombre: 'Registrar OC, HES, facturas y pagos' },
    ] },
    { modulo: 'gastos', nombre: 'Gastos y rendiciones', permisos: [
      { clave: 'gastos.crear', nombre: 'Rendir mis gastos (en una OT)' },
      { clave: 'gastos.ver_todos', nombre: 'Ver los de todos' },
      { clave: 'gastos.aprobar', nombre: 'Pagar rendiciones y entregar anticipos' },
    ] },
  ] },
  { area: 'Mi empresa', modulos: [
    { modulo: 'dashboard', nombre: 'Panel comercial', permisos: [
      { clave: 'dashboard.ver', nombre: 'Ver ventas e indicadores' },
    ] },
    { modulo: 'biblioteca', nombre: 'Biblioteca de precios', permisos: [
      { clave: 'biblioteca.ver', nombre: 'Ver' },
      { clave: 'biblioteca.editar', nombre: 'Editar y sincronizar' },
    ] },
    { modulo: 'ia', nombre: 'Inteligencia artificial', permisos: [
      { clave: 'ia.usar', nombre: 'Usar la IA', ayuda: 'Cotizar, analizar solicitudes y armar recetas con IA' },
    ] },
    { modulo: 'configuracion', nombre: 'Configuración', permisos: [
      { clave: 'configuracion.gestionar', nombre: 'Cambiar la configuración' },
    ] },
    { modulo: 'usuarios', nombre: 'Usuarios', permisos: [
      { clave: 'usuarios.ver', nombre: 'Ver' },
      { clave: 'usuarios.gestionar', nombre: 'Invitar, dar roles y desactivar' },
    ] },
    { modulo: 'roles', nombre: 'Roles', permisos: [
      { clave: 'roles.gestionar', nombre: 'Crear y editar roles' },
    ] },
    { modulo: 'personas', nombre: 'Personas', permisos: [
      { clave: 'personas.ver', nombre: 'Ver competencias y organigrama' },
      { clave: 'personas.gestionar', nombre: 'Editar competencias, certificaciones y organigrama' },
    ] },
    { modulo: 'auditoria', nombre: 'Auditoría', permisos: [
      { clave: 'auditoria.ver', nombre: 'Ver quién hizo qué' },
    ] },
  ] },
];

/** Lo que se muestra en Roles: sin los módulos apagados (lib/modulos.ts). */
export const CATALOGO: AreaDef[] = TODO
  .map(a => ({ ...a, modulos: a.modulos.filter(m => encendido(m.modulo)) }))
  .filter(a => a.modulos.length > 0);

export const TODAS_LAS_CLAVES = CATALOGO.flatMap(a => a.modulos.flatMap(m => m.permisos.map(p => p.clave)));

/** Plantilla de cada rol base (igual al SQL). Lo de la plantilla no se quita del rol base. */
export const PLANTILLAS_BASE: Record<string, string[]> = {
  admin: ['*'],
  comercial: ['solicitudes.ver', 'solicitudes.crear', 'cotizaciones.ver', 'cotizaciones.crear', 'cotizaciones.aprobar',
    'cotizaciones.ver_costos', 'clientes.ver', 'clientes.crear', 'plantillas.gestionar', 'agenda.ver',
    'agenda.gestionar', 'levantamientos.ver', 'dashboard.ver', 'biblioteca.ver', 'ia.usar',
    'ot.ver', 'ot.crear', 'facturacion.ver', 'tareas.ver', 'tareas.gestionar', 'proyectos.ver', 'proyectos.gestionar', 'traslados.ver'],
  administrativo: ['solicitudes.ver', 'solicitudes.crear', 'cotizaciones.ver', 'cotizaciones.crear', 'cotizaciones.aprobar',
    'cotizaciones.ver_costos', 'clientes.ver', 'clientes.crear', 'agenda.ver', 'dashboard.ver',
    'biblioteca.ver', 'biblioteca.editar', 'plantillas.gestionar', 'ia.usar',
    'ot.ver', 'ot.crear', 'ot.cerrar', 'facturacion.ver', 'facturacion.gestionar', 'bodega.ver', 'bodega.mover',
    'bodega.ajustar', 'gastos.crear', 'gastos.ver_todos', 'gastos.aprobar', 'tareas.ver', 'tareas.gestionar',
    'proyectos.ver', 'proyectos.gestionar', 'personas.ver', 'personas.gestionar', 'traslados.ver', 'traslados.gestionar'],
  tecnico: ['solicitudes.ver', 'cotizaciones.ver', 'clientes.ver', 'agenda.ver', 'agenda.gestionar',
    'levantamientos.ver', 'levantamientos.crear', 'biblioteca.ver', 'ot.ejecutar', 'bodega.ver', 'bodega.mover', 'gastos.crear', 'traslados.ver'],
  solo_lectura: ['solicitudes.ver', 'cotizaciones.ver', 'clientes.ver', 'agenda.ver', 'levantamientos.ver',
    'biblioteca.ver', 'dashboard.ver', 'ot.ver', 'facturacion.ver', 'bodega.ver', 'tareas.ver', 'proyectos.ver', 'personas.ver', 'traslados.ver'],
};

/** ¿La lista de permisos incluye la clave? ('*' = todos). */
export const incluye = (permisos: readonly string[], clave: string) =>
  permisos.includes('*') || permisos.includes(clave);

/** ¿Incluye al menos una de las claves? */
export const incluyeAlguno = (permisos: readonly string[], claves: readonly string[]) =>
  permisos.includes('*') || claves.some(c => permisos.includes(c));

/**
 * Permiso necesario para entrar a cada pantalla (la primera ruta que calce).
 * Una lista = basta con uno de ellos.
 */
export const PERMISO_DE_RUTA: { prefijo: string; permisos: string[] }[] = [
  { prefijo: '/dashboard', permisos: ['dashboard.ver'] },
  { prefijo: '/solicitudes', permisos: ['solicitudes.ver'] },
  { prefijo: '/cotizador/historial', permisos: ['cotizaciones.ver'] },
  { prefijo: '/cotizador/plantillas', permisos: ['cotizaciones.aprobar'] },
  { prefijo: '/cotizador/ajustes', permisos: ['cotizaciones.aprobar'] },
  { prefijo: '/cotizador/utilidad', permisos: ['cotizaciones.aprobar'] },
  { prefijo: '/cotizador', permisos: ['cotizaciones.crear', 'cotizaciones.ver'] },
  { prefijo: '/agenda', permisos: ['agenda.ver'] },
  { prefijo: '/clientes', permisos: ['clientes.ver'] },
  { prefijo: '/biblioteca', permisos: ['biblioteca.ver'] },
  { prefijo: '/configuracion', permisos: ['configuracion.gestionar'] },
  { prefijo: '/ordenes', permisos: ['ot.ver', 'ot.ejecutar'] },
  { prefijo: '/mis-ot', permisos: ['ot.ejecutar', 'ot.ver', 'ot.crear'] },
  { prefijo: '/facturacion', permisos: ['facturacion.ver', 'facturacion.gestionar'] },
  { prefijo: '/bodega', permisos: ['bodega.ver', 'bodega.mover'] },
  { prefijo: '/gastos', permisos: ['gastos.crear', 'gastos.ver_todos', 'gastos.aprobar'] },
  { prefijo: '/usuarios', permisos: ['usuarios.ver', 'usuarios.gestionar'] },
  { prefijo: '/roles', permisos: ['roles.gestionar', 'usuarios.gestionar'] },
  { prefijo: '/auditoria', permisos: ['auditoria.ver'] },
  { prefijo: '/proyectos', permisos: ['proyectos.ver', 'proyectos.gestionar'] },
  { prefijo: '/trabajos', permisos: ['cotizaciones.ver'] },
  { prefijo: '/plantillas-informe', permisos: ['cotizaciones.aprobar', 'configuracion.gestionar'] },
  { prefijo: '/personas', permisos: ['personas.ver', 'personas.gestionar'] },
  { prefijo: '/traslados', permisos: ['traslados.ver', 'traslados.gestionar'] },
];

export function permisosDeRuta(pathname: string): string[] | null {
  const r = PERMISO_DE_RUTA.find(x => pathname === x.prefijo || pathname.startsWith(x.prefijo + '/') || pathname.startsWith(x.prefijo + '?'));
  return r ? r.permisos : null;
}
