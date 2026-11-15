/**
 * Evento privado de un lead del sitio web (Figma «CRM · Lead de evento privado
 * del sitio», sección 1951:941568). Sin React ni Supabase: lo usan la hoja de
 * detalle rápido (navegador) y `GET /api/crm/leads/[id]/evento` (servidor).
 *
 * De dónde sale: `web_capture_lead` (sobrecarga con sede, migraciones D6 y
 * D6b) anexa cada envío del formulario a `customers.metadata.lead.capturas`
 * (las 20 últimas) con `form`, `branch_id`, `details` y `captured_at`. El
 * evento es la ÚLTIMA captura del formulario de eventos privados; un lead sin
 * ninguna no tiene tarjeta.
 *
 * Todo lo que viene de `metadata` se trata como no confiable: cada campo se
 * valida por tipo y forma, y lo que no cuadra se descarta.
 */

export const FORMULARIO_EVENTOS_PRIVADOS = 'private_events';

export interface EventoPrivadoLead {
  /** Sede elegida en el sitio (null: «Sin sede elegida»). */
  branchId: number | null;
  tipo: string | null;
  /** Día calendario `YYYY-MM-DD` (columna lógica `date`: se pinta sin zona). */
  fecha: string | null;
  invitados: number | null;
  /** Presupuesto por persona tal como se eligió (p. ej. un rango). */
  presupuestoTexto: string | null;
  /** Presupuesto por persona numérico (formularios con un valor único). */
  presupuestoNumero: number | null;
  lugar: string | null;
  mensaje: string | null;
  /** Instante de la captura en ISO 8601 (`timestamptz`). */
  capturadoEn: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function fechaPlana(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [a, m, d] = v.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? v : null;
}

function entero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * `to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')` produce «…+00» o «…-05»; el
 * offset de solo horas no es ISO para `Date.parse` en todos los motores.
 */
export function instanteCaptura(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const iso = /[+-]\d{2}$/.test(v) ? `${v}:00` : v;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function esCapturaDeEvento(c: Record<string, unknown>): boolean {
  if (c.form === FORMULARIO_EVENTOS_PRIVADOS) return true;
  const d = c.details;
  return c.form == null && esObjeto(d) && ('event_type' in d || 'event_date' in d || 'guests' in d);
}

/** Última captura del formulario de eventos privados, o null (sin tarjeta). */
export function eventoPrivadoDeLead(metadataLead: unknown): EventoPrivadoLead | null {
  if (!esObjeto(metadataLead) || !Array.isArray(metadataLead.capturas)) return null;
  const capturas = metadataLead.capturas.filter(esObjeto);
  for (let i = capturas.length - 1; i >= 0; i--) {
    const c = capturas[i];
    if (!esCapturaDeEvento(c)) continue;
    const d = esObjeto(c.details) ? c.details : {};
    return {
      branchId: entero(c.branch_id, 1, Number.MAX_SAFE_INTEGER),
      tipo: texto(d.event_type, 60),
      fecha: fechaPlana(d.event_date),
      invitados: entero(d.guests, 1, 5000),
      presupuestoTexto: texto(d.budget_label, 60),
      presupuestoNumero: numero(d.budget_per_person),
      lugar: texto(d.venue, 120),
      mensaje: texto(d.message, 2000),
      capturadoEn: instanteCaptura(c.captured_at),
    };
  }
  return null;
}

/** «Nuevo» en la actividad: nadie ha contactado al lead después de la solicitud. */
export function solicitudSinAtender(capturadoEn: string | null, ultimoContacto: string | null | undefined): boolean {
  if (!capturadoEn) return false;
  if (!ultimoContacto) return true;
  const c = Date.parse(capturadoEn);
  const u = Date.parse(ultimoContacto);
  return Number.isNaN(u) || u < c;
}

/**
 * Fecha que precarga «Crear reserva de grupo»: la del evento si no ya pasó;
 * si pasó o no hay, la de hoy (la reserva no se puede crear en el pasado).
 */
export function fechaInicialReserva(fechaEvento: string | null, hoy: string): string {
  return fechaEvento && fechaEvento >= hoy ? fechaEvento : hoy;
}

/** Personas que precarga la reserva (el formulario admite 1..200). */
export function personasInicialesReserva(invitados: number | null): number {
  if (!invitados) return 2;
  return Math.min(200, Math.max(1, invitados));
}

/** Respuesta de `GET /api/crm/leads/[id]/evento`. */
export interface ContextoEventoLead {
  /** Sede de la última solicitud de evento (nombre resuelto en el servidor). */
  sede: { id: number; nombre: string } | null;
  /** Reservas de restaurante del cliente con `status = no_show`. */
  inasistencias: { total: number; ultima: { fecha: string; sede: string | null } | null };
}
