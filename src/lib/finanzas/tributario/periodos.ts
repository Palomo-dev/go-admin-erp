/**
 * Periodos fiscales del tributario (Finanzas R4-A). Solo días calendario
 * `YYYY-MM-DD` y meses `YYYY-MM`: nada de instantes ni de zona horaria aquí.
 * El día de hoy lo pone quien llama, con el de la organización (`todayInTz`).
 */

export const PERIODICIDADES = ['mensual', 'bimestral', 'cuatrimestral', 'semestral', 'anual'] as const;
export type Periodicidad = (typeof PERIODICIDADES)[number];

export interface PeriodoFiscal {
  periodicidad: Periodicidad;
  anio: number;
  /** 1..12 meses, 1..6 bimestres, 1..3 cuatrimestres, 1..2 semestres, 1 anual. */
  indice: number;
  desde: string;
  hasta: string;
}

const MESES: Record<Periodicidad, number> = { mensual: 1, bimestral: 2, cuatrimestral: 4, semestral: 6, anual: 12 };
const MES_RE = /^(\d{4})-(\d{2})$/;
const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function mesesDePeriodicidad(p: Periodicidad): number {
  return MESES[p];
}

export function esPeriodicidad(v: unknown): v is Periodicidad {
  return typeof v === 'string' && (PERIODICIDADES as readonly string[]).includes(v);
}

const dos = (n: number) => String(n).padStart(2, '0');

export function ultimoDiaDelMes(anio: number, mes: number): string {
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${dos(mes)}-${dos(dias)}`;
}

/** `YYYY-MM` válido → [año, mes]; si no, null. */
export function leerMes(mes: string | null | undefined): [number, number] | null {
  const m = MES_RE.exec(mes ?? '');
  if (!m) return null;
  const anio = Number(m[1]);
  const n = Number(m[2]);
  return n >= 1 && n <= 12 ? [anio, n] : null;
}

export function esDiaValido(dia: string | null | undefined): dia is string {
  const m = DIA_RE.exec(dia ?? '');
  if (!m) return false;
  const [anio, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && d >= 1 && d <= Number(ultimoDiaDelMes(anio, mes).slice(8, 10));
}

/** El periodo de `periodicidad` número `indice` del año. */
export function periodoNumero(periodicidad: Periodicidad, anio: number, indice: number): PeriodoFiscal {
  const n = MESES[periodicidad];
  const mesIni = (indice - 1) * n + 1;
  const mesFin = mesIni + n - 1;
  return { periodicidad, anio, indice, desde: `${anio}-${dos(mesIni)}-01`, hasta: ultimoDiaDelMes(anio, mesFin) };
}

/** El periodo que contiene el mes `[anio, mes]`. */
export function periodoDelMes(periodicidad: Periodicidad, anio: number, mes: number): PeriodoFiscal {
  return periodoNumero(periodicidad, anio, Math.floor((mes - 1) / MESES[periodicidad]) + 1);
}

/**
 * Último periodo de `periodicidad` que ya terminó al cierre del mes `corte`
 * (`YYYY-MM`). Con corte octubre 2026: bimestral → sep–oct 2026; mensual →
 * octubre; cuatrimestral → may–ago; anual → 2025.
 */
export function periodoCerradoAl(periodicidad: Periodicidad, corte: string): PeriodoFiscal | null {
  const m = leerMes(corte);
  if (!m) return null;
  const [anio, mes] = m;
  const n = MESES[periodicidad];
  const completos = Math.floor(mes / n);
  return completos >= 1 ? periodoNumero(periodicidad, anio, completos) : periodoNumero(periodicidad, anio - 1, 12 / n);
}

/** Mes anterior al día `hoy` (`YYYY-MM-DD` → `YYYY-MM`): el corte por defecto del Centro tributario. */
export function mesAnterior(hoy: string): string {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${dos(mes - 1)}`;
}

/** Los `cuantos` periodos cerrados más recientes al corte, del más nuevo al más viejo. */
export function periodosRecientes(periodicidad: Periodicidad, corte: string, cuantos: number): PeriodoFiscal[] {
  const out: PeriodoFiscal[] = [];
  let actual = periodoCerradoAl(periodicidad, corte);
  while (actual && out.length < cuantos) {
    out.push(actual);
    const anterior = actual.indice > 1 ? periodoNumero(periodicidad, actual.anio, actual.indice - 1) : periodoNumero(periodicidad, actual.anio - 1, 12 / MESES[periodicidad]);
    actual = anterior;
  }
  return out;
}

/** El periodo exacto que forman `desde`–`hasta`, si coincide con uno de la periodicidad. */
export function periodoDeRango(periodicidad: Periodicidad, desde: string, hasta: string): PeriodoFiscal | null {
  if (!esDiaValido(desde) || !esDiaValido(hasta)) return null;
  const p = periodoDelMes(periodicidad, Number(desde.slice(0, 4)), Number(desde.slice(5, 7)));
  return p.desde === desde && p.hasta === hasta ? p : null;
}

/**
 * Etiqueta corta del periodo en el idioma: «sep–oct 2026», «octubre 2026», «2025».
 * Los nombres de mes salen de `Intl` (nada cableado por idioma).
 */
export function etiquetaPeriodo(p: Pick<PeriodoFiscal, 'desde' | 'hasta'>, locale: string): string {
  const anioIni = Number(p.desde.slice(0, 4));
  const mesIni = Number(p.desde.slice(5, 7));
  const anioFin = Number(p.hasta.slice(0, 4));
  const mesFin = Number(p.hasta.slice(5, 7));
  const nombre = (mes: number, formato: 'short' | 'long') =>
    new Intl.DateTimeFormat(locale, { month: formato, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, mes - 1, 15))).replace(/\.$/, '');
  if (anioIni === anioFin && mesIni === 1 && mesFin === 12) return String(anioIni);
  if (anioIni === anioFin && mesIni === mesFin) return `${nombre(mesIni, 'long')} ${anioIni}`;
  if (anioIni === anioFin) return `${nombre(mesIni, 'short')}–${nombre(mesFin, 'short')} ${anioIni}`;
  return `${nombre(mesIni, 'short')} ${anioIni}–${nombre(mesFin, 'short')} ${anioFin}`;
}
