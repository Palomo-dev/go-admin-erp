/**
 * Fechas del kit CRM, sin React (docs/reglas-fechas-timezone.md).
 *
 * - Un instante (`timestamptz`: `next_contact_at`, `last_contact_at`,
 *   `occurred_at`) se lleva al día calendario de la zona de la organización con
 *   `toPlainDate` y se formatea con `formatDateInTz` / `formatTimeInTz`.
 * - Un día calendario (`date`: `expected_close_date`, `effective_date`) no se
 *   convierte: se pinta a mediodía UTC para que ningún desfase lo corra.
 *
 * La zona nunca se cablea: la pasa el componente, que la lee de
 * `useFormatDate()` (contexto de la organización).
 */
import { addPlainDays, formatDateInTz, formatTimeInTz, plainDateToInstant, toPlainDate } from '@/lib/utils/dateDisplay';
import { localeIntl } from '@/components/kit/idioma';

/** Instante válido o null. */
export function aInstante(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = typeof valor === 'string' ? new Date(valor) : valor;
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Días calendario de `desde` a `hasta` (YYYY-MM-DD); positivo si `hasta` es posterior. */
export function diasEntrePlanos(desde: string, hasta: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(desde);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hasta);
  if (!a || !b) return 0;
  const ua = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const ub = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((ub - ua) / 86_400_000);
}

/** Día relativo de un instante frente a «ahora», ambos en la zona de la organización. */
export type DiaRelativo =
  | { tipo: 'hoy'; hora: string }
  | { tipo: 'manana'; hora: string }
  | { tipo: 'ayer'; hora: string }
  | { tipo: 'futuro'; dias: number; hora: string }
  | { tipo: 'pasado'; dias: number; hora: string };

export function diaRelativo(valor: string | Date | null | undefined, ahora: Date, zona: string): DiaRelativo | null {
  const instante = aInstante(valor);
  if (!instante) return null;
  const dias = diasEntrePlanos(toPlainDate(ahora, zona), toPlainDate(instante, zona));
  const hora = formatTimeInTz(instante, zona);
  if (dias === 0) return { tipo: 'hoy', hora };
  if (dias === 1) return { tipo: 'manana', hora };
  if (dias === -1) return { tipo: 'ayer', hora };
  return dias > 0 ? { tipo: 'futuro', dias, hora } : { tipo: 'pasado', dias: -dias, hora };
}

/** true si el instante ya pasó (vencido). */
export function yaPaso(valor: string | Date | null | undefined, ahora: Date): boolean {
  const instante = aInstante(valor);
  return !!instante && instante.getTime() < ahora.getTime();
}

/** Días calendario transcurridos desde un instante hasta hoy, en la zona (≥ 0). */
export function diasDesde(valor: string | Date | null | undefined, ahora: Date, zona: string): number | null {
  const instante = aInstante(valor);
  if (!instante) return null;
  return Math.max(0, diasEntrePlanos(toPlainDate(instante, zona), toPlainDate(ahora, zona)));
}

/** Fecha corta de un instante en la zona («23 sep.», «Sep 23»). */
export function fechaCortaInstante(valor: string | Date | null | undefined, zona: string, idioma: string): string {
  const instante = aInstante(valor);
  if (!instante) return '';
  return formatDateInTz(instante, zona, { locale: localeIntl(idioma), day: 'numeric', month: 'short' });
}

/** Fecha corta de un día calendario (`date`), sin conversión de zona. */
export function fechaCortaPlana(plano: string | null | undefined, idioma: string, conAnio = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(plano ?? '');
  if (!m) return '';
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat(localeIntl(idioma), {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(conAnio ? { year: 'numeric' } : {}),
  }).format(fecha);
}

/** Día calendario de hoy + N en la zona de la organización. */
export function hoyMasDias(ahora: Date, zona: string, dias: number): string {
  return addPlainDays(toPlainDate(ahora, zona), dias);
}

/** Hora de pared «HH:mm» (24 h) de un instante en la zona de la organización. */
export function horaEnZona(valor: string | Date | null | undefined, zona: string): string {
  const instante = aInstante(valor);
  if (!instante) return '';
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instante);
  const h = partes.find((p) => p.type === 'hour')?.value ?? '00';
  const m = partes.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

/**
 * Instante → valor de `<input type="datetime-local">` en la zona de la
 * organización («2026-09-24T10:00»). Vacío si no hay instante.
 */
export function aFechaHoraLocal(valor: string | Date | null | undefined, zona: string): string {
  const instante = aInstante(valor);
  return instante ? `${toPlainDate(instante, zona)}T${horaEnZona(instante, zona)}` : '';
}

/**
 * Valor de `datetime-local` («2026-09-24T10:00», hora de pared de la
 * organización) → ISO con offset. null si está vacío o mal formado.
 */
export function deFechaHoraLocal(local: string | null | undefined, zona: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec((local ?? '').trim());
  return m ? plainDateToInstant(m[1], zona, m[2]) : null;
}
