/**
 * Formato de dinero de los tickets y documentos impresos.
 *
 * Los montos van en la moneda que trae el payload (la del documento o, en su
 * defecto, la base de la organización; la resuelve el ERP con
 * `src/lib/services/monedaOrganizacion.ts` y la manda en `currency`,
 * `locale` y `currencyDecimals`). Esta carpeta es TypeScript puro compartido
 * con el agente de escritorio y no puede importar el ERP: por eso repite aquí
 * el formateo, que es solo `Intl`.
 *
 * Nunca se suponen pesos: si el payload no trae moneda (un trabajo encolado por
 * una versión vieja del ERP), el importe sale como número sin símbolo.
 */

export interface MoneyFormat {
  /** ISO 4217 del documento (COP, USD, MXN…). */
  currency?: string;
  /** Locale de formato de la organización (`es-CO`, `es-MX`…). */
  locale?: string;
  /** Decimales de la moneda (catálogo `currencies.decimals`). */
  currencyDecimals?: number;
}

const DEFAULT_LOCALE = 'es-CO';

function validCurrency(code?: string): string | null {
  const c = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

function decimalsFor(fmt: MoneyFormat, currency: string | null): number {
  if (typeof fmt.currencyDecimals === 'number' && fmt.currencyDecimals >= 0) return fmt.currencyDecimals;
  if (!currency) return 0;
  if (currency === 'COP' || currency === 'CLP') return 0;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Devuelve el formateador de un documento.
 * - `symbol: true` (HTML): con símbolo de moneda.
 * - `symbol: false` (ESC/POS): solo el número, con separadores y decimales de
 *   la moneda; el símbolo `$` no existe en todas las páginas de códigos.
 *
 * `style: 'currency'` separa el símbolo con U+00A0 (espacio duro). Ese byte es
 * 0xA0, que las impresoras térmicas interpretan en CP437 como «á»: en papel
 * salía "$á36.480". Se normaliza a espacio normal.
 */
export function moneyFormatter(fmt: MoneyFormat | undefined, opts: { symbol: boolean }): (value: number) => string {
  const f = fmt ?? {};
  const currency = validCurrency(f.currency);
  const decimals = decimalsFor(f, currency);
  let locale = f.locale || DEFAULT_LOCALE;
  try {
    new Intl.NumberFormat(locale);
  } catch {
    locale = DEFAULT_LOCALE;
  }

  let intl: Intl.NumberFormat;
  try {
    intl = new Intl.NumberFormat(
      locale,
      opts.symbol && currency
        ? { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }
        : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
    );
  } catch {
    intl = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  return (value: number) => {
    const n = Number.isFinite(Number(value)) ? Number(value) : 0;
    return intl.format(n).replace(/[\u00a0\u202f]/g, ' ');
  };
}
