/**
 * Formato de importes y fechas del motor de documentos: UNA sola fuente.
 *
 * - Importes: `crearFormateadorMoneda` (`src/lib/utils/moneda.ts`) con el
 *   `ContextoMoneda` del documento (su moneda o la base de la organización,
 *   decimales del catálogo y locale del país). Nunca pesos fijos.
 * - `timestamptz` → `formatDateInTz` / `formatDateTimeInTz` con la zona de la
 *   organización (o de la sucursal, misma cascada que `fn_timezone_for`).
 * - `date` → día calendario sin conversión (regla 5 de fechas): se pinta a
 *   mediodía UTC con `timeZone: 'UTC'`, así nunca corre un día.
 * El idioma del documento solo cambia el orden y los nombres de la fecha; los
 * separadores de miles y decimales siguen el país de la organización.
 */

import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import type { IdiomaDocumento } from './tipos';

export interface Formateador {
  dinero(valor: number | string | null | undefined): string;
  /** Día calendario de un instante, en la zona del documento. */
  instante(valor: string | Date | null | undefined): string;
  /** Día y hora de un instante, en la zona del documento. */
  instanteHora(valor: string | Date | null | undefined): string;
  /** Columna `date` (`YYYY-MM-DD`): sin conversión de zona. */
  fecha(valor: string | null | undefined): string;
  numero(valor: number | string | null | undefined, decimales?: number): string;
  locale: string;
}

/** Locale de fechas y números sueltos según el idioma del documento. */
export function localeDeIdioma(idioma: IdiomaDocumento, localeMoneda: string): string {
  switch (idioma) {
    case 'en':
      return 'en-US';
    case 'fr':
      return 'fr-FR';
    case 'pt':
      return 'pt-BR';
    default:
      return localeMoneda.startsWith('es') ? localeMoneda : 'es-CO';
  }
}

const FECHA_PLANA_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

export function crearFormateador(opciones: {
  moneda: ContextoMoneda;
  zonaHoraria: string;
  idioma: IdiomaDocumento;
}): Formateador {
  const { moneda, zonaHoraria, idioma } = opciones;
  const locale = localeDeIdioma(idioma, moneda.locale);
  const formatearMoneda = crearFormateadorMoneda(moneda);
  const opcionesDia: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

  return {
    locale,
    // Intl separa símbolo e importe con espacio duro: se normaliza para que el
    // PDF y la copia de texto coincidan.
    dinero: (valor) => formatearMoneda(valor).replace(/[  ]/g, ' '),
    instante: (valor) => formatDateInTz(valor, zonaHoraria, { locale, ...opcionesDia }),
    instanteHora: (valor) => formatDateTimeInTz(valor, zonaHoraria, { locale }),
    fecha: (valor) => {
      const m = typeof valor === 'string' ? FECHA_PLANA_RE.exec(valor) : null;
      if (!m) return '';
      const mediodia = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
      return formatDateInTz(mediodia, 'UTC', { locale, ...opcionesDia });
    },
    numero: (valor, decimales) => {
      const n = typeof valor === 'number' ? valor : Number(valor);
      if (!Number.isFinite(n)) return '';
      return new Intl.NumberFormat(moneda.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimales ?? 4,
      })
        .format(n)
        .replace(/[  ]/g, ' ');
    },
  };
}
