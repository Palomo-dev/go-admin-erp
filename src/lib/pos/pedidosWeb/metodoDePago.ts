/**
 * Nombre del método de pago de un pedido web para la columna «Pago» y los avisos de cobro.
 * Puro (sin React ni Supabase): lo prueba __tests__/metodoDePago.test.ts.
 */
import type { WebOrder } from '@/lib/services/webOrdersService';

const METODOS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  bank_transfer: 'Transferencia',
  wompi: 'Wompi',
  wompi_co: 'Wompi',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
  card: 'Tarjeta',
  cash_on_delivery: 'Contra entrega',
  // Mercado Pago: el método se guarda con el código 'mp' (el que enlaza el ERP); los otros dos
  // son el nombre del conector y el de la pasarela.
  mp: 'Mercado Pago',
  mercadopago: 'Mercado Pago',
  mp_checkout: 'Mercado Pago',
  boton_bancolombia: 'Botón Bancolombia',
  // Bold: el link de pago (tienda web) se guarda como 'bold_link'.
  bold: 'Bold',
  bold_link: 'Bold',
  bold_qr: 'Bold QR',
  bold_card: 'Bold (datáfono)',
  stripe: 'Stripe',
  stripe_payments: 'Stripe',
  payu: 'PayU',
  payu_co: 'PayU',
  paypal: 'PayPal',
  paypal_checkout: 'PayPal',
  bancolombia_transfer: 'Bancolombia',
  bancolombia_collect: 'Bancolombia Collect',
  // Ronda de la Carta QR: se cobra con la cuenta de la mesa.
  mesa: 'En la cuenta de la mesa',
};

/** «Wompi · Nequi»: método y, si lo hay, el medio dentro de la pasarela. */
export function metodoDePago(o: Pick<WebOrder, 'payment_method' | 'payment_method_detail'>): string {
  const m = o.payment_method ? METODOS[o.payment_method] ?? o.payment_method : null;
  const d = o.payment_method_detail ? METODOS[o.payment_method_detail] ?? o.payment_method_detail : null;
  return [m, d && d !== m ? d : null].filter(Boolean).join(' · ') || '—';
}
