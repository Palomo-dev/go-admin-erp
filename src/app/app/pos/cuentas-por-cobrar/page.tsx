import { Suspense } from 'react';
import { ListadoCartera } from '@/components/finanzas/cuentas-por-cobrar/listado/ListadoCartera';

/**
 * Cuentas por cobrar del POS (D3): las mismas piezas que Finanzas, filtradas a
 * las ventas del POS, con detalle y cobro dentro del POS (sin el módulo Finanzas).
 */
export default function POSCuentasPorCobrar() {
  return (
    <Suspense fallback={null}>
      <ListadoCartera origen="pos" />
    </Suspense>
  );
}
