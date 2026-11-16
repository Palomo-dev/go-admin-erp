'use client';

/**
 * Horas y días de la programación en el idioma de la persona (Figma 20.8:
 * «6 a. m. – 1 p. m.», «Lun 16», «16 – 22 nov. 2026»).
 *
 * - Un instante (`start_at`, una marca) se pinta en la zona de la SEDE que
 *   devolvió el servidor (`fn_timezone_for`); nunca en la del navegador.
 * - Una hora de pared de plantilla («13:00») y un `date` («2026-11-16») no
 *   tienen zona: se pintan sin convertir (se fijan en UTC solo para dar formato).
 */
import { useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';

function sinCeros(texto: string): string {
  // «6:00 a. m.» → «6 a. m.»; «6:30 a. m.» y «13:00» (24 h) se quedan.
  return /[ap]\.?\s?m|[AP]M/i.test(texto) ? texto.replace(/:00(?=[\s ])/, '') : texto;
}

export interface FormatoHora {
  /** Instante en la zona dada: «6 a. m.», «1:30 p. m.». */
  hora: (iso: string | null | undefined, zona: string) => string;
  /** Hora de pared «HH:MM» sin zona. */
  pared: (hhmm: string | null | undefined) => string;
  /** «Lun 16» de un `date`. */
  diaCorto: (fecha: string) => string;
  /** «Lunes 16 de nov.» de un `date`. */
  diaLargo: (fecha: string) => string;
  /** «16 – 22 nov. 2026». */
  rango: (desde: string, hasta: string) => string;
  /** «diciembre de 2026». */
  mes: (fecha: string) => string;
  /** «2 nov. 2026» de un `date`. */
  fecha: (fecha: string) => string;
}

function utc(fecha: string, hhmm = '12:00'): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(a, m - 1, d, h, mi));
}

export function useFormatoHora(): FormatoHora {
  const locale = useLocale();
  const loc = locale === 'es' ? 'es-CO' : locale;
  const fmtPared = useMemo(() => new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }), [loc]);
  const fmtDiaCorto = useMemo(() => new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }), [loc]);
  const fmtDiaLargo = useMemo(() => new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }), [loc]);
  const fmtDiaMes = useMemo(() => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }), [loc]);
  const fmtMes = useMemo(() => new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }), [loc]);
  const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const hora = useCallback(
    (iso: string | null | undefined, zona: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return sinCeros(new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(d));
    },
    [loc]
  );
  const pared = useCallback((hhmm: string | null | undefined) => (hhmm ? sinCeros(fmtPared.format(utc('2000-01-01', hhmm))) : ''), [fmtPared]);
  const diaCorto = useCallback((f: string) => mayus(fmtDiaCorto.format(utc(f)).replace(/\.,?/g, '').replace(',', '')), [fmtDiaCorto]);
  const diaLargo = useCallback((f: string) => mayus(fmtDiaLargo.format(utc(f)).replace(',', '')), [fmtDiaLargo]);
  const fmtDiaMesCorto = useMemo(() => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }), [loc]);
  const fmtDia = useMemo(() => new Intl.DateTimeFormat(loc, { day: 'numeric', timeZone: 'UTC' }), [loc]);
  const rango = useCallback(
    (desde: string, hasta: string) => {
      const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
      const inicio = (mismoMes ? fmtDia : fmtDiaMesCorto).format(utc(desde));
      return `${inicio} – ${fmtDiaMes.format(utc(hasta))}`.replace(/ de /g, ' ');
    },
    [fmtDia, fmtDiaMes, fmtDiaMesCorto]
  );
  const mes = useCallback((f: string) => fmtMes.format(utc(f)), [fmtMes]);
  const fecha = useCallback((f: string) => fmtDiaMes.format(utc(f)).replace(/ de /g, ' '), [fmtDiaMes]);
  return useMemo(() => ({ hora, pared, diaCorto, diaLargo, rango, mes, fecha }), [hora, pared, diaCorto, diaLargo, rango, mes, fecha]);
}
