import { Suspense } from 'react';
import { LotesPage } from '@/components/inventario/lotes';

/**
 * LotesPage (bloque B1). `Suspense` porque el listado lee su estado (búsqueda,
 * filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function InventarioLotesPageRuta() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <LotesPage />
      </Suspense>
    </div>
  );
}
