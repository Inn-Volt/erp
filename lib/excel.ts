/**
 * Descargar un Excel con una o varias hojas (la librería se carga solo al usarla).
 * Cada hoja es una lista de filas { columna: valor }; el orden de las columnas es el de la primera fila.
 */
export async function descargarExcel(hojas: { nombre: string; filas: Record<string, unknown>[] }[], archivo: string) {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  for (const h of hojas) {
    const ws = XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ '': 'Sin datos' }]);
    // Ancho de columnas según el contenido (máx. 60).
    const cols = Object.keys(h.filas[0] || { '': '' });
    ws['!cols'] = cols.map(c => ({ wch: Math.min(60, Math.max(c.length, ...h.filas.map(f => String(f[c] ?? '').length)) + 2) }));
    // Excel no acepta en el nombre de la hoja : \ / ? * [ ] ni más de 31 caracteres.
    XLSX.utils.book_append_sheet(libro, ws, h.nombre.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
  }
  XLSX.writeFile(libro, archivo);
}
