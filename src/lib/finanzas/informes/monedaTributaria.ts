import { monedaDelPais } from '@/lib/services/monedaOrganizacion';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

/** La jurisdicción de estos formularios es Colombia; no elige la moneda de la organización. */
export function avisoMonedaTributaria(monedaBase: string | null): string | null {
  const base = normalizarCodigoMoneda(monedaBase);
  const tributaria = monedaDelPais('CO');
  if (!base) return 'La moneda base de la organización no está verificada. No se presentan importes tributarios hasta confirmar la moneda y su conversión histórica.';
  if (!tributaria || base !== tributaria) return `La moneda base ${base} difiere de la moneda tributaria de Colombia (${tributaria ?? 'sin verificar'}). Se omiten las cifras de estos borradores hasta disponer de conversión histórica revisada; no se aplicó el cambio actual ni se presentaron importes extranjeros como pesos.`;
  return null;
}
