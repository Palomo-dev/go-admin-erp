// ============================================================
// Formatos puros de los reportes de ventas (sin zona del navegador).
//
// - `etiquetaFranja(hora)`: la franja de una hora local de la organización
//   como se lee en Colombia: «8:00 – 9:00 p. m.», «11:00 a. m. – 12:00 p. m.».
//   La hora ya viene en la zona de la organización (las RPC agrupan con
//   `fn_timezone_for`): aquí no se convierte nada.
// - `fechaHoraLocal(ts)`: un `timestamp without time zone` que la RPC ya pasó
//   a la hora local de la organización (`'2026-11-22T20:05:09'`). No pasa por
//   `Date`: con `new Date()` el navegador lo leería en SU zona y, fuera de
//   Colombia, correría la hora (docs/reglas-fechas-timezone.md).
// ============================================================

const AM = 'a. m.';
const PM = 'p. m.';

function partes12(hora: number): { h: number; sufijo: string } {
  const h24 = ((hora % 24) + 24) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h, sufijo: h24 < 12 ? AM : PM };
}

/** Hora entera (0–23) válida, o null. */
function horaValida(hora: unknown): number | null {
  const n = typeof hora === 'number' ? hora : typeof hora === 'string' && hora.trim() !== '' ? Number(hora) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

/**
 * «8:00 – 9:00 p. m.» para la hora 20. Si la franja cruza el mediodía o la
 * medianoche, cada punta lleva su sufijo: «11:00 a. m. – 12:00 p. m.».
 */
export function etiquetaFranja(hora: unknown): string {
  const h = horaValida(hora);
  if (h === null) return '—';
  const desde = partes12(h);
  const hasta = partes12(h + 1);
  return desde.sufijo === hasta.sufijo
    ? `${desde.h}:00 – ${hasta.h}:00 ${hasta.sufijo}`
    : `${desde.h}:00 ${desde.sufijo} – ${hasta.h}:00 ${hasta.sufijo}`;
}

const TS_LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

/**
 * «22/11/2026 8:05 p. m.» de un instante local sin zona (`YYYY-MM-DDTHH:mm[:ss[.ffffff]]`).
 * Lo que no tenga esa forma sale tal cual (o «—» si viene vacío).
 */
export function fechaHoraLocal(ts: unknown): string {
  if (ts === null || ts === undefined || ts === '') return '—';
  const m = TS_LOCAL.exec(String(ts));
  if (!m) return String(ts);
  const [, anio, mes, dia, hh, mm] = m;
  const { h, sufijo } = partes12(Number(hh));
  return `${dia}/${mes}/${anio} ${h}:${mm} ${sufijo}`;
}
