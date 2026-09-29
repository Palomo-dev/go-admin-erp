import { Suspense } from 'react';
import { SerialesPage } from '@/components/inventario/seriales';

/**
 * Seriales. `Suspense` porque el listado lee su estado (búsqueda, filtros,
 * orden y página) de la URL con `useSearchParams`.
 */
export default function InventarioSerialesPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <SerialesPage />
      </Suspense>
    </div>
  );
}
