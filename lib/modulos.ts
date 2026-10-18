/**
 * Módulos apagados: no se ven en el menú, no se abren por la dirección, sus permisos no
 * aparecen en Roles y sus secciones se esconden en las otras pantallas (OT, Mi día, Mi cuenta).
 * Los datos y las tablas siguen en la base: para encender uno, quítalo de esta lista.
 *
 *  · bodega   — stock, movimientos, pedidos de material y catastro (InnVolt aún no tiene stock;
 *               el material de cada trabajo se rinde como gasto de la OT).
 *  · personas — competencias y organigrama (para equipos grandes).
 */
export const MODULOS_APAGADOS: readonly string[] = ['bodega', 'personas'];

export const encendido = (modulo: string) => !MODULOS_APAGADOS.includes(modulo);

/** Direcciones de cada módulo que se puede apagar. */
const RUTAS: Record<string, string[]> = {
  bodega: ['/bodega'],
  personas: ['/personas'],
};

/** ¿La dirección es de un módulo apagado? */
export function rutaApagada(pathname: string): boolean {
  return MODULOS_APAGADOS.some(m => (RUTAS[m] || []).some(r => pathname === r || pathname.startsWith(r + '/')));
}
