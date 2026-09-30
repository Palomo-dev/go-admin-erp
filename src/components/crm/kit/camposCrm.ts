/**
 * Piezas comunes de los formularios del kit CRM (sin React): clases de campo
 * con tokens del manual y lectura de montos escritos a mano.
 */
import type { ContextoMoneda } from '@/lib/utils/moneda';

/** Campo de texto o select de 40 px (Figma `FormField` / `Select Size=md`). */
export const CLASE_CAMPO =
  'h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-secondary aria-[invalid=true]:border-danger';

/** Área de texto (notas, mensaje). */
export const CLASE_AREA = `${CLASE_CAMPO.replace('h-10 ', '')} min-h-[96px] py-2 leading-5`;

/** Aviso informativo del manual (fondo info suave). */
export const CLASE_AVISO_INFO = 'flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2 text-[13px] leading-[18px] text-info-text';

/** Nota neutra (fondo sutil). */
export const CLASE_NOTA = 'flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-xs text-fg-secondary';

/**
 * Monto escrito a mano → número. Acepta «18.000.000», «18,000,000.50»,
 * «18000000,5», «1.250,75» y «$ 1.250.000». Vacío → null; texto no numérico → NaN.
 *
 * Regla: con los dos separadores, el último es el decimal. Con uno solo,
 * repetido es de miles; una vez seguido de exactamente 3 dígitos también es
 * de miles («18.000»); si no, decimal («1250,5»).
 */
export function parsearMonto(texto: string | null | undefined): number | null {
  const limpio = (texto ?? '').replace(/[^\d.,-]/g, '');
  if (!limpio) return null;
  if (!/\d/.test(limpio)) return NaN;
  const puntos = limpio.split('.').length - 1;
  const comas = limpio.split(',').length - 1;
  let decimal: '.' | ',' | null = null;
  if (puntos && comas) decimal = limpio.lastIndexOf('.') > limpio.lastIndexOf(',') ? '.' : ',';
  else if (puntos === 1 || comas === 1) {
    const sep = puntos ? '.' : ',';
    decimal = limpio.length - limpio.indexOf(sep) - 1 === 3 ? null : sep;
  }
  const miles = decimal === '.' ? /,/g : decimal === ',' ? /\./g : /[.,]/g;
  const normal = limpio.replace(miles, '').replace(',', '.');
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

/** Símbolo de la moneda en el locale de la organización («$», «US$», «€»). */
export function simboloMoneda(moneda: ContextoMoneda): string {
  try {
    const parte = new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: moneda.code })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return parte?.value ?? moneda.code;
  } catch {
    return moneda.code;
  }
}

/** Opción de un select con los usuarios de la organización (responsable). */
export interface OpcionUsuario {
  id: string;
  nombre: string;
}
