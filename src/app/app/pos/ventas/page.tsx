import { Suspense } from 'react';
import { VentasPage } from '@/components/pos/ventas/VentasPage';

/**
 * Ventas del POS. `Suspense` porque el listado lee su estado de la URL
 * (`useSearchParams`); los datos los pagina el servidor (`GET /api/pos/ventas`).
 */
export default function VentasRoute() {
  return (
    <Suspense fallback={null}>
      <VentasPage />
    </Suspense>
  );
}
