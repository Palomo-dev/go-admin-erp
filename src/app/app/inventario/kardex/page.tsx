import { Suspense } from 'react';
import { KardexPage } from '@/components/inventario/kardex';

/**
 * KardexPage (bloque B1). `Suspense` porque el listado lee su estado (búsqueda,
 * filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function InventarioKardexPageRuta() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <KardexPage />
      </Suspense>
    </div>
  );
}
