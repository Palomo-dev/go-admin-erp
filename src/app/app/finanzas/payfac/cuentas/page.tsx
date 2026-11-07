import type { Metadata } from 'next';
import CobrosDispersionesPage from '@/components/finanzas/payfac/CobrosDispersionesPage';

export const metadata: Metadata = {
  title: 'Cobros y dispersiones | GO Admin ERP',
};

/** Finanzas ronda 2 (A9): abre «Cobros y dispersiones» en la pestaña Cuenta de abono. */
export default function Page() {
  return <CobrosDispersionesPage pestanaInicial="cuenta" />;
}
