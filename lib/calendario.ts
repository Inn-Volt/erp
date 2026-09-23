// ══════════════════════════════════════════════════════════════════════════════
// Exportar un agendamiento al calendario del dispositivo.
//   · Google Calendar (link prellenado) → ideal para Android.
//   · Archivo .ics (descarga)            → Apple Calendar (iPhone) y cualquier otro.
// Sin dependencias ni backend: se arma en el navegador.
// ══════════════════════════════════════════════════════════════════════════════

export interface EventoCalendario {
  titulo: string;
  direccion?: string | null;
  fecha: string;            // YYYY-MM-DD
  horaInicio?: string | null; // HH:MM (o HH:MM:SS)
  horaFin?: string | null;
  notas?: string | null;
  folio?: number;
}

function hhmm(h?: string | null): string | null {
  if (!h) return null;
  const m = h.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}${m[2]}00` : null; // HHMMSS
}

function ymd(fecha: string): string {
  return fecha.replace(/-/g, ''); // YYYYMMDD
}

/** YYYYMMDD del día siguiente (para eventos de día completo). */
function ymdSiguiente(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Suma 1 hora a un HHMMSS (para el fin por defecto si no hay hora_fin). */
function masUnaHora(hms: string): string {
  const h = (parseInt(hms.slice(0, 2), 10) + 1) % 24;
  return `${String(h).padStart(2, '0')}${hms.slice(2)}`;
}

/** Calcula inicio/fin en formato de calendario. */
function rango(ev: EventoCalendario): { start: string; end: string; allDay: boolean } {
  const ini = hhmm(ev.horaInicio);
  if (!ini) {
    return { start: ymd(ev.fecha), end: ymdSiguiente(ev.fecha), allDay: true };
  }
  const fin = hhmm(ev.horaFin) || masUnaHora(ini);
  return { start: `${ymd(ev.fecha)}T${ini}`, end: `${ymd(ev.fecha)}T${fin}`, allDay: false };
}

/** URL de Google Calendar con el evento prellenado. */
export function googleCalendarUrl(ev: EventoCalendario): string {
  const { start, end } = rango(ev);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.titulo,
    dates: `${start}/${end}`,
  });
  if (ev.direccion) p.set('location', ev.direccion);
  if (ev.notas) p.set('details', ev.notas);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Construye el contenido de un archivo .ics para el evento. */
export function construirICS(ev: EventoCalendario): string {
  const { start, end, allDay } = rango(ev);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const uid = `innvolt-${ev.folio ?? Date.now()}@innvolt.cl`;
  const dt = allDay
    ? [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`]
    : [`DTSTART:${start}`, `DTEND:${end}`];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InnVolt ERP//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    ...dt,
    `SUMMARY:${escapeICS(ev.titulo)}`,
    ev.direccion ? `LOCATION:${escapeICS(ev.direccion)}` : '',
    ev.notas ? `DESCRIPTION:${escapeICS(ev.notas)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

/** Descarga el .ics en el navegador. */
export function descargarICS(ev: EventoCalendario): void {
  const blob = new Blob([construirICS(ev)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `visita-${ev.folio ?? 'innvolt'}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
