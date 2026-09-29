import { Suspense } from 'react';
import { StockPage } from '@/components/inventario/stock';

/**
 * StockPage (bloque B1). `Suspense` porque el listado lee su estado (búsqueda,
 * filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function InventarioStockPageRuta() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <StockPage />
      </Suspense>
    </div>
  );
}
