import { Suspense } from 'react';
import { AjustesPage } from '@/components/inventario/ajustes';

/**
 * Ajustes de inventario. `Suspense` porque el listado lee su estado (búsqueda,
 * filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function InventarioAjustesPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <AjustesPage />
      </Suspense>
    </div>
  );
}
