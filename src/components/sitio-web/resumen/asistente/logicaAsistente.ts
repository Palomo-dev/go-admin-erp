/**
 * Lógica pura del asistente de creación del sitio (Figma A/03): horario de la
 * sede agrupado por días, hora de pared en 12 h y color de acento del logo.
 * Sin React ni DOM: las pruebas la ejercitan directamente.
 */

export const DIAS_SEMANA = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export interface FilaHorario {
  desde: DiaSemana;
  hasta: DiaSemana;
  /** `null` = cerrado. */
  abre: string | null;
  cierra: string | null;
}

const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function franja(valor: unknown): { abre: string | null; cierra: string | null } {
  if (!valor || typeof valor !== 'object') return { abre: null, cierra: null };
  const v = valor as { open?: unknown; close?: unknown; closed?: unknown };
  if (v.closed === true) return { abre: null, cierra: null };
  const abre = typeof v.open === 'string' && HORA.test(v.open) ? v.open : null;
  const cierra = typeof v.close === 'string' && HORA.test(v.close) ? v.close : null;
  return abre && cierra ? { abre, cierra } : { abre: null, cierra: null };
}

/**
 * `branches.opening_hours` ({ monday: { open, close, closed } … }) → filas por
 * días consecutivos con el mismo horario («Lunes a viernes 9:00 a. m. – 6:00
 * p. m.»). `[]` si no hay horario.
 */
export function filasHorario(horario: unknown): FilaHorario[] {
  if (!horario || typeof horario !== 'object' || Array.isArray(horario)) return [];
  const h = horario as Record<string, unknown>;
  if (!DIAS_SEMANA.some((d) => d in h)) return [];
  const filas: FilaHorario[] = [];
  for (const dia of DIAS_SEMANA) {
    const f = franja(h[dia]);
    const ultima = filas[filas.length - 1];
    if (ultima && ultima.abre === f.abre && ultima.cierra === f.cierra) ultima.hasta = dia;
    else filas.push({ desde: dia, hasta: dia, ...f });
  }
  return filas;
}

/** «18:00» → «6:00 p. m.» en el idioma dado. Es hora de pared (no un instante): no se convierte de zona. */
export function hora12(hhmm: string, locale: string): string {
  const m = HORA.exec(hhmm);
  if (!m) return hhmm;
  const fecha = new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2])));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(fecha);
}

/**
 * Color de acento de un logo a partir de sus píxeles RGBA: el tono más
 * frecuente entre los píxeles opacos y con color (se descartan los casi
 * blancos, casi negros y grises, que son fondo o texto). `null` si el logo no
 * tiene color (monocromo).
 */
export function colorDeAcento(pixeles: ArrayLike<number>): string | null {
  const cubetas = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixeles.length; i += 4) {
    const r = pixeles[i];
    const g = pixeles[i + 1];
    const b = pixeles[i + 2];
    const a = pixeles[i + 3];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40 || min > 225) continue;
    const saturacion = max === 0 ? 0 : (max - min) / max;
    if (saturacion < 0.25) continue;
    const clave = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const c = cubetas.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n += 1;
    c.r += r;
    c.g += g;
    c.b += b;
    cubetas.set(clave, c);
  }
  let mejor: { n: number; r: number; g: number; b: number } | null = null;
  for (const c of Array.from(cubetas.values())) if (!mejor || c.n > mejor.n) mejor = c;
  if (!mejor) return null;
  const hex = (v: number) => Math.round(v / mejor!.n).toString(16).padStart(2, '0');
  return `#${hex(mejor.r)}${hex(mejor.g)}${hex(mejor.b)}`.toUpperCase();
}
