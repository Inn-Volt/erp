/**
 * Logo para los documentos (PDF y página pública de la cotización).
 * InnVolt usa SIEMPRE el logo oficial del kit de marca (el mismo de innvolt.cl): el que se haya
 * subido antes en «Mi empresa» es el antiguo y ya no manda. Otras empresas emisoras usan el suyo.
 * Los archivos tienen nombre propio para que ningún navegador muestre una copia vieja guardada.
 */

export const LOGO_DOC_CLARO = '/logos/innvolt-documento-claro.png';   // para papel / fondo claro
export const LOGO_DOC_OSCURO = '/logos/innvolt-documento-oscuro.png'; // para fondo oscuro

export const esInnVolt = (nombre?: string | null) => (nombre || '').toLowerCase().replace(/[^a-z]/g, '').includes('innvolt');

export function logoDocumento(empresa: { nombre?: string | null; logo_url?: string | null }, opciones: { fondo?: 'claro' | 'oscuro'; absoluto?: boolean } = {}): string {
  if (esInnVolt(empresa.nombre)) {
    const ruta = opciones.fondo === 'oscuro' ? LOGO_DOC_OSCURO : LOGO_DOC_CLARO;
    return opciones.absoluto && typeof window !== 'undefined' ? window.location.origin + ruta : ruta;
  }
  return empresa.logo_url || '';
}
