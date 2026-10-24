/**
 * RUT chileno: validación del dígito verificador (módulo 11) y formato 12.345.678-5.
 * La misma regla que public.rut_valido en la base (fase 15).
 */

export function limpiarRut(rut: string): string {
  return (rut || '').toUpperCase().replace(/[^0-9K]/g, '');
}

export function rutValido(rut: string | null | undefined): boolean {
  const s = limpiarRut(rut || '');
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return dv === (r === 11 ? '0' : r === 10 ? 'K' : String(r));
}

/** 12345678-5 → 12.345.678-5 (si no parece RUT, lo devuelve tal cual). */
export function formatearRut(rut: string): string {
  const s = limpiarRut(rut);
  if (s.length < 2) return rut;
  const cuerpo = s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${s.slice(-1)}`;
}

/** Mensaje para mostrar bajo el campo (null = está bien o vacío). */
export function avisoRut(rut: string | null | undefined): string | null {
  if (!(rut || '').trim()) return null;
  return rutValido(rut) ? null : 'Revisa el RUT: el dígito verificador no calza.';
}
