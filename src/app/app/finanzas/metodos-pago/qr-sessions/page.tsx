import type { Metadata } from 'next';
import PaymentMethodsPage from '@/components/finanzas/metodos-pago/PaymentMethodsPage';

export const metadata: Metadata = {
  title: 'Métodos de pago | GO Admin ERP',
};

/**
 * Ruta antigua de «Sesiones QR» (enlazada desde las notificaciones de pago QR
 * y la guía del asistente): abre Métodos de pago en la pestaña «Cobros QR»
 * (Finanzas ronda 2, A11).
 */
export default function Page() {
  return <PaymentMethodsPage pestanaInicial="qr" />;
}
