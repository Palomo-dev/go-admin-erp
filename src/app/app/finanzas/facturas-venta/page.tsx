import { Suspense } from 'react';
import { ListadoFacturasVenta } from '@/components/finanzas/facturas-venta/listado/ListadoFacturasVenta';

/**
 * Facturas de venta. `Suspense` porque el listado lee su estado de la URL
 * (`useSearchParams`); los datos los pagina el servidor (`GET /api/facturas-venta`).
 */
export default function FacturasVenta() {
  return (
    <Suspense fallback={null}>
      <ListadoFacturasVenta />
    </Suspense>
  );
}
