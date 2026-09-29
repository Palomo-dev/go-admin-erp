import { Suspense } from 'react';
import { MovimientosPage } from '@/components/inventario/movimientos';

/**
 * MovimientosPage (bloque B1). `Suspense` porque el listado lee su estado (búsqueda,
 * filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function InventarioMovimientosPageRuta() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <MovimientosPage />
      </Suspense>
    </div>
  );
}
