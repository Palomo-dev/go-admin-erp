import { diasDeSemana, primerDiaDeSemana } from '@/components/kit/calendarioLogica';
import { localeIntl } from '@/components/kit/idioma';
import type { WeekDay } from './types';

/** Domingo = 0, como `Date#getDay`. El orden visible lo da el idioma. */
const ORDEN_JS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function capitalizar(texto: string, locale: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1) : texto;
}

export interface DiaPromocion {
  value: WeekDay;
  /** «Lun», «Mon», «Lun.», «Seg.». */
  corto: string;
  /** «Lunes», «Monday», «Lundi», «Domingo». */
  largo: string;
}

/**
 * Días de la promo en el orden del manual de marca: lunes primero en español
 * y francés; domingo primero en inglés y portugués. Los nombres salen de
 * `Intl`, así el español sigue diciendo «Lunes» y «Lun».
 */
export function diasDelIdioma(locale: string): DiaPromocion[] {
  const intl = localeIntl(locale);
  const primer = primerDiaDeSemana(locale);
  let cortos: Intl.DateTimeFormat | null = null;
  try {
    cortos = new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' });
  } catch {
    cortos = null;
  }
  return diasDeSemana(locale, primer).map((nombre, i) => {
    const dow = (primer + i) % 7;
    const fecha = new Date(Date.UTC(2026, 8, 27 + dow, 12));
    const corto = cortos ? capitalizar(cortos.format(fecha), intl) : nombre.corto;
    return {
      value: ORDEN_JS[dow],
      corto,
      largo: capitalizar(nombre.largo || nombre.corto, locale),
    };
  });
}
