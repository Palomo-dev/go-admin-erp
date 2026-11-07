import type { Metadata } from 'next';
import CobrosDispersionesPage from '@/components/finanzas/payfac/CobrosDispersionesPage';

export const metadata: Metadata = {
  title: 'Cobros y dispersiones | GO Admin ERP',
};

/** Finanzas ronda 2 (A7): abre «Cobros y dispersiones» en la pestaña Dispersiones. */
export default function Page() {
  return <CobrosDispersionesPage pestanaInicial="dispersiones" />;
}
