/**
 * Rango de días calendario (YYYY-MM-DD) del `DateRangeButton`.
 *
 * Son días PUROS: el kit no decide la zona horaria. La pantalla pasa «hoy» ya
 * calculado con `useFormatDate().getToday()` y convierte los días a instantes
 * con `toInstant` (zona de la organización) al consultar. Así nunca aparece
 * `toISOString().split('T')[0]` (docs/reglas-fechas-timezone.md).
 */
import { addPlainDays } from '@/lib/utils/dateCore';

export interface RangoFechas {
  /** Primer día incluido. */
  desde: string;
  /** Último día incluido. */
  hasta: string;
}

export type IdPresetRango = 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'mesPasado';

export interface PresetRango {
  id: IdPresetRango;
  etiqueta: string;
  rango: RangoFechas;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function esFechaPlana(valor: string | null | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** Ordena los extremos si llegan al revés. */
export function normalizarRango(r: RangoFechas): RangoFechas {
  return r.desde <= r.hasta ? r : { desde: r.hasta, hasta: r.desde };
}

function partes(fecha: string) {
  const [a, m, d] = fecha.split('-').map(Number);
  return { a, m, d };
}

/** Día plano → instante a mediodía UTC (el día no cambia al formatear en UTC). */
function aFechaUtc(fecha: string): Date {
  const { a, m, d } = partes(fecha);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

/**
 * «22 sep 2026» · «1 – 22 sep 2026» · «28 ago – 3 sep 2026» ·
 * «28 dic 2025 – 3 ene 2026». Formato del botón en Figma (680:407222).
 *
 * `locale` (el de `Intl`, p. ej. `en-US`): en otro idioma que no sea español
 * el rango lo arma `Intl.DateTimeFormat#formatRange` («Sep 1 – 22, 2026»,
 * «28 août – 3 sept. 2026»). Sin `locale`, o en español, el formato de Figma.
 */
export function etiquetaRango(rango: RangoFechas, locale?: string): string {
  const { desde, hasta } = normalizarRango(rango);
  if (locale && !/^es(-|$)/i.test(locale)) {
    try {
      const formato = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      return desde === hasta
        ? formato.format(aFechaUtc(desde))
        : formato.formatRange(aFechaUtc(desde), aFechaUtc(hasta));
    } catch {
      // Locale que `Intl` no conoce: se cae al formato en español.
    }
  }
  const i = partes(desde);
  const f = partes(hasta);
  const mesI = MESES_CORTOS[i.m - 1];
  const mesF = MESES_CORTOS[f.m - 1];
  if (desde === hasta) return `${f.d} ${mesF} ${f.a}`;
  if (i.a === f.a && i.m === f.m) return `${i.d} – ${f.d} ${mesF} ${f.a}`;
  if (i.a === f.a) return `${i.d} ${mesI} – ${f.d} ${mesF} ${f.a}`;
  return `${i.d} ${mesI} ${i.a} – ${f.d} ${mesF} ${f.a}`;
}

/** Primer día del mes de `fecha`. */
export function inicioDeMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

/** Atajos del selector, calculados sobre el «hoy» de la organización. */
export function presetsRango(hoy: string): PresetRango[] {
  const inicioMes = inicioDeMes(hoy);
  const finMesPasado = addPlainDays(inicioMes, -1);
  return [
    { id: 'hoy', etiqueta: 'Hoy', rango: { desde: hoy, hasta: hoy } },
    { id: 'ayer', etiqueta: 'Ayer', rango: { desde: addPlainDays(hoy, -1), hasta: addPlainDays(hoy, -1) } },
    { id: '7d', etiqueta: 'Últimos 7 días', rango: { desde: addPlainDays(hoy, -6), hasta: hoy } },
    { id: '30d', etiqueta: 'Últimos 30 días', rango: { desde: addPlainDays(hoy, -29), hasta: hoy } },
    { id: 'mes', etiqueta: 'Este mes', rango: { desde: inicioMes, hasta: hoy } },
    { id: 'mesPasado', etiqueta: 'Mes pasado', rango: { desde: inicioDeMes(finMesPasado), hasta: finMesPasado } },
  ];
}

/** El atajo que coincide exactamente con el rango, si hay alguno. */
export function presetDe(rango: RangoFechas, hoy: string): IdPresetRango | null {
  const r = normalizarRango(rango);
  return presetsRango(hoy).find((p) => p.rango.desde === r.desde && p.rango.hasta === r.hasta)?.id ?? null;
}
