import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia bancaria',
  check: 'Cheque',
  credit: 'Crédito',
  stripe: 'Stripe',
  paypal: 'PayPal',
  mp: 'Mercado Pago',
  payu: 'PayU',
  wompi: 'Wompi',
  nequi: 'Nequi',
  daviplata: 'DaviPlata',
  pse: 'PSE - Pagos Seguros en Línea',
  oxxo: 'OXXO Pay',
  spei: 'SPEI',
  conekta: 'Conekta',
  venmo: 'Venmo',
  zelle: 'Zelle',
  cashapp: 'Cash App',
  '001': 'Sistecredito',
  '002': 'P. QR',
  bancolombia_qr: 'Bancolombia QR',
  breb_qr: 'Bre-B (Pago Inmediato)',
  redeban_qr: 'Redeban QR',
  bold_link: 'Bold (Link)',
  bold_qr: 'Bold QR',
  bold_card: 'Bold (Datáfono)',
  mixed: 'Mixto',
  other: 'Otros',
};

export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

/**
 * Métodos cuya etiqueta se traduce (código → clave de `cajas.detalle.metodosPago`).
 * El resto son marcas o nombres propios (Nequi, Wompi, PayU…) y se muestran igual
 * en todos los idiomas con `getPaymentMethodLabel`.
 */
const CLAVES_TRADUCIBLES: Record<string, string> = {
  cash: 'efectivo',
  card: 'tarjeta',
  transfer: 'transferencia',
  check: 'cheque',
  credit: 'credito',
  pse: 'pse',
  breb_qr: 'breb',
  bold_link: 'boldLink',
  bold_card: 'boldDatafono',
  mixed: 'mixto',
  other: 'otros',
};

/**
 * Variante traducible de `getPaymentMethodLabel` para la UI. La función en
 * español se conserva porque otros consumidores (cierre de caja, reportes) la
 * usan como dato.
 */
export function useEtiquetaMetodoPago(): (method: string) => string {
  const t = useTranslations('cajas.detalle');
  return useCallback(
    (method: string) => {
      const clave = CLAVES_TRADUCIBLES[method];
      return clave ? t(`metodosPago.${clave}`) : getPaymentMethodLabel(method);
    },
    [t],
  );
}
