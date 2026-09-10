/**
 * Generación de invitaciones ICS (RFC 5545) para las reuniones del CRM
 * (FASE-09 §4.5). Extraído de `meetingsService.ts` en la ronda 3 para que ese
 * archivo vuelva por debajo de las 300 líneas; el comportamiento es idéntico,
 * incluido el plegado a 75 octetos sin partir UTF-8 (F9-28).
 */
/** ICS mínimo RFC 5545 (METHOD:REQUEST). Sin uso hasta que F7 exponga adjuntos. */
export function buildIcs(e: {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  organizerEmail: string;
  organizerName?: string;
  attendees: string[];
}): string {
  const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GoAdmin//CRM//ES',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}@goadmin.io`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(e.startAt)}`,
    `DTEND:${utc(e.endAt)}`,
    `SUMMARY:${esc(e.title)}`,
    e.description ? `DESCRIPTION:${esc(e.description)}` : '',
    e.location ? `LOCATION:${esc(e.location)}` : '',
    `ORGANIZER;CN=${esc(e.organizerName ?? 'GoAdmin')}:mailto:${e.organizerEmail}`,
    ...e.attendees.map((a) => `ATTENDEE;RSVP=TRUE:mailto:${a}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  // F9-28: RFC 5545 3.1 - ninguna linea puede superar 75 octetos; el resto se
  // pliega con CRLF + un espacio, cortando por octetos (no por caracteres UTF-16).
  return lines.flatMap(foldIcsLine).join(CRLF);
}

const CRLF = '\r\n';

/** Plegado RFC 5545 de una linea en trozos de <=75 octetos (los siguientes con 1 espacio). */
export function foldIcsLine(line: string): string[] {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return [line];
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // no partir un caracter multibyte: retroceder al inicio de la secuencia
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((out.length ? ' ' : '') + bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // las lineas plegadas llevan un espacio inicial
  }
  return out;
}
