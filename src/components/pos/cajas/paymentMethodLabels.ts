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
  mixed: 'Mixto',
  other: 'Otros',
};

export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}
